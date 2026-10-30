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
  await expect(falImageAdapter.generateImage({ model: "fal-ai/flux-pro/kontext", prompt: "p" }, config)).rejects.toThrow("fal.ai error: prompt: field required");
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

test("an edit model saved to run without a photo falls back to its text-to-image sibling (2026-10-27)", async () => {
  // How Nano Banana Pro edit was set up from its schema, which marks only the prompt required.
  localStorage.setItem("fal_custom_models", JSON.stringify({
    "fal-ai/nano-banana-pro/edit": { label: "Nano Banana Pro edit", referenceEndpoint: "fal-ai/nano-banana-pro/edit", referenceField: "image_urls", maxReferences: 4, referenceSize: "aspect_ratio", textEndpoint: "fal-ai/nano-banana-pro/edit", textSize: "aspect_ratio" },
  }));
  const ok = mockFal();
  const answer = global.fetch as jest.Mock;
  global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (String(input) === "https://queue.fal.run/fal-ai/nano-banana-pro/edit") return reply({ detail: [{ loc: ["body", "image_urls"], msg: "Field required" }] }, 422);
    return answer(input, init);
  }) as unknown as typeof fetch;
  const result = await falImageAdapter.generateImage({ model: "fal-ai/nano-banana-pro/edit", prompt: "a cat", aspectRatio: "3:4" }, config);
  expect(result.images).toHaveLength(1);
  expect(submitOf(ok).url).toBe("https://queue.fal.run/fal-ai/nano-banana-pro");
  expect(submitOf(ok).body).toEqual({ prompt: "a cat", aspect_ratio: "3:4" });
});

test("Seedream's own wording for a missing photo also falls back", async () => {
  localStorage.setItem("fal_custom_models", JSON.stringify({
    "fal-ai/bytedance/seedream/v4.5/edit-x": { label: "Seedream edit", referenceEndpoint: "fal-ai/bytedance/seedream/v4.5/edit-x", referenceField: "image_urls", maxReferences: 10, referenceSize: "image_size", textEndpoint: "fal-ai/bytedance/seedream/v4.5/edit-x", textSize: "image_size" },
  }));
  const ok = mockFal();
  const answer = global.fetch as jest.Mock;
  global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (String(input) === "https://queue.fal.run/fal-ai/bytedance/seedream/v4.5/edit-x") return reply({ detail: [{ loc: ["body", "image_urls"], msg: "At least one image URL is required.", type: "value_error", input: [] }] }, 422);
    return answer(input, init);
  }) as unknown as typeof fetch;
  const result = await falImageAdapter.generateImage({ model: "fal-ai/bytedance/seedream/v4.5/edit-x", prompt: "a cat" }, config);
  expect(result.images).toHaveLength(1);
  expect(submitOf(ok).url).not.toBe("https://queue.fal.run/fal-ai/bytedance/seedream/v4.5/edit-x");
  localStorage.removeItem("fal_custom_models");
});

test("says which field fal wanted", async () => {
  global.fetch = jest.fn(async () => reply({ detail: [{ loc: ["body", "image_urls"], msg: "Field required" }] }, 422)) as unknown as typeof fetch;
  await expect(falImageAdapter.generateImage({ model: "fal-ai/bytedance/seedream/v4/edit", prompt: "p" }, config)).rejects.toThrow("image_urls: Field required");
});

// The user's report, 2026-10-28: a model picked from fal's list whose
// schema hid its photo field was saved as needing none, so it ran with a
// prompt only and failed with no way out.
describe("a model set up as needing no photo that needs one", () => {
  const hidden = { label: "Edit", referenceEndpoint: "fal-ai/some/edit", referenceField: "image_url", maxReferences: 0, referenceSize: "image_size", textEndpoint: "fal-ai/some/edit", textSize: "image_size" };
  const failsWithoutPhoto = () => {
    const ok = mockFal();
    const answer = global.fetch as jest.Mock;
    global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      if (String(input) === "https://queue.fal.run/fal-ai/some/edit" && !body?.image_urls?.length) return reply({ detail: [{ loc: ["body", "image_urls"], msg: "At least one image URL is required." }] }, 422);
      return answer(input, init);
    }) as unknown as typeof fetch;
    return ok;
  };
  beforeEach(() => localStorage.setItem("fal_custom_models", JSON.stringify({ "fal-ai/some/edit": hidden })));
  afterEach(() => localStorage.removeItem("fal_custom_models"));

  it("sends the reference photos in the field fal named, and remembers it", async () => {
    const calls = failsWithoutPhoto();
    const result = await falImageAdapter.generateImage({ model: "fal-ai/some/edit", prompt: "a selfie", referenceImages: [ref(1), ref(2)] }, config);
    expect(result.images).toHaveLength(1);
    expect(submitOf(calls).body.image_urls).toEqual(["https://v3b.fal.media/files/ref-1.jpg", "https://v3b.fal.media/files/ref-2.jpg"]);
    expect(JSON.parse(localStorage.getItem("fal_custom_models")!)["fal-ai/some/edit"]).toMatchObject({ referenceField: "image_urls", maxReferences: 4, textEndpoint: "fal-ai/bytedance/seedream/v4/text-to-image" });
  });

  it("without photos falls back to its text sibling, then the default text model", async () => {
    let calls = failsWithoutPhoto();
    expect((await falImageAdapter.generateImage({ model: "fal-ai/some/edit", prompt: "a street" }, config)).images).toHaveLength(1);
    expect(submitOf(calls).url).toBe("https://queue.fal.run/fal-ai/some");
    // With no sibling to be found, the default text model.
    calls = failsWithoutPhoto();
    const answer = global.fetch as jest.Mock;
    global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => (/fal-ai\/some(\/text-to-image)?$/.test(String(input)) ? reply({ detail: "Not Found" }, 404) : answer(input, init))) as unknown as typeof fetch;
    expect((await falImageAdapter.generateImage({ model: "fal-ai/some/edit", prompt: "a street" }, config)).images).toHaveLength(1);
    expect(submitOf(calls).url).toBe("https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image");
  });
});

