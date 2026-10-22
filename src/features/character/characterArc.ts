// Character arc suggestions (#60): every so often the helper model reads
// what has happened and may suggest a short note on how the character has
// changed ("more open about her past"). An accepted note joins the
// character's growth list, which every prompt carries after the personality;
// the personality text you wrote is never rewritten.

export const ARC_INTERVAL = 40; // messages between checks
export const MAX_GROWTH = 6;

export const arcCheckDue = (messageCount: number, lastCheckedAt: number | undefined): boolean =>
  messageCount >= ARC_INTERVAL && messageCount - (lastCheckedAt ?? 0) >= ARC_INTERVAL;

export const buildArcPrompt = (
  charName: string,
  userName: string,
  personality: string,
  growth: string[],
  facts: string[],
  transcript: string,
  summary?: string
): string => `Read this roleplay between ${userName} and ${charName} and decide whether ${charName} has clearly grown or changed as a person.

Who ${charName} was written as: ${personality.slice(0, 900)}
${growth.length > 0 ? `\nHow they've already changed (don't repeat these):\n- ${growth.join("\n- ")}\n` : ""}${facts.length > 0 ? `\nWhat ${charName} remembers:\n- ${facts.slice(-10).join("\n- ")}\n` : ""}${summary ? `\nThe story so far:\n${summary}\n` : ""}
Recent messages:
${transcript}

If the story has clearly changed them (opened up, hardened, gained confidence, let go of a fear, a new habit...), reply with only one short sentence describing the change, in the third person, like "More open about her past since the night at the lake."
If nothing about them has clearly changed, reply with only: SAME`;

export const parseArcReply = (reply: string, growth: string[]): string | undefined => {
  const text = reply
    .trim()
    .split("\n")[0]
    .replace(/^(change|growth|answer)\s*:\s*/i, "")
    .replace(/^["“'*]+|["”'*]+$/g, "")
    .trim();
  if (!text || /^same\b/i.test(text) || text.length > 200) return undefined;
  if (growth.some((g) => g.toLowerCase() === text.toLowerCase())) return undefined;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const addGrowth = (growth: string[] | undefined, note: string): string[] => [...(growth || []), note].slice(-MAX_GROWTH);

export const buildGrowthSection = (charName: string, growth: string[] | undefined): string | undefined =>
  growth && growth.length > 0
    ? `How ${charName} has changed over the story so far (let it show naturally; it builds on the personality above):\n- ${growth.join("\n- ")}`
    : undefined;
