// How much a story's narration says at a time. Long narration is immersive,
// but not everyone wants to read that much, so Stories (and adventures) and
// "Finish this beat" let the reader pick. Adventures keep the length as
// `rules.replyLengthLimit` in characters, as the wizard always has; these
// presets are three points on that scale, each with a line about style so
// "long" also reads richer, not only longer.

export type StoryLength = "short" | "medium" | "long";

export const STORY_LENGTHS: Record<StoryLength, { label: string; hint: string; chars: number; style: string; passage: string }> = {
  short: {
    label: "Short",
    hint: "A few lines, straight to what happens",
    chars: 450,
    style: "Keep it brief: a few lines, straight to what happens and what's said.",
    passage: "one short paragraph, about 60 to 120 words",
  },
  medium: {
    label: "Medium",
    hint: "A couple of paragraphs",
    chars: 1200,
    style: "",
    passage: "2 or 3 paragraphs, about 200 to 350 words",
  },
  long: {
    label: "Long",
    hint: "Rich and immersive, takes its time",
    chars: 3000,
    style: "Take your time: rich, immersive narration with sensory detail, body language, inner feelings, and dialogue in each character's own voice.",
    passage: "4 to 7 paragraphs, about 500 to 900 words, unhurried and immersive",
  },
};

export const STORY_LENGTH_OPTIONS = (Object.keys(STORY_LENGTHS) as StoryLength[]).map((value) => ({ value, label: STORY_LENGTHS[value].label }));

// The preset a character budget is, if it's one of them (the wizard can set
// any number; that and "no limit" are none of them).
export const lengthOfLimit = (limit: number | undefined): StoryLength | undefined =>
  (Object.keys(STORY_LENGTHS) as StoryLength[]).find((k) => STORY_LENGTHS[k].chars === limit);

// The next preset, for a header button that cycles through them.
export const nextLength = (limit: number | undefined): StoryLength => {
  const order: StoryLength[] = ["short", "medium", "long"];
  const now = lengthOfLimit(limit);
  return now ? order[(order.indexOf(now) + 1) % order.length] : "short";
};

// The reader's last pick for "Finish this beat", kept in this browser.
const LS_FINISH_LENGTH = "finish_beat_length";
export const loadFinishLength = (): StoryLength => {
  try {
    const saved = localStorage.getItem(LS_FINISH_LENGTH) as StoryLength | null;
    return saved && saved in STORY_LENGTHS ? saved : "medium";
  } catch {
    return "medium";
  }
};
export const saveFinishLength = (length: StoryLength) => {
  try {
    localStorage.setItem(LS_FINISH_LENGTH, length);
  } catch {
    // Private windows can refuse storage; the pick just isn't remembered.
  }
};
