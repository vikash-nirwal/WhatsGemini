// Toning down image prompts (the user's ask, 2026-10-27): before a picture
// is drawn, the text model can rewrite its prompt at one of three levels so
// an image service with content rules accepts it - keeping the picture's
// idea (who, where, what's happening, mood, framing, style) and changing
// only what the level asks. Off by default. If a service still blocks it,
// the picture can be tried again a level higher, up to the strictest.

export type ToneLevel = 0 | 1 | 2 | 3;
export const LS_IMAGE_TONE = "image_tone_level";
export const LS_IMAGE_TONE_RETRY = "image_tone_retry";

export const TONE_LEVELS: { level: ToneLevel; name: string; hint: string }[] = [
  { level: 0, name: "Off", hint: "Prompts go as written." },
  { level: 1, name: "1 · Soften", hint: "Explicit words become implied; nudity is covered by framing or fabric. Sensual and intense still." },
  { level: 2, name: "2 · Suggestive at most", hint: "Nothing explicit: clothed or artfully covered, intimacy as closeness, violence as tension." },
  { level: 3, name: "3 · Safe for work", hint: "Fine for any audience and any service, the same scene told through setting and expression." },
];

const RULES: Record<1 | 2 | 3, string> = {
  1: "Level 1, light: replace explicit sexual words and graphic gore with implied, non-graphic wording. Nudity becomes partly covered (sheets, hair, shadow, a cropped frame). Keep the sensuality, intensity and everything else.",
  2: "Level 2, medium: nothing explicit. People are clothed or artfully covered; intimacy is shown as closeness, a look, a touch; violence through tension or aftermath, with no wounds or gore. Romance and drama stay.",
  3: "Level 3, strict: fully safe for work and for any audience: clothed, no sexual content, no blood, no weapons aimed at anyone, no drugs. Keep the scene's meaning through setting, expressions, light and composition.",
};

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
export const toneLevel = (): ToneLevel => {
  const n = Number(read(LS_IMAGE_TONE));
  return n === 1 || n === 2 || n === 3 ? n : 0;
};
export const toneRetryOn = () => read(LS_IMAGE_TONE_RETRY) !== "false";
export const saveTone = (level: ToneLevel, retry: boolean) => {
  try {
    localStorage.setItem(LS_IMAGE_TONE, String(level));
    localStorage.setItem(LS_IMAGE_TONE_RETRY, String(retry));
  } catch {
    // Only a convenience.
  }
};

export const buildToneRewritePrompt = (prompt: string, level: 1 | 2 | 3) =>
  [
    "Rewrite this image prompt so an image service with content rules will draw it.",
    RULES[level],
    "The idea of the picture must stay the same: the same people and how they look, the same place, action, mood, camera, lighting and style. Change only what the level requires, and keep the prompt's format and length.",
    `The prompt:\n"""\n${prompt.trim()}\n"""`,
    "Reply with only the rewritten prompt.",
  ].join("\n\n");

export const cleanToneRewrite = (reply: string, fallback: string) => {
  const text = reply.trim().replace(/^```[a-z]*\s*|```\s*$/gi, "").replace(/^(prompt|rewritten prompt)\s*:\s*/i, "").replace(/^"""|"""$/g, "").trim();
  return text.length >= 8 ? text : fallback;
};

// The levels to try, in order: the chosen one, then (if retrying when a
// picture is blocked) each stricter one.
export const toneLadder = (level: ToneLevel, retry: boolean): ToneLevel[] => {
  const higher = ([1, 2, 3] as ToneLevel[]).filter((l) => l > level);
  return [level, ...(retry ? higher : [])];
};

// A provider saying no on content grounds, however it words it.
export const looksBlocked = (message: string) => /safety|blocked|nsfw|content.?policy|moderation|inappropriate|violat|not allowed|flagged|sensitive/i.test(message);
