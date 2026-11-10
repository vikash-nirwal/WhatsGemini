// Tools for characters (#266): which tools a character may use in a reply.
// Kept on this device, like the life dial, and read when a reply is made,
// so a switch takes effect on the next message. Everything starts off: a
// tool costs a second model call when it's used, and the web tools send
// what's looked up to the provider.

export type ToolGroup = "dice" | "facts" | "reminders" | "web" | "links";

export interface ToolSettings {
  on: boolean; // the master switch
  groups: Record<ToolGroup, boolean>;
  // Reading a link through a reader service (r.jina.ai) when the provider
  // can't open pages itself. Its own switch, as the link goes to a third party.
  reader: boolean;
}

export const LS_TOOLS = "character_tools";

export const TOOL_GROUPS: { id: ToolGroup; title: string; hint: string }[] = [
  { id: "dice", title: "Dice and chance", hint: "Real dice rolls, coin flips and picks from a list, instead of made-up results." },
  { id: "facts", title: "Time, weather and holidays", hint: "The real time, weather or public holidays for any city. Uses Open-Meteo and Nager.Date, no key." },
  { id: "reminders", title: "Reminders and timers", hint: "\"Remind me in 20 minutes\": they text you when it's time, while the app is open." },
  { id: "web", title: "Web lookup", hint: "Looks something up on the web. Needs Gemini or Claude as the chat or helper model, and costs extra." },
  { id: "links", title: "Reading a link", hint: "Opens a link you send and reads the page. Needs Gemini or Claude, or the reader service below." },
];

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  on: false,
  groups: { dice: false, facts: false, reminders: false, web: false, links: false },
  reader: false,
};

// Takes only what it knows from a stored or imported value, so an odd file
// can't leave a switch in a state the page can't show.
export const cleanToolSettings = (raw: unknown): ToolSettings => {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<ToolSettings>;
  const groups = (value.groups && typeof value.groups === "object" ? value.groups : {}) as Partial<Record<ToolGroup, unknown>>;
  return {
    on: value.on === true,
    groups: {
      dice: groups.dice === true,
      facts: groups.facts === true,
      reminders: groups.reminders === true,
      web: groups.web === true,
      links: groups.links === true,
    },
    reader: value.reader === true,
  };
};

export const loadToolSettings = (): ToolSettings => {
  try {
    const raw = localStorage.getItem(LS_TOOLS);
    return raw ? cleanToolSettings(JSON.parse(raw)) : DEFAULT_TOOL_SETTINGS;
  } catch {
    return DEFAULT_TOOL_SETTINGS;
  }
};

export const saveToolSettings = (settings: ToolSettings): void => {
  try {
    localStorage.setItem(LS_TOOLS, JSON.stringify(settings));
  } catch {
    // Only a convenience.
  }
};

// The groups a reply may use right now: none with the master switch off.
export const enabledGroups = (settings: ToolSettings = loadToolSettings()): ToolGroup[] =>
  settings.on ? TOOL_GROUPS.map((g) => g.id).filter((id) => settings.groups[id]) : [];

// How many are on, for the Settings row.
export const toolSummary = (settings: ToolSettings): string => {
  const count = enabledGroups(settings).length;
  return !settings.on || count === 0 ? "Off" : `${count} on`;
};
