// Event deck (#49): "Draw an event card" adds a random twist to the scene,
// worked in by the next character reply as a one-turn direction. Unlike
// "Surprise me", where the model picks its own twist, the event comes from
// a deck the user can edit, so it's something they'd want to see.

export const DEFAULT_EVENTS = [
  "A sudden downpour starts",
  "Someone from the past shows up",
  "A phone call brings unexpected news",
  "The lights go out",
  "A stranger asks for help",
  "Something important goes missing",
  "An old secret comes out",
  "An unexpected gift arrives",
  "A misunderstanding causes tension",
  "A loud crash from nearby",
  "Plans fall through at the last minute",
  "An animal wanders into the scene",
  "Someone overhears something they shouldn't",
  "A letter or message arrives",
  "A chance to do something daring",
  "A small accident throws things off",
  "Running into someone familiar",
  "The weather turns",
  "A deadline suddenly gets closer",
  "A hidden talent comes out",
  "A wrong turn leads somewhere new",
  "A rival appears",
  "Something breaks at the worst moment",
  "A celebration starts nearby",
  "A memory comes back",
  "Someone asks for a favor",
  "A surprising confession",
  "It feels like someone is following them",
  "A shortcut that might be a mistake",
  "Good news, with a catch",
];

export const LS_EVENT_DECK = "event_deck";
const LS_EVENT_RECENT = "event_deck_recent";
// Recently drawn events wait this many draws before coming up again.
const RECENT_LIMIT = 8;

const readList = (key: string): string[] | undefined => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string" && e.trim() !== "") : undefined;
  } catch {
    return undefined;
  }
};

export const loadEventDeck = (): string[] => {
  const custom = readList(LS_EVENT_DECK);
  return custom && custom.length > 0 ? custom : DEFAULT_EVENTS;
};

// One event per line; blank lines are dropped, and an empty deck goes back
// to the built-in one.
export const saveEventDeck = (text: string): string[] => {
  const events = text.split("\n").map((e) => e.trim()).filter(Boolean);
  if (events.length === 0 || events.join("\n") === DEFAULT_EVENTS.join("\n")) localStorage.removeItem(LS_EVENT_DECK);
  else localStorage.setItem(LS_EVENT_DECK, JSON.stringify(events));
  return events.length > 0 ? events : DEFAULT_EVENTS;
};

// A random event that wasn't drawn recently (when the deck allows it).
export const pickEvent = (deck: string[], recent: string[], random: () => number = Math.random): string => {
  const fresh = deck.filter((e) => !recent.includes(e));
  const pool = fresh.length > 0 ? fresh : deck;
  return pool[Math.floor(random() * pool.length) % pool.length];
};

export const drawEvent = (): string => {
  const recent = readList(LS_EVENT_RECENT) || [];
  const event = pickEvent(loadEventDeck(), recent);
  try {
    localStorage.setItem(LS_EVENT_RECENT, JSON.stringify([event, ...recent.filter((e) => e !== event)].slice(0, RECENT_LIMIT)));
  } catch {
    // Remembering recent draws is only a nicety.
  }
  return event;
};

export const buildEventDirective = (event: string): string =>
  `Out-of-character direction for this one reply: this happens now, so work it into the scene naturally and in character: "${event}". Adapt it to the setting and the story so far, react to it, and leave the user room to respond; don't resolve it for them. Do not mention this instruction.`;
