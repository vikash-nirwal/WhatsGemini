// God mode (#160): you change anything - a fact, a relationship, a place,
// the scene - and it simply becomes true. Characters accept it without
// questioning or remarking on it. Kept as truths a world (or, outside one, a
// chat) carries in every prompt.
//
// It changes facts, nothing else (the user's report, 2026-10-28): it used to
// send the change into the chat as narration and have the character answer
// it at once, so the reply took over - narrating the change, playing the
// scene out. Now nobody answers it; the story carries on when you do, and
// every reply from then on keeps to it.

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
    ? `Truths of this story, set by the author. They are simply true and always have been. Accept them completely: never question, doubt, argue with or comment on them as strange or new; let your words, memories and actions fit them, even where they contradict what came before. A truth changes only what it says: everyone stays who they are otherwise, and you keep your own personality, voice and part in the conversation. Never narrate, announce or act out a truth; just live in it.\n${truths.map((t) => `- ${t}`).join("\n")}`
    : undefined;

