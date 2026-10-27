import { falImageAdapter } from "./falImageAdapter";
import { ContentBlockedError } from "./types";

const config = { apiKey: "fal-key" };
const ref = (n: number) => ({ mimeType: "image/jpeg", data: btoa(`REF${n}`) });

interface Call {
  url: string;
  init: RequestInit;
  body?: any;
}

// jsdom's fetch Response has no static json(), so the fakes are plain
// objects with just what the adapter reads.
const reply = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: "",
  json: async () => body,
  blob: async () => new Blob(["x"], { type: "image/png" }),
});

// Answers the upload (initiate + PUT), queue submit, one IN_PROGRESS poll,
// COMPLETED and the result. `failUpload` makes the CDN upload refuse.
const mockFal = ({ failUpload = false, output = { images: [{ url: "data:image/png;base64,OUT" }] } as any } = {}) => {
  const calls: Call[] = [];
  let polls = 0;
  let uploads = 0;
  global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    let body: any;
    if (typeof init.body === "string") body = JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.startsWith("https://rest.fal.ai/storage/upload/initiate")) {
      if (failUpload) return reply({ detail: "nope" }, 500);
      uploads++;
      return reply({ upload_url: `https://v3b.fal.media/upload/${uploads}`, file_url: `https://v3b.fal.media/files/ref-${uploads}.jpg` });
    }
    if (url.startsWith("https://v3b.fal.media/upload/")) return reply({});
    if (url.startsWith("https://queue.fal.run/") && init.method === "POST") {
      return reply({
        request_id: "req-1",
        status_url: "https://queue.fal.run/fal-ai/app/requests/req-1/status",
        response_url: "https://queue.fal.run/fal-ai/app/requests/req-1",
        cancel_url: "https://queue.fal.run/fal-ai/app/requests/req-1/cancel",
      });
    }
    if (url.endsWith("/status")) {
      polls++;
      return reply({ status: polls < 2 ? "IN_PROGRESS" : "COMPLETED" });
    }
    if (url.endsWith("/requests/req-1")) return reply(output);
    return reply({}, 404);
  }) as unknown as typeof fetch;
  return calls;
};

const submitOf = (calls: Call[]) => calls.find((c) => c.url.startsWith("https://queue.fal.run/") && c.init.method === "POST")!;

beforeEach(() => {
  // Skips the poll interval.
  jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof setTimeout);
});

test("without references Seedream uses its text-to-image endpoint", async () => {
  const calls = mockFal();
  const result = await falImageAdapter.generateImage({ model: "fal-ai/bytedance/seedream/v4/edit", prompt: "a cat", aspectRatio: "3:4" }, config);
  const submit = submitOf(calls);
  expect(submit.url).toBe("https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image");
  expect(submit.body).toEqual({ prompt: "a cat", image_size: "portrait_4_3" });
  expect((submit.init.headers as Record<string, string>).Authorization).toBe("Key fal-key");
  // Polls through the URLs fal returned, then fetches the result.
  expect(calls.filter((c) => c.url.endsWith("/status"))).toHaveLength(2);
  expect(result.images).toEqual(["data:image/png;base64,OUT"]);
});

test("Seedream edit uploads every reference to fal's CDN and sends the URLs", async () => {
  const calls = mockFal();
  await falImageAdapter.generateImage({ model: "fal-ai/bytedance/seedream/v4/edit", prompt: "a selfie", referenceImages: [ref(1), ref(2)] }, config);
  const initiates = calls.filter((c) => c.url.includes("/storage/upload/initiate"));
  expect(initiates.map((c) => c.body)).toEqual([
    { content_type: "image/jpeg", file_name: "reference-1.jpg" },
    { content_type: "image/jpeg", file_name: "reference-2.jpg" },
  ]);
  const puts = calls.filter((c) => c.init.method === "PUT");
  expect(puts).toHaveLength(2);
  expect((puts[0].init.body as Blob).size).toBe("REF1".length);
  const submit = submitOf(calls);
  expect(submit.url).toBe("https://queue.fal.run/fal-ai/bytedance/seedream/v4/edit");
  expect(submit.body.image_urls).toEqual(["https://v3b.fal.media/files/ref-1.jpg", "https://v3b.fal.media/files/ref-2.jpg"]);
  expect(submit.body.prompt).toBe("a selfie");
});

test("Seedream gets at most 10 references", async () => {
  const calls = mockFal();
  const many = Array.from({ length: 14 }, (_, i) => ref(i));
  await falImageAdapter.generateImage({ model: "fal-ai/bytedance/seedream/v4/edit", prompt: "p", referenceImages: many }, config);
  expect(submitOf(calls).body.image_urls).toHaveLength(10);
});

