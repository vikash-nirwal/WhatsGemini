// God mode (#160): you change anything - a fact, a relationship, a place,
// the scene - and it simply becomes true. Characters accept it without
// questioning or remarking on it. Kept as truths a world (or, outside one, a
// chat) carries in every prompt.

export const MAX_TRUTHS = 40;

export const addTruth = (truths: string[] | undefined, text: string) => {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return truths || [];
  return [...(truths || []).filter((x) => x.toLowerCase() !== t.toLowerCase()), t].slice(-MAX_TRUTHS);
};

export const removeTruth = (truths: string[] | undefined, text: string) => {
  const next = (truths || []).filter((x) => x !== text);
  return next.length ? next : undefined;
};

// For every reply in that world (or chat): above the character's own notes.
export const buildGodTruthsSection = (truths: string[]) =>
  truths.length
    ? `Truths of this story, set by the author. They are simply true and always have been. Accept them completely: never question, doubt, argue with or comment on them as strange or new; let your words, memories and actions fit them, even where they contradict what came before.\n${truths.map((t) => `- ${t}`).join("\n")}`
    : undefined;

// For the reply right after a change: carry on in the changed world.
export const buildGodDirective = (text: string) =>
  `The author just made this true: "${text.trim()}". It is simply how things are now, and always were. Carry on naturally in a world where it's true - don't question it, don't call it sudden, and don't explain it away.`;
