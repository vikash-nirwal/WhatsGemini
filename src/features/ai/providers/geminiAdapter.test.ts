import { geminiAdapter } from "./geminiAdapter";

const sentConfigs: any[] = [];

// Stands in for the SDK: rejects any request carrying a penalty, the way
// gemini-2.5-pro answers ("Penalty is not enabled for models/...").
// A plain class rather than jest.fn(): this project's Jest config resets
// mock implementations before each test.
jest.mock("@google/genai", () => ({
  GoogleGenAI: class {
    chats = {
      create: () => ({
        sendMessageStream: async ({ config }: { config: any }) => {
          sentConfigs.push(config);
          if (config.frequencyPenalty || config.presencePenalty) {
            throw new Error('{"error":{"code":400,"message":"Penalty is not enabled for models/gemini-2.5-pro","status":"INVALID_ARGUMENT"}}');
          }
          return (async function* () {
            yield { text: "Hello." };
          })();
        },
      }),
    };
  },
  HarmCategory: {},
  HarmBlockThreshold: {},
}));

const call = () =>
  geminiAdapter.generateChat(
    { model: "gemini-2.5-pro", history: [], prompt: "hi", samplers: { frequencyPenalty: 0.3, topP: 0.9 } },
    { apiKey: "k" }
  );

describe("geminiAdapter penalties", () => {
  beforeEach(() => {
    sentConfigs.length = 0;
  });

  it("retries without penalties when the model rejects them, keeping the other samplers", async () => {
    const result = await call();
    expect(result.text).toBe("Hello.");
    expect(sentConfigs).toHaveLength(2);
    expect(sentConfigs[0].frequencyPenalty).toBe(0.3);
    expect(sentConfigs[1].frequencyPenalty).toBeUndefined();
    expect(sentConfigs[1].topP).toBe(0.9);
  });

  it("skips penalties for that model on later calls", async () => {
    await call();
    expect(sentConfigs).toHaveLength(1);
    expect(sentConfigs[0].frequencyPenalty).toBeUndefined();
  });
});
