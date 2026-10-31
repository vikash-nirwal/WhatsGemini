import { generateImage } from "./imageGeneration";
import { generateVideo } from "./videoGeneration";

// No names reach the image or video model (hideNames.ts), including people
// who aren't references: you, and anyone here without photos (2026-10-31).

const sent: string[] = [];
jest.mock("../providers/registry", () => ({
  IMAGE_PROVIDERS: { fake: { generateImage: async (opts: any) => { sent.push(opts.prompt); return { images: ["img"] }; } } },
  VIDEO_PROVIDERS: { fake: { generateVideo: async (opts: any) => { sent.push(opts.prompt); return { videos: ["vid"] }; } } },
}));
jest.mock("./imageProcessing", () => ({ appendCharacterImages: async (images: string[]) => images }));

const draw = (prompt: string, alsoHide?: string[], others?: { name: string; images: string[] }[]) =>
  generateImage("fake", {} as any, false, "m", prompt, {}, undefined, "Aria Vale", {} as any, undefined, undefined, undefined, others, undefined, undefined, undefined, undefined, alsoHide);

beforeEach(() => { sent.length = 0; });

test("you and the others without photos are labelled too", async () => {
  await draw("Aria Vale: silver hair. Kai: red coat. Aria hugs Vikash and Kai at the harbour.", ["Kai", "Vikash Nirwal", "Lena"]);
  expect(sent[0]).toBe("person 1: silver hair. person 2: red coat. person 1 hugs person 3 and person 2 at the harbour.");
});

test("someone who doesn't come up leaves the one person as the character", async () => {
  await draw("Aria waving at the camera", ["Vikash Nirwal", "Lena"]);
  expect(sent[0]).toBe("the character waving at the camera");
});

test("a video gets no names either", async () => {
  await generateVideo("fake", {} as any, "v", "Aria walks with Vikash along the pier", undefined, ["Aria Vale", "Vikash", undefined]);
  expect(sent[0]).toBe("person 1 walks with person 2 along the pier");
});
