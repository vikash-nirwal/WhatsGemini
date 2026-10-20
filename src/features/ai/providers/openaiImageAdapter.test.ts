import { openaiImageAdapter } from "./openaiImageAdapter";

const config = { apiKey: "sk-test" };
const ref = (n: number) => ({ mimeType: "image/jpeg", data: btoa(`REF${n}`) });

interface Call {
  url: string;
  init: RequestInit;
}

// jsdom's fetch Response has no static json(), so the fake is a plain object
// with just what the adapter reads.
const mockOpenAi = () => {
  const calls: Call[] = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init || {} });
    return { ok: true, status: 200, statusText: "", json: async () => ({ data: [{ b64_json: "OUT" }] }) };
  }) as unknown as typeof fetch;
  return calls;
};

test("without references it calls the generations endpoint with JSON", async () => {
  const calls = mockOpenAi();
  const result = await openaiImageAdapter.generateImage({ model: "gpt-image-1-mini", prompt: "a cat" }, config);
  expect(calls[0].url).toBe("https://api.openai.com/v1/images/generations");
  expect(JSON.parse(String(calls[0].init.body))).toEqual({ model: "gpt-image-1-mini", prompt: "a cat", n: 1 });
  expect(result.images).toEqual(["data:image/png;base64,OUT"]);
});

test("with references a GPT image model calls the edits endpoint with every reference as image[]", async () => {
  const calls = mockOpenAi();
  await openaiImageAdapter.generateImage(
    { model: "gpt-image-1-mini", prompt: "a selfie", referenceImages: [ref(1), { mimeType: "image/png", data: btoa("REF2") }] },
    config
  );
  expect(calls[0].url).toBe("https://api.openai.com/v1/images/edits");
  const form = calls[0].init.body as FormData;
  expect(form.get("model")).toBe("gpt-image-1-mini");
  expect(form.get("prompt")).toBe("a selfie");
  // The mini model only supports low fidelity, so the parameter is left out.
  expect(form.get("input_fidelity")).toBeNull();
  const images = form.getAll("image[]") as File[];
  expect(images.map((f) => f.name)).toEqual(["reference-1.jpg", "reference-2.png"]);
  expect(images.map((f) => f.type)).toEqual(["image/jpeg", "image/png"]);
  expect(images[0].size).toBe("REF1".length);
  // The browser has to set the multipart boundary itself.
  expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
});

test("gpt-image-1 asks for high input fidelity, gpt-image-2 doesn't", async () => {
  const calls = mockOpenAi();
  await openaiImageAdapter.generateImage({ model: "gpt-image-1", prompt: "p", referenceImages: [ref(1)] }, config);
  await openaiImageAdapter.generateImage({ model: "gpt-image-2", prompt: "p", referenceImages: [ref(1)] }, config);
  expect((calls[0].init.body as FormData).get("input_fidelity")).toBe("high");
  expect((calls[1].init.body as FormData).get("input_fidelity")).toBeNull();
});

test("at most 16 references are sent", async () => {
  const calls = mockOpenAi();
  const many = Array.from({ length: 20 }, (_, i) => ref(i));
  await openaiImageAdapter.generateImage({ model: "gpt-image-1", prompt: "p", referenceImages: many }, config);
  expect((calls[0].init.body as FormData).getAll("image[]")).toHaveLength(16);
});

test("DALL-E stays text-only even with references", async () => {
  const calls = mockOpenAi();
  await openaiImageAdapter.generateImage({ model: "dall-e-3", prompt: "p", referenceImages: [ref(1)] }, config);
  expect(calls[0].url).toBe("https://api.openai.com/v1/images/generations");
});

test("a group picture names whose photo is whose", async () => {
  const calls = mockOpenAi();
  await openaiImageAdapter.generateImage(
    { model: "gpt-image-1", prompt: "us", referenceCharacters: [{ name: "Aria", images: [ref(1)] }, { name: "Ben", images: [ref(2)] }] },
    config
  );
  const form = calls[0].init.body as FormData;
  expect(form.getAll("image[]")).toHaveLength(2);
  expect(form.get("prompt")).toContain("image 1 is Aria; image 2 is Ben");
});
