import { deriveImagePrompt } from "./imageGeneration";

// The real registry pulls in provider SDKs that Jest can't load (ESM-only);
// deriveImagePrompt doesn't use it.
jest.mock("../providers/registry", () => ({ IMAGE_PROVIDERS: {} }));
import { ChatProviderAdapter } from "../providers/types";

// #34: the image prompt writer is told the locked look, and the final prompt
// carries it word for word even when the model paraphrases it away.

const MIRA = { name: "Mira", visualTags: "early 20s, pale skin, long silver hair, violet eyes, scar over left eyebrow" };

const fakeAdapter = (reply: string, seen: string[]): ChatProviderAdapter => ({
  id: "fake",
  capabilities: { requiresApiKey: false, requiresBaseUrl: false } as any,
  generateChat: async (opts: any) => {
    seen.push(opts.prompt);
    return { text: reply };
  },
  generateOnce: async () => ({ text: "" }),
} as any);

const derive = (adapter: ChatProviderAdapter, useSdWebui: boolean, existingImagePrompt?: string) =>
  deriveImagePrompt(adapter, {} as any, "m", {}, [], "Send me a selfie", "anime style", "", useSdWebui, existingImagePrompt, undefined, undefined, false, false, undefined, [MIRA]);

describe("deriveImagePrompt with a locked look", () => {
  it("tells the model the locked look and keeps the model's own wording when it complied", async () => {
    const seen: string[] = [];
    const reply = `PROMPT:\nMira: ${MIRA.visualTags}, smiling at a cafe window\n\nSUMMARY:\nHere you go!`;
    const result = await derive(fakeAdapter(reply, seen), false);
    expect(seen[0]).toContain("word for word");
    expect(seen[0]).toContain(`- Mira: ${MIRA.visualTags}`);
    expect(result.derivedImagePrompt).toBe(`Mira: ${MIRA.visualTags}, smiling at a cafe window`);
  });

  it("puts the look back when the model paraphrased it", async () => {
    const reply = "PROMPT:\na silver-haired girl smiling at a cafe window\n\nSUMMARY:\nHere you go!";
    const result = await derive(fakeAdapter(reply, []), false);
    expect(result.derivedImagePrompt).toBe(`Mira: ${MIRA.visualTags}. a silver-haired girl smiling at a cafe window`);
  });

  it("uses tag style for Stable Diffusion", async () => {
    const reply = "PROMPT:\n1girl, cafe, smiling\nPARAMS:\n{}\nSUMMARY:\nok";
    const result = await derive(fakeAdapter(reply, []), true);
    expect(result.derivedImagePrompt).toBe(`${MIRA.visualTags}, 1girl, cafe, smiling`);
  });

  it("adds the look to a redraw of an older prompt", async () => {
    const result = await derive(fakeAdapter("", []), false, "a girl at a cafe");
    expect(result.derivedImagePrompt).toContain(MIRA.visualTags);
  });
});
