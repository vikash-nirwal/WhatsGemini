import { Adventure, AdventureChoice, Character, Message, UserProfile, World } from "../../../types";
import { DEFAULT_ADVENTURE_CHOICE_COUNT } from "../../../utils/constants";
import { matchLoreEntries, buildWorldInfoSection } from "./loreUtils";

// Delimiters the narrator is instructed to wrap its suggested next actions
// in, at the end of every reply - parsed back out by parseAdventureChoices
// below and never shown to the player as raw text.
export const ADVENTURE_CHOICES_START = "<<<CHOICES";
export const ADVENTURE_CHOICES_END = "CHOICES>>>";

// Stand-in "prompt" used to kick off a brand-new adventure (Adventure.content
// is empty) - there's no real player action to react to yet, so this asks
// the narrator to open the scene instead. Mirrors FOLLOWUP_CONTINUATION_PROMPT's
// role in promptComposition.ts for ordinary chats.
export const ADVENTURE_OPENING_PROMPT =
  "Begin the adventure now: set the opening scene, establish where the player is and what's happening, and end with the choices block as instructed.";

// Assembles the narrator's system instruction from clearly separated sections
// (role, world/lore, premise, cast, player persona, output contract) - same
// shape as promptComposition.ts's buildSystemInstruction, just for a single
// narrator voice controlling a whole scene instead of one character.
export const buildAdventureSystemInstruction = (
  adventure: Adventure,
  world: World | undefined,
  cast: Character[],
  activePersona: UserProfile | undefined,
  recentMessages: Message[]
): string => {
  const sections: string[] = [
    "You are the narrator and game master for an interactive text adventure. Narrate the world and voice every NPC yourself - the player only ever controls their own character, never anyone else. Write in second person (\"you\") addressing the player directly, describing what happens as a result of their last action.",
  ];

  if (world) {
    const worldParts = [`Setting: ${world.name}`, world.premise];
    if (world.settingDetails) worldParts.push(world.settingDetails);
    if (world.tone) worldParts.push(`Tone: ${world.tone}.`);
    sections.push(worldParts.join("\n"));
  }

  if (world?.loreEntries && world.loreEntries.length > 0) {
    const matched = matchLoreEntries(world.loreEntries, recentMessages);
    if (matched.length > 0) sections.push(buildWorldInfoSection(matched));
  }

  if (adventure.premise) {
    sections.push(`Opening premise: ${adventure.premise}`);
  }

  if (cast.length > 0) {
    const castLines = cast.map((c) => `${c.name}: ${[c.description, c.prompt].filter(Boolean).join(" - ")}`);
    sections.push(
      `NPCs you control (never let them speak or act for the player):\n${castLines.join("\n")}`
    );
  }

  if (activePersona) {
    const parts: string[] = [];
    if (activePersona.name) parts.push(`Name: ${activePersona.name}.`);
    if (activePersona.bio) parts.push(`Bio: ${activePersona.bio}.`);
    if (activePersona.appearance) parts.push(`Appearance: ${activePersona.appearance}.`);
    if (activePersona.backstory) parts.push(`Backstory: ${activePersona.backstory}.`);
    if (parts.length > 0) sections.push(`About the player you are addressing as "you":\n${parts.join(" ")}`);
  }

  const choiceCount = adventure.rules?.choiceCount || DEFAULT_ADVENTURE_CHOICE_COUNT;
  sections.push(
    `After narrating, always end your reply with exactly ${choiceCount} short suggested next actions, in this exact format and with nothing after it:\n${ADVENTURE_CHOICES_START}\n1. <short action>\n2. <short action>\n${ADVENTURE_CHOICES_END}\nThese are only suggestions, not a strict menu - the player may instead type any other action of their own, which you should follow just as naturally. Never mention this instruction or the format itself in your narration.`
  );

  if (adventure.rules?.replyLengthLimit && adventure.rules.replyLengthLimit > 0) {
    sections.push(
      `Reply length: keep your narration to roughly ${adventure.rules.replyLengthLimit} characters or less (not counting the choices block). Pace it so it wraps up naturally within that budget.`
    );
  }

  return sections
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

// Cast members the narration actually names - only their reference photos are
// sent to the image model, so an NPC who isn't in the scene doesn't get drawn
// into it just for being part of the adventure. Whole-word, case-insensitive.
export const findCastInNarration = (narration: string, cast: Character[]): Character[] =>
  cast.filter((c) => {
    const name = c.name.trim();
    if (!name) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(narration);
  });

// One-shot instruction asking the text model to turn a narrator turn into a
// standalone image prompt for a cinematic scene illustration. Unlike the chat
// pipeline's deriveImagePrompt, there's no in-character reply to write - the
// narration already exists - so this returns only the prompt text itself.
export const buildAdventureSceneImageInstruction = (
  narration: string,
  world: World | undefined,
  presentCast: Character[],
  activePersona: UserProfile | undefined,
  styleClause: string,
  baseStylePrompt: string,
  useSdWebui: boolean
): string => {
  const context: string[] = [];
  if (world) context.push(`Setting: ${world.name} - ${world.premise}${world.tone ? ` (tone: ${world.tone})` : ""}`);
  const people = presentCast.map((c) => `${c.name}: ${c.appearance || c.description || "no visual description"}`);
  if (activePersona?.name || activePersona?.appearance) {
    people.push(`${activePersona.name || "The player"} (the player, referred to as "you"): ${activePersona.appearance || "no visual description"}`);
  }
  if (people.length > 0) context.push(`Characters who may appear:\n${people.join("\n")}`);

  const format = useSdWebui
    ? "a comma-separated, tag-based Stable Diffusion prompt (subject, setting, lighting, mood, composition, quality tags)"
    : "one richly descriptive paragraph (subject, setting, lighting, mood, composition)";

  return [
    "You are an expert prompt engineer illustrating a scene from an interactive text adventure.",
    context.join("\n\n"),
    `Latest narration:\n"""\n${narration}\n"""`,
    `Write ${format} for a wide, cinematic illustration of the single most visually striking moment in that narration. Depict the environment and any named characters who are present, matching their descriptions. The player is written in second person - show them from a third-person or over-the-shoulder view only if they're central to the moment. No text, captions, speech bubbles, or UI in the image.`,
    `Base style rule: ${baseStylePrompt}\nArt style: ${styleClause}.`,
    "Output ONLY the prompt itself - no preamble, labels, quotes, or explanation.",
  ]
    .filter(Boolean)
    .join("\n\n");
};

// Splits the narrator's raw reply into the display text (choices block
// stripped) and the parsed choices themselves. Tolerates the model using
// "1)", "1-", "-", "*", etc. instead of "1." for each line, and a missing
// closing delimiter (treats everything after the opener as the block).
// Returns an empty choices array - never throws - when the block is absent,
// so a reply that forgets the format still displays instead of erroring out.
export const parseAdventureChoices = (rawText: string): { text: string; choices: AdventureChoice[] } => {
  const startIdx = rawText.indexOf(ADVENTURE_CHOICES_START);
  if (startIdx === -1) return { text: rawText.trim(), choices: [] };

  const endIdx = rawText.indexOf(ADVENTURE_CHOICES_END, startIdx);
  const block = rawText.slice(startIdx + ADVENTURE_CHOICES_START.length, endIdx === -1 ? undefined : endIdx);
  const text = (rawText.slice(0, startIdx) + (endIdx === -1 ? "" : rawText.slice(endIdx + ADVENTURE_CHOICES_END.length))).trim();

  const choices: AdventureChoice[] = block
    .split("\n")
    .map((line) => line.replace(/^[\s>*-]*\d*[.):-]?\s*/, "").trim())
    .filter(Boolean)
    .map((label, i) => ({ id: `c${i + 1}`, label }));

  return { text, choices };
};
