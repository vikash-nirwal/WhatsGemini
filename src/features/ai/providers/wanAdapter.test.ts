import { wanAdapter } from "./wanAdapter";
import { LS_WAN_REFERENCE_MODEL } from "../../../utils/constants";

const BASE = "https://ws-1.ap-southeast-1.maas.aliyuncs.com";
const config = { apiKey: "sk-test", baseUrl: BASE };
const ref = (n: number) => ({ mimeType: "image/jpeg", data: `REF${n}` });

// jsdom's fetch Response has no static json(), so the fakes are plain
// objects with just what the adapter reads.
const reply = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: "",
  json: async () => body,
  blob: async () => new Blob(["x"], { type: "image/png" }),
});

interface Call {
  url: string;
  body?: any;
}

// Answers Wan's submit / poll / download round trip. `rejectI2i` makes the
// wan2.5-i2i-preview endpoint refuse the task, the way a region that lists
// it as image-only input might.
const mockWan = ({ rejectI2i = false } = {}) => {
  const calls: Call[] = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes("/image2image/")) {
      if (rejectI2i) {
        return reply({ code: "InvalidParameter", message: "input type not supported" }, 400);
      }
      return reply({ output: { task_id: "i2i-task", task_status: "PENDING" } });
    }
    if (url.includes("/image-generation/")) {
      return reply({ output: { task_id: "gen-task", task_status: "PENDING" } });
    }
    if (url.endsWith("/tasks/i2i-task")) {
      return reply({ output: { task_status: "SUCCEEDED", results: [{ url: "data:image/png;base64,I2I" }] } });
    }
    if (url.endsWith("/tasks/gen-task")) {
      return reply({
        output: { task_status: "SUCCEEDED", choices: [{ message: { content: [{ type: "image", image: "data:image/png;base64,GEN" }] } }] },
      });
    }
    // The result download (toDataUrl) of a data: URL.
    return reply({});
  }) as unknown as typeof fetch;
  return calls;
};

const submits = (calls: Call[]) => calls.filter((c) => c.body);

beforeEach(() => {
  localStorage.clear();
  // Skips the poll interval.
  jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof setTimeout);
});

const run = (opts: Parameters<typeof wanAdapter.generateImage>[0]) => wanAdapter.generateImage(opts, config);

test("without references it sends the main model a text-only message", async () => {
  const calls = mockWan();
  await run({ model: "wan2.6-t2i", prompt: "a cat" });
  const [submit] = submits(calls);
  expect(submit.url).toBe(`${BASE}/api/v1/services/aigc/image-generation/generation`);
  expect(submit.body.model).toBe("wan2.6-t2i");
  expect(submit.body.input.messages[0].content).toEqual([{ text: "a cat" }]);
});

test("with references it sends them as data URLs to the reference model, default wan2.7-image", async () => {
  const calls = mockWan();
  const result = await run({ model: "wan2.6-t2i", prompt: "a selfie", referenceImages: [ref(1), ref(2)] });
  const [submit] = submits(calls);
  expect(submit.body.model).toBe("wan2.7-image");
  expect(submit.body.input.messages[0].content).toEqual([
    { text: "a selfie" },
    { image: "data:image/jpeg;base64,REF1" },
    { image: "data:image/jpeg;base64,REF2" },
  ]);
  expect(result.images).toHaveLength(1);
});

test("the messages models get at most 9 references", async () => {
  const calls = mockWan();
  const many = Array.from({ length: 12 }, (_, i) => ref(i));
  await run({ model: "wan2.7-image", prompt: "p", referenceImages: many });
  const content = submits(calls)[0].body.input.messages[0].content;
  expect(content.filter((c: any) => c.image)).toHaveLength(9);
});

test("wan2.5-i2i-preview gets its own endpoint with prompt plus at most 3 images", async () => {
  localStorage.setItem(LS_WAN_REFERENCE_MODEL, "wan2.5-i2i-preview");
  const calls = mockWan();
  const result = await run({ model: "wan2.6-t2i", prompt: "p", referenceImages: [ref(1), ref(2), ref(3), ref(4)] });
  const [submit] = submits(calls);
  expect(submit.url).toBe(`${BASE}/api/v1/services/aigc/image2image/image-synthesis`);
  expect(submit.body).toEqual({
    model: "wan2.5-i2i-preview",
    input: { prompt: "p", images: ["data:image/jpeg;base64,REF1", "data:image/jpeg;base64,REF2", "data:image/jpeg;base64,REF3"] },
    parameters: { n: 1 },
  });
  expect(result.images).toHaveLength(1);
});

test("a rejected wan2.5-i2i-preview task retries once on wan2.7-image", async () => {
  localStorage.setItem(LS_WAN_REFERENCE_MODEL, "wan2.5-i2i-preview");
  const calls = mockWan({ rejectI2i: true });
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const result = await run({ model: "wan2.6-t2i", prompt: "p", referenceImages: [ref(1)] });
  const [first, second] = submits(calls);
  expect(first.url).toContain("/image2image/");
  expect(second.url).toContain("/image-generation/");
  expect(second.body.model).toBe("wan2.7-image");
  expect(second.body.input.messages[0].content).toContainEqual({ image: "data:image/jpeg;base64,REF1" });
  expect(result.images).toHaveLength(1);
});

test("the reference model 'none' keeps the call text-only", async () => {
  localStorage.setItem(LS_WAN_REFERENCE_MODEL, "none");
  const calls = mockWan();
  await run({ model: "wan2.6-t2i", prompt: "p", referenceImages: [ref(1)] });
  const [submit] = submits(calls);
  expect(submit.body.model).toBe("wan2.6-t2i");
  expect(submit.body.input.messages[0].content).toEqual([{ text: "p" }]);
});

test("a group picture interleaves each character's photos and names them in the prompt", async () => {
  const calls = mockWan();
  await run({
    model: "wan2.6-t2i",
    prompt: "us together",
    referenceCharacters: [
      { name: "Aria", images: [ref(1), ref(2)] },
      { name: "Ben", images: [ref(3)] },
    ],
  });
  const content = submits(calls)[0].body.input.messages[0].content;
  expect(content.slice(1)).toEqual([
    { image: "data:image/jpeg;base64,REF1" },
    { image: "data:image/jpeg;base64,REF3" },
    { image: "data:image/jpeg;base64,REF2" },
  ]);
  expect(content[0].text).toContain("image 1 is Aria; image 2 is Ben; image 3 is Aria");
  expect(content[0].text).toContain("us together");
});
