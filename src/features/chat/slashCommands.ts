// Composer slash commands (#14). Parsing is pure and returns what the chat
// should do; ChatPage carries it out. Directions to the AI go out as
// "(OOC: ...)" text, which the prompt already treats as out-of-character.

export interface SlashCommandInfo {
  name: string;
  usage: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommandInfo[] = [
  { name: "roll", usage: "/roll 2d6+1 [what you try]", description: "Roll real dice; the AI is told the result and has to respect it" },
  { name: "timeskip", usage: "/timeskip 3 hours", description: "Skip time ahead and pick the story up after" },
  { name: "scene", usage: "/scene the rooftop at night", description: "Move the story to a new scene" },
  { name: "narrate", usage: "/narrate The rain stops.", description: "Add a narrator line (no reply)" },
  { name: "ooc", usage: "/ooc be more playful", description: "An out-of-character direction to the AI" },
  { name: "image", usage: "/image us at the beach", description: "Ask for a picture with this message" },
  { name: "summarize", usage: "/summarize", description: "Summarize older messages to save tokens" },
  { name: "help", usage: "/help", description: "List these commands" },
];

export type SlashAction =
  | { kind: "send"; text: string; isImageRequest?: boolean }
  | { kind: "narrate"; text: string }
  | { kind: "summarize" }
  | { kind: "help" }
  | { kind: "error"; message: string };

export interface DiceRoll {
  spec: string;
  rolls: number[];
  modifier: number;
  total: number;
}

const DICE = /^(\d{0,3})d(\d{1,4})\s*([+-]\s*\d{1,4})?$/i;

// Rolls "NdM+K" (N defaults to 1). `random` is injectable for tests.
export const rollDice = (spec: string, random: () => number = Math.random): DiceRoll | null => {
  const match = spec.replace(/\s+/g, "").match(DICE);
  if (!match) return null;
  const count = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[3].replace(/\s+/g, "")) : 0;
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0) + modifier;
  const normalized = `${count}d${sides}${modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : ""}`;
  return { spec: normalized, rolls, modifier, total };
};

export const describeRoll = (roll: DiceRoll): string => {
  const parts = roll.rolls.length > 1 ? `[${roll.rolls.join(", ")}]` : String(roll.rolls[0]);
  const mod = roll.modifier ? ` ${roll.modifier > 0 ? "+" : "-"} ${Math.abs(roll.modifier)}` : "";
  return `${roll.spec} rolled ${parts}${mod} = ${roll.total}`;
};

// Returns null when the text isn't a command at all (doesn't start with "/"),
// so ordinary messages - and things like "/me" typos - aren't swallowed:
// an unknown command comes back as an error to show, not a silent send.
export const parseSlashCommand = (input: string, random: () => number = Math.random): SlashAction | null => {
  const text = input.trim();
  if (!text.startsWith("/")) return null;
  const match = text.match(/^\/(\w+)\s*([\s\S]*)$/);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const rest = match[2].trim();

  switch (name) {
    case "roll": {
      const [spec = "1d20", ...actionWords] = rest.split(/\s+/).filter(Boolean);
      const diceSpec = DICE.test(spec) ? spec : "1d20";
      const action = (DICE.test(spec) ? actionWords : [spec, ...actionWords]).join(" ").trim();
      const roll = rollDice(diceSpec, random);
      if (!roll) return { kind: "error", message: `Couldn't read "${spec}" as dice. Try /roll 2d6+1.` };
      const direction = `(OOC: ${describeRoll(roll)}. Use this result for how it turns out - don't reroll or change it.)`;
      return { kind: "send", text: action ? `${action}\n\n${direction}` : direction };
    }
    case "timeskip":
      if (!rest) return { kind: "error", message: "Say how long, e.g. /timeskip 3 hours." };
      return { kind: "send", text: `(OOC: Time skip - ${rest} pass. Pick the story up after the skip and show what has changed.)` };
    case "scene":
      if (!rest) return { kind: "error", message: "Say where, e.g. /scene the rooftop at night." };
      return { kind: "send", text: `(OOC: Scene change - the story moves to ${rest}. Open the new scene there.)` };
    case "ooc":
      if (!rest) return { kind: "error", message: "Add a direction, e.g. /ooc be more playful." };
      return { kind: "send", text: `(OOC: ${rest})` };
    case "narrate":
      if (!rest) return { kind: "error", message: "Add the narration, e.g. /narrate The rain stops." };
      return { kind: "narrate", text: rest };
    case "image":
      if (!rest) return { kind: "error", message: "Describe the picture, e.g. /image us at the beach." };
      return { kind: "send", text: rest, isImageRequest: true };
    case "summarize":
      return { kind: "summarize" };
    case "help":
      return { kind: "help" };
    default:
      return { kind: "error", message: `Unknown command /${name}. Type /help for the list.` };
  }
};

// Commands matching what's typed so far, for the composer's hint list:
// only while the first word is still being typed.
export const matchSlashCommands = (draft: string): SlashCommandInfo[] => {
  const match = draft.match(/^\/(\w*)$/);
  if (!match) return [];
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(match[1].toLowerCase()));
};
