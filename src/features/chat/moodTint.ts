// Mood-tinted chat (#90): the chat's background takes a soft colour from the
// character's latest mood. Only the background behind the bubbles is tinted,
// at low strength, so text contrast stays as the theme set it.

const TINTS: Record<string, string> = {
  happy: "245 180 70", // warm amber
  excited: "250 150 60",
  flirty: "236 100 150", // rose
  shy: "240 140 180",
  embarrassed: "240 120 140",
  sad: "90 130 220", // blue
  scared: "140 100 210", // violet
  angry: "220 70 60", // red
  annoyed: "210 110 70",
  surprised: "60 180 190", // teal
  thinking: "120 140 170", // slate
  smug: "170 120 220",
};

// An "r g b" triple for the mood, or undefined for neutral/unknown moods.
export const tintFor = (emotion: string | undefined): string | undefined => (emotion ? TINTS[emotion.toLowerCase()] : undefined);

// The newest mood a character's reply carried, searching back.
export const latestMood = (messages: { role: string; emotion?: string; isSystem?: boolean }[]): string | undefined => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "you" && !m.isSystem && m.emotion) return m.emotion;
  }
  return undefined;
};
