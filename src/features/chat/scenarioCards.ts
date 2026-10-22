// Scenario cards (#79): ready-made scene starters, plus your own, that set
// the scene in one tap: a narration line for the setting, the tracked time,
// place and outfit, an optional backdrop, and the character opening it.
//
// Time skips (#80): "Later that night..." as a button. A helper writes a
// short transition, the tracked time and place move on, and the story
// continues from there.

export interface ScenarioCard {
  id: string;
  title: string;
  setting: string; // the narration that sets the scene
  place?: string;
  time?: string;
  outfit?: string;
  opening: string; // what the character's first message should do
  custom?: boolean;
}

export const BUILT_IN_CARDS: ScenarioCard[] = [
  { id: "date-night", title: "Date night", setting: "A small candlelit restaurant on a quiet street; rain on the windows, a corner table, a waiter who leaves you alone.", place: "a candlelit restaurant", time: "evening", outfit: "your nicest dinner clothes", opening: "Arrive at the table, a little nervous and happy to see the user, and start the evening." },
  { id: "weekend-away", title: "A weekend away", setting: "A wooden cabin by a lake, two hours from the city. The car is unpacked, the fire isn't lit yet, and there's nobody else around.", place: "a lakeside cabin", time: "late afternoon", outfit: "comfortable travel clothes", opening: "React to the cabin and the view, and suggest what to do first." },
  { id: "reunion", title: "Reunion after months apart", setting: "The arrivals hall of a busy airport. Months apart, a hundred messages, and now the doors slide open.", place: "the airport arrivals hall", time: "morning", outfit: "travel clothes", opening: "Spot the user across the hall and close the distance, feeling everything at once." },
  { id: "rainy-night", title: "A rainy night in", setting: "A storm outside, the power flickering, blankets on the sofa and nowhere to be.", place: "home, on the sofa", time: "night", outfit: "something soft and comfortable", opening: "Settle in next to the user and start a cozy, unhurried conversation." },
  { id: "first-meeting", title: "First meeting", setting: "A crowded bookshop café on a Saturday. Only one seat is left, and it's at the user's table.", place: "a bookshop café", time: "Saturday afternoon", opening: "Ask if the seat is free, and let something about the user catch your interest." },
  { id: "late-night-call", title: "A late-night call", setting: "Past midnight. Neither of you can sleep, and one of you just picked up the phone.", place: "on the phone, at home", time: "past midnight", opening: "Answer softly, a little sleepy, glad it's the user." },
];

export const LS_SCENARIO_CARDS = "scenario_cards";

export const loadCustomCards = (): ScenarioCard[] => {
  try {
    const raw = localStorage.getItem(LS_SCENARIO_CARDS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((c) => c && c.title && c.setting && c.opening) : [];
  } catch {
    return [];
  }
};

export const saveCustomCards = (cards: ScenarioCard[]): void => {
  try {
    localStorage.setItem(LS_SCENARIO_CARDS, JSON.stringify(cards));
  } catch {
    // Storage full or blocked: the cards just aren't kept.
  }
};

export const makeCardId = (): string => `card-${Date.now().toString(36)}`;

export const buildOpeningDirective = (card: ScenarioCard): string =>
  `A new scene starts now. ${card.setting}${card.outfit ? ` You're wearing ${card.outfit}.` : ""} Open the scene: ${card.opening} Write it as the start of this new scene, not a continuation of what came before.`;

export const TIME_SKIPS = ["Later that night", "The next morning", "A few days later", "A week later"];

export const buildTimeSkipPrompt = (skip: string, transcript: string, current: { time?: string; location?: string }): string =>
  `This is a roleplay. Write the short scene transition for a time skip: "${skip}".

What just happened:
${transcript}
${current.time || current.location ? `\nUntil now: ${[current.location && `place: ${current.location}`, current.time && `time: ${current.time}`].filter(Boolean).join("; ")}\n` : ""}
Reply in exactly this format:
NARRATION: <one or two sentences of third-person narration that move the story to "${skip}": where things stand and what's changed, without dialogue and without deciding anything for the user>
TIME: <the new time of day, a few words>
PLACE: <where the scene is now, a few words>`;

export const parseTimeSkip = (reply: string, skip: string): { narration: string; time?: string; place?: string } => {
  const field = (name: string) => reply.match(new RegExp(`${name}:\\s*(.+)`, "i"))?.[1].trim();
  const narration = field("NARRATION") || `${skip}...`;
  return { narration: narration.replace(/^["“]|["”]$/g, ""), time: field("TIME"), place: field("PLACE") };
};
