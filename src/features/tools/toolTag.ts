import { ToolGroup } from "./toolSettings";

// Tools for characters (#266). A character asks for a tool with a tag,
// [Use: roll | 2d6], the way it sets a reaction or ends a game, so tools
// work on every provider, not only the ones with function calling. The app
// runs the tool and asks for the reply again with the result.

export interface ToolCommand {
  name: string;
  group: ToolGroup;
  usage: string; // the tag as the character writes it
  does: string;
}

export const TOOL_COMMANDS: ToolCommand[] = [
  { name: "roll", group: "dice", usage: "[Use: roll | 2d6+1]", does: "rolls real dice (any NdM, with an optional +K or -K)" },
  { name: "coin", group: "dice", usage: "[Use: coin]", does: "flips a real coin" },
  { name: "pick", group: "dice", usage: "[Use: pick | pizza, sushi, tacos]", does: "picks one from a list at random" },
  { name: "time", group: "facts", usage: "[Use: time | Tokyo]", does: "the real date and time in a city right now" },
  { name: "weather", group: "facts", usage: "[Use: weather | Tokyo]", does: "the real weather in a city right now" },
  { name: "holidays", group: "facts", usage: "[Use: holidays | Japan]", does: "the next public holidays in a country (or a city's country)" },
  { name: "remind", group: "reminders", usage: "[Use: remind | 20m | take the pasta off]", does: "sets a reminder: you'll text the user about it when it's time. The time is a wait (90s, 20m, 2h, 1h30m) or a clock time (18:30, tomorrow 9:00)" },
  { name: "search", group: "web", usage: "[Use: search | who won the 2026 world cup]", does: "looks something up on the web" },
  { name: "open", group: "links", usage: "[Use: open | https://example.com/article]", does: "opens a link the user sent and reads the page" },
];

export const commandsFor = (groups: ToolGroup[]): ToolCommand[] => TOOL_COMMANDS.filter((c) => groups.includes(c.group));

export const buildToolSection = (commands: ToolCommand[]): string =>
  commands.length === 0
    ? ""
    : [
        "Tools. You can do a few things for real instead of making them up. To use one, write only its tag as your whole reply, nothing before or after. The app runs it, gives you the result, and you then write your actual reply with it. The user never sees the tag.",
        ...commands.map((c) => `- ${c.usage}: ${c.does}.`),
        "Use a tool only when the conversation calls for it: the user asks for a roll, a reminder, something you'd have to check. Never invent a result a tool could give you, and never mention tools or tags. Most replies need no tool.",
      ].join("\n");

export interface ToolCall {
  name: string;
  args: string[]; // the parts after the name, split on "|"
  raw: string; // everything after the name, as written
}

const TOOL_TAG = /\[\s*use\s*:\s*([a-z_-]+)\s*(?:\|\s*([^\]\n]*))?\]/i;
const TOOL_TAGS = /\s*\[\s*use\s*:[^\]\n]*\]/gi;

export const parseToolCall = (text: string): ToolCall | null => {
  const match = text.match(TOOL_TAG);
  if (!match) return null;
  const raw = (match[2] || "").trim();
  return { name: match[1].toLowerCase(), raw, args: raw ? raw.split("|").map((part) => part.trim()) : [] };
};

// A tag that was never run (a third one in a turn, or one in a reply that
// isn't allowed tools) must not show.
export const stripToolTags = (text: string): string => text.replace(TOOL_TAGS, "").trim();

// While streaming: hide the tag, even half-typed.
const PARTIAL_TOOL_TAG = /\n*\[\s*(?:u(?:s(?:e(?:\s*:[^\]\n]*)?)?)?)?$/i;
export const stripStreamingToolTag = (text: string): string => text.replace(TOOL_TAGS, "").replace(PARTIAL_TOOL_TAG, "").trimEnd();

// What the character gets back, on the turn's prompt. It's told to write the
// reply now, so a model that likes the tag doesn't loop.
export const buildToolResultNote = (call: ToolCall, result: string, more: boolean): string =>
  `[Tool result for ${call.name}${call.raw ? ` (${call.raw})` : ""}: ${result}\nNow write your reply to the user, in character, using this result as it is. Don't mention the tool or the tag.${more ? "" : " Don't use another tool in this reply."}]`;
