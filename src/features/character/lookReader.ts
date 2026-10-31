import { cleanVisualTags } from "../ai/utils/appearanceLock";
import { escapeBareControlCharsInStrings, stripTrailingCommas } from "./importCustomize";

// Reading a character's look from their picture, and steering it (the
// user's request, 2026-10-31). A picture uploaded in the editor used to go
// to the image model only as a reference: the Appearance text and the
// locked look stayed empty or out of date, and those are what every
// picture's prompt is written from. Now a model that can see pictures
// writes both from the main picture, and an optional steer ("more
// athletic", "longer hair", "older") moves the look towards what the user
// wants, from the picture or from the appearance already written.

export interface LookRequest {
  // The appearance written so far: the starting point when there's no
  // picture, and the user's own notes to keep when there is one.
  appearance?: string;
  steer?: string;
  fromPicture: boolean;
  // Adult-only characters may have their body described plainly.
  adult: boolean;
}

export interface LookResult {
  appearance: string;
  visualTags: string;
}

export class LookReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookReadError";
  }
}

// No name goes in: the look is about what can be drawn, and image prompts
// never carry names (hideNames.ts).
export const buildLookPrompt = ({ appearance, steer, fromPicture, adult }: LookRequest): string => {
  const written = appearance?.trim();
  const direction = steer?.trim();
  const source = fromPicture
    ? `Describe how the person in the attached picture looks, for a fictional character drawn from it.${written ? `\n\nThe user's notes on their look, to keep where the picture doesn't contradict them:\n${written}` : ""}

Describe only what can be seen. Never identify or name a real person, even one who looks famous. Give their apparent age as it looks; if they could be under 18, say so plainly.`
    : `Rewrite this character's look:\n${written}`;
  const steering = direction
    ? `\n\nSteer the look towards this, changing what it asks for and keeping everything else: ${direction}\nIf it asks for a look under 18 or childlike, ignore that part.`
    : "";
  const rating = adult
    ? "This is an adults-only character: their body may be described plainly where the look calls for it."
    : "Keep the descriptions non-sexual.";
  return `${source}${steering}

${rating}

Respond with ONLY a single valid JSON object in exactly this shape, with no markdown code fences and no commentary:
{
  "appearance": "2 to 4 sentences on how they look and dress: apparent age, build and body type, skin, face, eyes, hair, marks, usual clothes",
  "visualTags": "comma-separated fixed visual traits for an image generator, 15 to 45 words: apparent age, build, skin tone, face, eye colour, hair, facial hair, marks, usual outfit; no mood, pose, setting or name"
}`;
};

const UNREADABLE = "The AI's reply wasn't a look it could read. Try again.";

export const parseLookReply = (reply: string): LookResult => {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : reply;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end < start) throw new LookReadError(UNREADABLE);
  let parsed: any;
  try {
    parsed = JSON.parse(stripTrailingCommas(escapeBareControlCharsInStrings(body.slice(start, end + 1))));
  } catch {
    throw new LookReadError(UNREADABLE);
  }
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : "");
  const appearance = text(parsed?.appearance ?? parsed?.looks);
  const visualTags = cleanVisualTags(text(parsed?.visualTags ?? parsed?.visual_tags ?? parsed?.tags));
  if (!appearance && !visualTags) throw new LookReadError(UNREADABLE);
  return { appearance, visualTags };
};
