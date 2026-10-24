import { Character } from "../../types";

// Profile changes (#125): with the switch on, now and then a character
// changes their About line (a short status-like line, as on WhatsApp) and,
// every other time, their profile photo; their 1:1 chat shows a notice.
// At most once every three days, only while they're awake.

export const PROFILE_GAP_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_ABOUT = 80;

// The picture shown as their avatar: a changed profile photo, or the main
// reference photo.
export const avatarOf = (character: Pick<Character, "profilePhoto" | "appearanceImages"> | undefined | null): string | undefined =>
  character?.profilePhoto || character?.appearanceImages?.[0];

export const profileChangeDue = (character: Pick<Character, "profileChanges" | "profileChangedAt">, now: number): boolean =>
  Boolean(character.profileChanges) && (character.profileChangedAt == null || now - character.profileChangedAt >= PROFILE_GAP_MS);

// Every other change brings a new photo too, if they have a look to draw.
export const photoChangeDue = (character: Pick<Character, "profileChangeCount" | "appearanceImages" | "appearance" | "visualTags">): boolean =>
  (character.profileChangeCount || 0) % 2 === 1 && Boolean(character.appearanceImages?.length || character.appearance || character.visualTags);

export const buildAboutPrompt = (character: Pick<Character, "name" | "description" | "prompt" | "about">, context: { dayMood?: string; concerns?: string; dayLog?: string }): string =>
  `${character.name} is updating the "About" line on their messaging profile: a few words people see under their name, like "Busy, coffee first" or "Learning to bake, send help 🍞".

About ${character.name}: ${[character.description, character.prompt].filter(Boolean).join(" ").slice(0, 500)}
${character.about ? `Their current About: "${character.about}" (write a different one).\n` : ""}${context.dayMood ? `Lately they're ${context.dayMood}.\n` : ""}${context.concerns ? `On their mind: ${context.concerns}\n` : ""}${context.dayLog ? `Their day: ${context.dayLog}\n` : ""}
- In ${character.name}'s own voice, at most 60 characters, one emoji at most. No quotes, no hashtags.
- Reply with only the About line.`;

export const cleanAbout = (reply: string): string | undefined => {
  const unquote = (t: string) => t.replace(/^["“']|["”']$/g, "").trim();
  const line = reply.trim().split("\n").filter(Boolean)[0];
  const text = line ? unquote(unquote(line).replace(/^about\s*:\s*/i, "")) : "";
  return text ? text.slice(0, MAX_ABOUT) : undefined;
};

export const photoHint = (about: string): string => `a fresh, casual profile picture they'd pick for themselves, fitting their mood: "${about}"`;

// What they'd know about their own profile, for the prompt.
export const buildProfileNote = (name: string, about: string | undefined): string | undefined =>
  about ? `${name}'s About line on their messaging profile right now: "${about}".` : undefined;
