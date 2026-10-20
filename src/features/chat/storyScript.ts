import { StoryBeat, StoryScript } from "../../types";

// Story script (#57): the story a chat must stay inside, written before (or
// during) the roleplay. Every reply is given the premise, the directions,
// the ending and only the current beat, so the model works toward one step
// at a time instead of racing through the plot or inventing its own. It
// reports reaching the beat with a hidden [Beat done] tag (parsed off like
// the emotion tag), and the app moves on to the next one.

export const emptyScript = (): StoryScript => ({ premise: "", beats: [], directions: "", ending: "", mode: "strict", currentBeat: 0 });

const newBeatId = () => `beat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const makeBeat = (text: string): StoryBeat => ({ id: newBeatId(), text });

// Blank beats are dropped, and the current beat kept in range.
export const cleanScript = (script: StoryScript): StoryScript | undefined => {
  const beats = script.beats.map((b) => ({ ...b, text: b.text.trim() })).filter((b) => b.text);
  const cleaned: StoryScript = {
    premise: script.premise.trim(),
    beats,
    directions: script.directions.trim(),
    ending: script.ending?.trim() || "",
    mode: script.mode,
    currentBeat: Math.max(0, Math.min(script.currentBeat, beats.length)),
  };
  return cleaned.premise || cleaned.beats.length > 0 || cleaned.directions || cleaned.ending ? cleaned : undefined;
};

export const isFinished = (script: StoryScript) => script.beats.length > 0 && script.currentBeat >= script.beats.length;

// Moves to another beat: +1 when the current one is done (or skipped), -1
// to go back. Past the last beat means the story has reached its end.
export const moveBeat = (script: StoryScript, step: number): StoryScript => ({
  ...script,
  currentBeat: Math.max(0, Math.min(script.currentBeat + step, script.beats.length)),
});

const MODE_RULES: Record<StoryScript["mode"], string> = {
  strict:
    "Stay strictly inside this story. Don't add new plot lines, characters or twists that aren't in it. If the user goes off-script, play along for a reply at most, then steer the scene back toward the current beat in character, without mentioning the script.",
  loose:
    "Follow this story's direction, but improvise freely between beats: small events, side conversations and details of your own are fine as long as the scene keeps moving toward the current beat.",
};

// The system-prompt section. It sits in the system instruction, which is
// never compressed, so the story survives however long the chat gets.
export const buildStoryScriptSection = (script: StoryScript): string => {
  const parts = ["This roleplay follows a story the user wrote. You must work inside it."];
  if (script.premise) parts.push(`Premise: ${script.premise}`);
  if (script.directions) parts.push(`The user's directions (always follow them): ${script.directions}`);
  if (script.beats.length > 0) {
    if (isFinished(script)) {
      parts.push(`Every planned beat has happened.${script.ending ? ` Bring the story to this ending: ${script.ending}` : " Wrap the story up naturally."}`);
    } else {
      const n = script.currentBeat + 1;
      parts.push(
        `The story is told in ${script.beats.length} beats; you're on beat ${n}. Current beat: ${script.beats[script.currentBeat].text}`,
        "Work toward the current beat over the next replies, at a natural pace; don't jump ahead to later beats, and don't rush it into one reply unless the user does. When the current beat has fully happened in the story, end that reply with the tag [Beat done] on its own line. Never explain or mention the tag."
      );
      if (script.ending) parts.push(`Where it's all heading (don't reveal it early): ${script.ending}`);
    }
  } else if (script.ending) {
    parts.push(`Where the story should end up (don't reveal it early): ${script.ending}`);
  }
  parts.push(MODE_RULES[script.mode]);
  return parts.join("\n");
};

const BEAT_TAG = /\n*[\s*_]*\[\s*beat\s*(?::\s*)?(?:done|complete|completed|reached)\s*\][\s*_.!]*\s*$/i;

export const extractBeatTag = (text: string): { text: string; beatDone: boolean } => {
  const match = text.match(BEAT_TAG);
  if (!match) return { text, beatDone: false };
  return { text: text.slice(0, match.index).trimEnd(), beatDone: true };
};

// While a reply streams in: hide the tag, and one that's only partly there.
const PARTIAL_BEAT_TAG = /\n*\[\s*(?:b(?:e(?:a(?:t(?:\s*:?\s*(?:d(?:o(?:n(?:e)?)?)?)?)?)?)?)?)?$/i;
export const stripStreamingBeatTag = (text: string): string => text.replace(BEAT_TAG, "").replace(PARTIAL_BEAT_TAG, "").trimEnd();

// "Paste a story": the AI splits the user's text into a script for review.
export const buildScriptDraftPrompt = (story: string): string =>
  `Turn the user's story or script below into a roleplay plan. Keep their plot, names and order of events; don't add new events.

Reply with only a JSON object, no code fence:
{"premise": "the setup: world, situation and who everyone is, 1-3 sentences", "beats": ["each key event, in order, one short sentence each, 3 to 10 of them"], "directions": "tone, pacing and rules the story implies, or empty", "ending": "how it ends, or empty"}

Story:
${story}`;

export const parseScriptDraft = (reply: string): Pick<StoryScript, "premise" | "beats" | "directions" | "ending"> | undefined => {
  const raw = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const data = JSON.parse(raw.slice(start, end + 1));
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const beats = Array.isArray(data.beats) ? data.beats.map(str).filter(Boolean).map(makeBeat) : [];
    if (!str(data.premise) && beats.length === 0) return undefined;
    return { premise: str(data.premise), beats, directions: str(data.directions), ending: str(data.ending) };
  } catch {
    return undefined;
  }
};

// Templates: a script saved to reuse with other characters, kept in this
// browser (and in the settings export).
export const LS_STORY_TEMPLATES = "story_script_templates";

export interface StoryTemplate {
  id: string;
  name: string;
  script: StoryScript;
}

export const loadStoryTemplates = (): StoryTemplate[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_STORY_TEMPLATES) || "[]");
    return Array.isArray(parsed) ? parsed.filter((t) => t && typeof t.name === "string" && t.script) : [];
  } catch {
    return [];
  }
};

export const saveStoryTemplate = (name: string, script: StoryScript): StoryTemplate[] => {
  const templates = loadStoryTemplates().filter((t) => t.name !== name);
  const next = [...templates, { id: newBeatId(), name, script: { ...script, currentBeat: 0 } }];
  localStorage.setItem(LS_STORY_TEMPLATES, JSON.stringify(next));
  return next;
};
