import { Character, Chat, Message, WhatIfChat } from "../../types";
import { YOU } from "../../utils/constants";
import { generateNodeId } from "./messageTree";

// Flashbacks (#102) and what-if universes (#104): a new chat that isn't the
// main story. Both keep their own memory (memoryScope "chat"), so nothing
// leaks back. A flashback is set before the character met you; ending it
// turns what happened into a line or two of their past (Character.
// pastEvents), which every later chat knows. A universe is the same
// character - personality, voice, feelings - living in another world.

export interface Preset {
  id: string;
  title: string;
  setting: string;
}

export const UNIVERSES: Preset[] = [
  { id: "high-school", title: "High school", setting: "A modern high school in the final year: classes, lockers, rumors, a big dance coming up, exams looming." },
  { id: "space-opera", title: "Space opera", setting: "A starship crew far from home in a galaxy of rival empires, strange worlds and old alien ruins." },
  { id: "noir", title: "Noir", setting: "A rain-soaked 1940s city of smoky bars, crooked cops, private eyes and secrets everyone pays to keep." },
  { id: "fantasy-court", title: "Fantasy court", setting: "A royal court of magic and intrigue: nobles scheming, a throne in question, dragons in the hills." },
  { id: "zombie", title: "Zombie outbreak", setting: "Three weeks into a zombie outbreak: a barricaded safehouse, dwindling supplies, and the radio gone quiet." },
  { id: "cyberpunk", title: "Cyberpunk", setting: "A neon megacity run by corporations: implants, hackers, street markets and rain that never stops." },
  { id: "regency", title: "Regency", setting: "Regency-era England: balls, carriages, letters, chaperones and a season where reputations are made or ruined." },
  { id: "office", title: "Office", setting: "An open-plan office at a chaotic start-up: deadlines, coffee runs, a terrible manager and after-work drinks." },
];

export const FLASHBACK_IDEAS: Preset[] = [
  { id: "childhood", title: "Childhood", setting: "A day from their childhood that shaped who they became." },
  { id: "scar", title: "How it happened", setting: "The day they got a scar, a habit or a fear they still carry." },
  { id: "heartbreak", title: "First heartbreak", setting: "Their first heartbreak, as it happened." },
  { id: "turning-point", title: "The turning point", setting: "The day everything changed for them, long before they met you." },
];

export const buildWhatIfSection = (whatIf: WhatIfChat, name: string, userName: string): string =>
  whatIf.kind === "universe"
    ? `This chat is a what-if, an alternate universe: ${whatIf.setting} You are still ${name} - the same personality, voice, quirks and feelings - but your life, job, history and look fit this world. ${userName} lives in this world too. None of this happened in your real story, and nothing from it carries back; stay fully inside this world.`
    : `This chat is a flashback, set before ${name} ever met ${userName}: ${whatIf.setting} Play ${name} as they were back then - younger, not yet who they are now - and don't know ${userName} yet. ${whatIf.userRole?.trim() ? `${userName} plays ${whatIf.userRole.trim()} in this scene.` : `${userName} isn't in this scene; treat their messages as a director's notes for what happens next.`} Keep it to a single scene from the past.`;

// The chat: a narration line sets the scene, the character opens it.
export const buildWhatIfChat = (whatIf: WhatIfChat, character: Character, parent: Chat | undefined): Omit<Chat, "id"> => {
  const narration: Message = {
    role: YOU,
    txt: whatIf.kind === "universe" ? `What if… ${whatIf.title}. ${whatIf.setting}` : `Flashback: ${whatIf.title}. ${whatIf.setting}`,
    isNarration: true,
    id: generateNodeId(),
    timestamp: Date.now(),
  };
  return {
    title: `${character.name} · ${whatIf.title}`,
    timestamp: Date.now(),
    characterIds: [character.id],
    content: [narration],
    memoryScope: "chat",
    memory: [],
    whatIf: { ...whatIf, parentChatId: parent?.id },
    ...(parent?.personaId ? { personaId: parent.personaId } : {}),
    ...(parent?.hardLimits ? { hardLimits: parent.hardLimits } : {}),
    ...(parent?.intensity ? { intensity: parent.intensity } : {}),
    ...(parent?.textingMode !== undefined ? { textingMode: parent.textingMode } : {}),
  } as Omit<Chat, "id">;
};

export const buildWhatIfOpening = (whatIf: WhatIfChat, name: string): string =>
  whatIf.kind === "universe"
    ? `Open the story in this world: set the scene through ${name}'s eyes and give ${name} a reason to talk to the user. A few vivid lines, then leave room to answer.`
    : `Open the flashback: set the scene in the past through ${name}'s eyes - where, when, who's there - and start it moving. A few vivid lines.`;

// Ending a flashback: what happened, as a line or two of their past.
export const buildPastEventPrompt = (name: string, whatIf: WhatIfChat, transcript: string): string =>
  `This was a flashback scene from ${name}'s past (${whatIf.title}: ${whatIf.setting}).

${transcript}

In one or two sentences, write what happened in it that is now part of ${name}'s past and still shapes them - as a plain fact about their history, third person, past tense. Reply with only the sentences.`;

export const cleanPastEvent = (reply: string): string | undefined => {
  const text = reply.trim().replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim();
  return text.length >= 10 ? text.slice(0, 400) : undefined;
};

const KEEP_PAST = 8;
export const addPastEvent = (events: string[] | undefined, event: string): string[] => [...(events || []), event].slice(-KEEP_PAST);

export const buildPastSection = (name: string, events: string[] | undefined): string | undefined =>
  events && events.length > 0 ? `${name}'s past (things that happened before the story, which still shape them):\n- ${events.join("\n- ")}` : undefined;