test("reads the missing photo field from fal's message", () => {
  const { missingPhotoField } = require("./falImageAdapter");
  expect(missingPhotoField("fal.ai error: image_urls: At least one image URL is required.")).toBe("image_urls");
  expect(missingPhotoField("fal.ai error: image_url: Field required")).toBe("image_url");
  expect(missingPhotoField("fal.ai error: prompt: field required")).toBeUndefined();
});

describe("fal's safety checker", () => {
  const harm = { harassment: "BLOCK_NONE", hate_speech: "BLOCK_NONE", sexual: "BLOCK_NONE", dangerous: "BLOCK_NONE" };

  it("is left to fal's default unless switched off", async () => {
    const calls = mockFal();
    await falImageAdapter.generateImage({ model: "fal-ai/bytedance/seedream/v4/edit", prompt: "a cat", safetySettings: harm }, config);
    expect(submitOf(calls).body).not.toHaveProperty("enable_safety_checker");
  });

  it("is turned off when the switch is off", async () => {
    const calls = mockFal();
    await falImageAdapter.generateImage({ model: "fal-ai/bytedance/seedream/v4/edit", prompt: "a cat", safetySettings: { ...harm, falSafetyChecker: false } }, config);
    expect(submitOf(calls).body.enable_safety_checker).toBe(false);
    expect(submitOf(calls).body).not.toHaveProperty("safety_tolerance");
  });

  it("FLUX pro also gets the loosest tolerance", async () => {
    const calls = mockFal();
    await falImageAdapter.generateImage({ model: "fal-ai/flux-pro/kontext", prompt: "p", referenceImages: [ref(1)], safetySettings: { ...harm, falSafetyChecker: false } }, config);
    expect(submitOf(calls).body).toMatchObject({ enable_safety_checker: false, safety_tolerance: "5" });
  });
});

describe("SDXL with your own checkpoint (fal-ai/lora)", () => {
  const saveLora = (s: object) => localStorage.setItem("fal_lora_settings", JSON.stringify(s));
  afterEach(() => localStorage.removeItem("fal_lora_settings"));

  it("sends the checkpoint, LoRAs and the face photo through IP-Adapter", async () => {
    saveLora({ checkpoint: "someone/illustrious-xl", loras: [{ path: "https://huggingface.co/a/b/resolve/main/style.safetensors", scale: 0.7 }, { path: " ", scale: 1 }], negativePrompt: "blurry", keepFace: true });
    const calls = mockFal();
    await falImageAdapter.generateImage({ model: "fal-ai/lora", prompt: "1girl, smiling", referenceImages: [ref(1), ref(2)], aspectRatio: "3:4" }, config);
    const submit = submitOf(calls);
    expect(submit.url).toBe("https://queue.fal.run/fal-ai/lora");
    expect(submit.body).toMatchObject({
      model_name: "someone/illustrious-xl",
      prompt: "1girl, smiling",
      negative_prompt: "blurry",
      loras: [{ path: "https://huggingface.co/a/b/resolve/main/style.safetensors", scale: 0.7 }],
      image_size: "portrait_4_3",
      image_encoder_path: "h94/IP-Adapter",
    });
    expect(submit.body.ip_adapter).toEqual([expect.objectContaining({ ip_adapter_image_url: "https://v3b.fal.media/files/ref-1.jpg", path: "h94/IP-Adapter" })]);
    // Only the main photo is uploaded.
    expect(calls.filter((c) => c.url.includes("/storage/upload/initiate"))).toHaveLength(1);
  });

  it("leaves the face out when Keep the face is off", async () => {
    saveLora({ checkpoint: "someone/xl", loras: [], negativePrompt: "", keepFace: false });
    const calls = mockFal();
    await falImageAdapter.generateImage({ model: "fal-ai/lora", prompt: "p", referenceImages: [ref(1)], safetySettings: { harassment: "", hate_speech: "", sexual: "", dangerous: "", falSafetyChecker: false } }, config);
    const submit = submitOf(calls);
    expect(submit.body).not.toHaveProperty("ip_adapter");
    expect(submit.body).not.toHaveProperty("loras");
    expect(submit.body.enable_safety_checker).toBe(false);
    expect(calls.filter((c) => c.url.includes("/storage/upload/initiate"))).toHaveLength(0);
  });

  it("asks for a checkpoint before sending anything", async () => {
    const calls = mockFal();
    await expect(falImageAdapter.generateImage({ model: "fal-ai/lora", prompt: "p", referenceImages: [ref(1)] }, config)).rejects.toThrow(/checkpoint/);
    expect(calls).toHaveLength(0);
  });
});
