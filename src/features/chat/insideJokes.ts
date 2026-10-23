import { InsideJoke } from "../../types";

// Inside jokes (#96): nicknames, running jokes, "our song", little rituals -
// the things only you and the character share. With "Notice inside jokes"
// on, every JOKE_INTERVAL messages a helper check picks out new ones; you can
// add or remove them by hand in the Story tab. The character brings one back
// now and then.

export const JOKE_INTERVAL = 30;
const KEEP = 12;
const MAX_NEW = 3;

export const newJokeId = () => `joke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const jokeCheckDue = (count: number, checkedAt: number | undefined): boolean => count - (checkedAt ?? 0) >= JOKE_INTERVAL;

export const buildJokesPrompt = (characterName: string, userName: string, existing: InsideJoke[], transcript: string): string =>
  `Read this stretch of a roleplay between ${userName} and ${characterName}.

${transcript}

${existing.length > 0 ? `Already noted (don't repeat these):\n${existing.map((j) => `- ${j.text}`).join("\n")}\n\n` : ""}List anything new that has become theirs alone: a nickname one gives the other, a running joke or gag, a phrase they keep coming back to, "our song" or place, a little ritual. Only things that came up more than once or clearly stuck - not one-off jokes or ordinary facts.
Write each as one short line that explains it, e.g. "${characterName} calls ${userName} 'Captain' since the boat trip".
Reply with one "- " line each (at most ${MAX_NEW}), or only NONE.`;

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const parseJokesReply = (reply: string, existing: InsideJoke[]): string[] => {
  if (/^\s*none\b/i.test(reply)) return [];
  const known = new Set(existing.map((j) => normalize(j.text)));
  const lines = reply
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length >= 4 && l.length <= 200 && !/^none\b/i.test(l));
  const fresh: string[] = [];
  for (const line of lines) {
    const key = normalize(line);
    if (known.has(key)) continue;
    known.add(key);
    fresh.push(line);
  }
  return fresh.slice(0, MAX_NEW);
};

export const addJokes = (jokes: InsideJoke[] | undefined, texts: string[], now: number): InsideJoke[] =>
  [...(jokes || []), ...texts.map((text, i) => ({ id: `${newJokeId()}-${i}`, text, at: now }))].slice(-KEEP);

export const buildJokesSection = (jokes: InsideJoke[] | undefined, characterName: string, userName: string): string | undefined => {
  const list = (jokes || []).filter((j) => j.text.trim());
  if (list.length === 0) return undefined;
  return `Things only ${characterName} and ${userName} share - nicknames, running jokes, rituals:\n${list.map((j) => `- ${j.text.trim()}`).join("\n")}\nBring one back now and then when it fits naturally (a callback, the nickname, the ritual) - not in every reply.`;
};