test("FLUX Kontext pro sends only the main reference as image_url, with the aspect ratio", async () => {
  const calls = mockFal();
  await falImageAdapter.generateImage({ model: "fal-ai/flux-pro/kontext", prompt: "p", referenceImages: [ref(1), ref(2)], aspectRatio: "3:4" }, config);
  const submit = submitOf(calls);
  expect(submit.url).toBe("https://queue.fal.run/fal-ai/flux-pro/kontext");
  expect(submit.body).toEqual({ prompt: "p", image_url: "https://v3b.fal.media/files/ref-1.jpg", aspect_ratio: "3:4" });
  expect(calls.filter((c) => c.url.includes("/storage/upload/initiate"))).toHaveLength(1);
});

test("FLUX Kontext dev falls back to FLUX.1 dev without references", async () => {
  const calls = mockFal();
  await falImageAdapter.generateImage({ model: "fal-ai/flux-kontext/dev", prompt: "p" }, config);
  expect(submitOf(calls).url).toBe("https://queue.fal.run/fal-ai/flux/dev");
});

test("PuLID sends the main reference as reference_image_url", async () => {
  const calls = mockFal();
  await falImageAdapter.generateImage({ model: "fal-ai/flux-pulid", prompt: "p", referenceImages: [ref(1)] }, config);
  expect(submitOf(calls).body.reference_image_url).toBe("https://v3b.fal.media/files/ref-1.jpg");
});

test("a failed upload sends the reference inline as a data URI", async () => {
  const calls = mockFal({ failUpload: true });
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await falImageAdapter.generateImage({ model: "fal-ai/flux-pro/kontext", prompt: "p", referenceImages: [ref(1)] }, config);
  expect(submitOf(calls).body.image_url).toBe(`data:image/jpeg;base64,${btoa("REF1")}`);
});

test("a model from another provider falls back to Seedream 4", async () => {
  const calls = mockFal();
  await falImageAdapter.generateImage({ model: "gpt-image-1", prompt: "p", referenceImages: [ref(1)] }, config);
  expect(submitOf(calls).url).toBe("https://queue.fal.run/fal-ai/bytedance/seedream/v4/edit");
});

test("a group picture interleaves the characters and names them", async () => {
  const calls = mockFal();
  await falImageAdapter.generateImage(
    { model: "fal-ai/bytedance/seedream/v4/edit", prompt: "us", referenceCharacters: [{ name: "Aria", images: [ref(1), ref(2)] }, { name: "Ben", images: [ref(3)] }] },
    config
  );
  const submit = submitOf(calls);
  expect(submit.body.image_urls).toHaveLength(3);
  expect(submit.body.prompt).toContain("image 1 is Aria; image 2 is Ben; image 3 is Aria");
});

test("an image flagged by the safety checker is reported as blocked", async () => {
  mockFal({ output: { images: [{ url: "data:image/png;base64,BLACK" }], has_nsfw_concepts: [true] } });
  await expect(falImageAdapter.generateImage({ model: "fal-ai/flux-pro/kontext", prompt: "p" }, config)).rejects.toBeInstanceOf(ContentBlockedError);
});

test("a rejected submission surfaces fal's validation message", async () => {
  global.fetch = jest.fn(async () => reply({ detail: [{ loc: ["body", "prompt"], msg: "field required" }] }, 422)) as unknown as typeof fetch;
  await expect(falImageAdapter.generateImage({ model: "fal-ai/flux-pro/kontext", prompt: "p" }, config)).rejects.toThrow("fal.ai error: field required");
});

test("a model picked from fal's list is called the way its schema says (2026-10-27)", async () => {
  localStorage.setItem("fal_custom_models", JSON.stringify({
    "fal-ai/nano-banana-pro/edit": { label: "Nano Banana Pro edit", referenceEndpoint: "fal-ai/nano-banana-pro/edit", referenceField: "image_urls", maxReferences: 4, referenceSize: "aspect_ratio", textEndpoint: "fal-ai/nano-banana-pro", textSize: "image_size" },
  }));
  let calls = mockFal();
  await falImageAdapter.generateImage({ model: "fal-ai/nano-banana-pro/edit", prompt: "a cat", aspectRatio: "3:4" }, config);
  expect(submitOf(calls).url).toBe("https://queue.fal.run/fal-ai/nano-banana-pro");
  expect(submitOf(calls).body).toEqual({ prompt: "a cat", image_size: "portrait_4_3" });
  calls = mockFal();
  await falImageAdapter.generateImage({ model: "fal-ai/nano-banana-pro/edit", prompt: "a cat", aspectRatio: "3:4", referenceImages: [ref(1), ref(2)] } as any, config);
  const submit = submitOf(calls);
  expect(submit.url).toBe("https://queue.fal.run/fal-ai/nano-banana-pro/edit");
  expect(submit.body.image_urls).toHaveLength(2);
  expect(submit.body.aspect_ratio).toBe("3:4");
  localStorage.removeItem("fal_custom_models");
});
