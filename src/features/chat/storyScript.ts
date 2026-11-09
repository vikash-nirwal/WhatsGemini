import { StoryBeat, StoryCastMember, StoryScript } from "../../types";
import { STORY_LENGTHS, StoryLength } from "./storyLength";

// Story script (#57): the story a chat must stay inside, written before (or
// during) the roleplay. Every reply is given the premise, the directions,
// the ending and only the current beat, so the model works toward one step
// at a time instead of racing through the plot or inventing its own. It
// reports reaching the beat with a hidden [Beat done] tag (parsed off like
// the emotion tag), and the app moves on to the next one.

export const emptyScript = (): StoryScript => ({ premise: "", beats: [], directions: "", ending: "", mode: "strict", currentBeat: 0 });

const newBeatId = () => `beat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const makeBeat = (text: string, details?: string): StoryBeat => ({ id: newBeatId(), text, ...(details ? { details } : {}) });
export const makeCastMember = (name: string, about = ""): StoryCastMember => ({ id: newBeatId().replace("beat", "cast"), name, about });

// Blank beats are dropped, and the current beat kept in range.
export const cleanScript = (script: StoryScript): StoryScript | undefined => {
  const beats = script.beats
    .map((b) => {
      const details = b.details?.trim();
      const beat: StoryBeat = { id: b.id, text: b.text.trim() };
      if (details) beat.details = details;
      if (b.intimate) beat.intimate = true;
      return beat;
    })
    .filter((b) => b.text);
  const cast = (script.cast || []).map((c) => ({ ...c, name: c.name.trim(), about: c.about.trim() })).filter((c) => c.name);
  const cleaned: StoryScript = {
    premise: script.premise.trim(),
    beats,
    ...(cast.length > 0 ? { cast } : {}),
    directions: script.directions.trim(),
    ...(script.instructions?.trim() ? { instructions: script.instructions.trim() } : {}),
    ending: script.ending?.trim() || "",
    mode: script.mode,
    currentBeat: Math.max(0, Math.min(script.currentBeat, beats.length)),
    ...(script.source?.trim() ? { source: keepSource(script.source) } : {}),
  };
  return cleaned.premise || cleaned.beats.length > 0 || cleaned.directions || cleaned.instructions || cleaned.ending ? cleaned : undefined;
};

// The user's tweaks to the story (#261). They're stated as overriding the
// story text, since changing what the story says is their whole point.
export const instructionsLine = (instructions: string) =>
  `The user's changes to this story (always follow them; where the story says otherwise, these win): ${instructions.trim()}`;

export const isFinished = (script: StoryScript) => script.beats.length > 0 && script.currentBeat >= script.beats.length;

// The beat a new reply belongs to, stamped on it so the chat can show where
// each beat starts. Nothing once the beats are done, or with no beats.
export const beatStamp = (script: StoryScript | undefined): { beat?: number } =>
  script && script.beats.length > 0 && !isFinished(script) ? { beat: script.currentBeat + 1 } : {};

// Indexes of the messages where a new beat starts: the first reply stamped
// with each beat after a different one.
export const beatStarts = (messages: { beat?: number }[]): Set<number> => {
  const starts = new Set<number>();
  let last: number | undefined;
  messages.forEach((m, i) => {
    if (m.beat == null) return;
    if (m.beat !== last) starts.add(i);
    last = m.beat;
  });
  return starts;
};

// Moves to another beat: +1 when the current one is done (or skipped), -1
// to go back. Past the last beat means the story has reached its end.
export const moveBeat = (script: StoryScript, step: number): StoryScript => ({
  ...script,
  currentBeat: Math.max(0, Math.min(script.currentBeat + step, script.beats.length)),
});

const MODE_RULES: Record<StoryScript["mode"], string> = {
  strict:
    "Stay strictly inside this story. Use the story's own events, people and lines for the current beat, in the story's order. Don't add new plot lines, characters or twists that aren't in it. If the user goes off-script, play along for a reply at most, then steer the scene back toward the current beat in character, without mentioning the script.",
  loose:
    "Follow this story's direction, but improvise freely between beats: small events, side conversations and details of your own are fine as long as the scene keeps moving toward the current beat.",
};

// Who's in the story and who plays whom. In a chat (`characterName` given)
// the character also voices everyone nobody plays, so a reply can carry
// several of the story's people, each line under its speaker's name; the
// app shows those lines as they come. A narrator voices them all anyway.
const buildCastSection = (cast: StoryCastMember[], characterName?: string, room = false): string[] => {
  const lines = cast.map((c) => {
    const who = c.playedBy === "user" ? " (the user plays them)" : c.playedBy === "character" && characterName && !room ? ` (you, ${characterName}, play them)` : "";
    return `- ${c.name}${who}${c.about ? `: ${c.about}` : ""}`;
  });
  const parts = [`The story's characters:\n${lines.join("\n")}`];
  if (!characterName) return parts;
  const userPart = cast.find((c) => c.playedBy === "user")?.name;
  const voiced = cast.filter((c) => !c.playedBy || (room && c.playedBy === "character")).map((c) => c.name);
  if (voiced.length > 0) {
    parts.push(
      `Besides yourself, you voice the story's other characters (${voiced.join(", ")}) whenever the scene needs them, so one reply can have several of them speaking and acting. Start each of their turns on a new line with their name in bold, like **${voiced[0]}:** and then what they say or do; your own lines need no name.${userPart ? ` Never speak or act for ${userPart}, the user's part.` : " Never speak or act for the user."}`
    );
  }
  return parts;
};

// Story parts in group chats (#242). The room member who plays a part, if
// they're still in the room; the user's part is never a member's.
const memberPart = (c: StoryCastMember, members: Record<number, string>): number | undefined =>
  c.playedBy !== "user" && c.playedById != null && members[c.playedById] != null ? c.playedById : undefined;

// Who voices each part nobody plays, by cast id. Every member replies from
// their own prompt, one after another in the same round, so telling them
// all to voice the unplayed people "when the scene needs them" would have
// each of them speak for the same person in turn. Instead each unplayed
// part gets one member, worked out the same way in every member's prompt:
// members without a part of their own first (they have the most room for
// it), shared out in turn by id. Each of the story's people then keeps one
// voice for the whole chat, and the parts stay put as people reply.
export const unplayedVoices = (cast: StoryCastMember[], members: Record<number, string>): Map<string, number> => {
  const ids = Object.keys(members).map(Number).sort((a, b) => a - b);
  const taken = new Set(cast.map((c) => memberPart(c, members)).filter((id): id is number => id != null));
  const free = ids.filter((id) => !taken.has(id));
  const pool = free.length > 0 ? free : ids;
  const voices = new Map<string, number>();
  if (pool.length === 0) return voices;
  cast.filter((c) => c.playedBy !== "user" && memberPart(c, members) == null).forEach((c, i) => voices.set(c.id, pool[i % pool.length]));
  return voices;
};

// A group member's view of the cast: their own part, the others' parts and
// the user's, and the unplayed people they voice under bold names, as in
// 1:1; the rest they leave alone.
const buildRoomCastSection = (cast: StoryCastMember[], characterName: string, selfId: number, members: Record<number, string>): string[] => {
  const voices = unplayedVoices(cast, members);
  const lines = cast.map((c) => {
    const player = memberPart(c, members);
    const voice = voices.get(c.id);
    const who =
      c.playedBy === "user"
        ? " (the user plays them)"
        : player === selfId
          ? ` (you, ${characterName}, play them)`
          : player != null
            ? ` (${members[player]} plays them)`
            : voice != null && voice !== selfId
              ? ` (${members[voice]} voices them)`
              : "";
    return `- ${c.name}${who}${c.about ? `: ${c.about}` : ""}`;
  });
  const parts = [`The story's characters:\n${lines.join("\n")}`];
  const mine = cast.filter((c) => voices.get(c.id) === selfId).map((c) => c.name);
  const others = cast.filter((c) => c.playedBy !== "user" && memberPart(c, members) !== selfId && voices.get(c.id) !== selfId).map((c) => c.name);
  const userPart = cast.find((c) => c.playedBy === "user")?.name;
  const leave = [
    others.length > 0 ? `Leave ${others.join(", ")} to the others in the group: never speak or act for them.` : "",
    userPart ? `Never speak or act for ${userPart}, the user's part.` : "Never speak or act for the user.",
  ].filter(Boolean).join(" ");
  parts.push(
    mine.length > 0
      ? `Besides yourself, you voice ${mine.join(", ")} whenever the scene needs them, so one reply can have several of them speaking and acting. Start each of their turns on a new line with their name in bold, like **${mine[0]}:** and then what they say or do; your own lines need no name. ${leave}`
      : leave
  );
  return parts;
};

// The system-prompt section. It sits in the system instruction, which is
// never compressed, so the story survives however long the chat gets.
// `beforeChoices`: in an adventure the reply must end with its choices
// block, so the beat tag goes just before it instead. `characterName`: the
// chat's character, who also voices the story's other people. In a group
// (#242), `selfId` is the member replying and `members` every member's name
// by id, so each is told their own part and the ones they voice.
export const buildStoryScriptSection = (
  script: StoryScript,
  {
    beforeChoices = false,
    characterName,
    room = false,
    selfId,
    members,
  }: { beforeChoices?: boolean; characterName?: string; room?: boolean; selfId?: number; members?: Record<number, string> } = {}
): string => {
  const parts = ["This roleplay follows a story the user wrote. You must work inside it."];
  if (script.premise) parts.push(`Premise: ${script.premise}`);
  if (script.cast && script.cast.length > 0) {
    parts.push(
      ...(room && characterName && selfId != null && members ? buildRoomCastSection(script.cast, characterName, selfId, members) : buildCastSection(script.cast, characterName, room))
    );
  }
  if (script.directions) parts.push(`The user's directions (always follow them): ${script.directions}`);
  if (script.instructions) parts.push(instructionsLine(script.instructions));
  if (script.beats.length > 0) {
    if (isFinished(script)) {
      parts.push(`Every planned beat has happened.${script.ending ? ` Bring the story to this ending: ${script.ending}` : " Wrap the story up naturally."}`);
    } else {
      const n = script.currentBeat + 1;
      const beat = script.beats[script.currentBeat];
      parts.push(
        `The story is told in ${script.beats.length} beats; you're on beat ${n}. Current beat: ${beat.text}${beat.details ? `\nWhat happens in it, in the story: ${beat.details}` : ""}`,
        `Work toward the current beat over the next replies, at a natural pace; don't jump ahead to later beats, and don't rush it into one reply unless the user does. When the current beat has fully happened in the story, ${beforeChoices ? "put the tag [Beat done] on its own line just before the choices block" : "end that reply with the tag [Beat done] on its own line"}. Never explain or mention the tag.`
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

// The model often forgets the [Beat done] tag, so after a reply without it
// the cheap helper model reads the end of the scene and says whether the
// current beat has happened. That's what moves the story on by itself; the
// buttons in the progress panel are only for nudging it.
export const BEAT_CHECK_MESSAGES = 10;

export const buildBeatCheckPrompt = (script: StoryScript, transcript: string): string => {
  const current = script.beats[script.currentBeat];
  const beat = current?.text || "";
  const next = script.beats[script.currentBeat + 1]?.text;
  return `A roleplay is following a story planned in beats. The current beat is: "${beat}"${current?.details ? `\nWhat happens in it, in the story: ${current.details}` : ""}${next ? `\nThe beat after it (not due yet): "${next}"` : ""}

Read the end of the conversation below. Has the current beat now fully happened in the story? Say yes only if what it describes has clearly taken place in the scene, not if it's only hinted at, planned or just starting.

Reply with only "yes" or "no".

Conversation:
${transcript}`;
};

export const parseBeatCheckReply = (reply: string): boolean => /^[\s*_"'`.]*yes\b/i.test(reply);

// How many beats a pasted story gets: at least 3 and at most 10 for a short
// one, as before, growing with its length (about one per 120-300 words) so
// a long story isn't squeezed into ten giant steps. Only the current beat
// reaches each reply, so a long list costs nothing per message.
export const MAX_BEATS = 60;
export const beatRange = (story: string): { min: number; max: number } => {
  const words = story.trim().split(/\s+/).filter(Boolean).length;
  const max = Math.max(10, Math.min(MAX_BEATS, Math.ceil(words / 120)));
  const min = Math.max(3, Math.min(30, Math.round(words / 300)));
  return { min: Math.min(min, max), max };
};

// Keep the story's text (#240): the pasted story is saved with the script
// so it can be read again (to fill in beat events, or re-split the rest).
// It's capped because it's stored in every save of the chat or adventure
// and in backups; 200k characters is a long novella, far more than the
// helper model is ever sent in one go anyway.
export const STORY_SOURCE_MAX = 200_000;
export const keepSource = (story: string): string => story.trim().slice(0, STORY_SOURCE_MAX);

// "Paste a story": the AI splits the user's text into a script for review,
// with the story's own people so they can be renamed or played.
// With `adult` (#262), the user asked for an 18+ story before it was read,
// so the plan is adapted to one: intimate scenes between adults where the
// story's relationships lead, on beats marked intimate. Ages are never
// changed, and a story with anyone under 18 is left as it is; the minor
// scan on the result still decides whether it's rated 18+.
export const buildScriptDraftPrompt = (story: string, { adult = false }: { adult?: boolean } = {}): string => {
  const { min, max } = beatRange(story);
  const adapt = adult
    ? `

The user wants this as an 18+ story for adults. Adapt it: where the story has romance, attraction or tension between adult characters, let it go further, and add intimate scenes where they fit the plot and the characters, as their own beats or within existing ones. Set "intimate": true on those beats and false on the rest, and in "directions" say how the romance and intimacy build. Everyone involved in anything intimate must be an adult (18 or older); never change anyone's age. If anyone in the story is under 18, or could be, don't adapt it: write the plan as the story is, with every beat "intimate": false.`
    : "";
  return `Turn the user's story or script below into a roleplay plan. Keep their plot, names and order of events; don't add new events${adult ? " other than the intimate scenes asked for below" : ""}.${adapt}

Split it into ${min} to ${max} beats, in order. A long story needs many beats: give each key event its own beat rather than squeezing several into one, one short sentence each.

Reply with only a JSON object, no code fence:
{"premise": "the setup: world, situation and who everyone is, 1-3 sentences", "beats": [{"beat": "the key event, one short sentence", "events": "what happens in it in the story, in order: who's there, what they do and the key lines said, 2-4 sentences"${adult ? ', "intimate": true or false' : ""}}], "cast": [{"name": "a character's name as the story gives it", "about": "who they are: role, personality, look and what they want, 1-2 sentences"}], "directions": "tone, pacing and rules the story implies, or empty", "ending": "how it ends, or empty"}

List every named character who matters to the plot in "cast", main ones first, at most 15.

Story:
${story}`;
};

export const parseScriptDraft = (reply: string): Pick<StoryScript, "premise" | "beats" | "cast" | "directions" | "ending"> | undefined => {
  const raw = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const data = JSON.parse(raw.slice(start, end + 1));
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    // Each beat comes as {beat, events}, or as a plain line from an older reply.
    const beats: StoryBeat[] = (Array.isArray(data.beats) ? data.beats : [])
      .map((b: any) => {
        if (typeof b === "string") return makeBeat(b.trim());
        const beat = makeBeat(str(b?.beat ?? b?.text), str(b?.events ?? b?.details) || undefined);
        // Only an 18+ reading asks for this (#262); the page decides whether it counts.
        return b?.intimate === true ? { ...beat, intimate: true } : beat;
      })
      .filter((b: StoryBeat) => b.text)
      .slice(0, MAX_BEATS);
    if (!str(data.premise) && beats.length === 0) return undefined;
    const seen = new Set<string>();
    const cast = (Array.isArray(data.cast) ? data.cast : [])
      .map((c: any) => (typeof c === "string" ? makeCastMember(c.trim()) : makeCastMember(str(c?.name), str(c?.about))))
      .filter((c: StoryCastMember) => c.name && !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase()))
      .slice(0, 15);
    return { premise: str(data.premise), beats, ...(cast.length > 0 ? { cast } : {}), directions: str(data.directions), ending: str(data.ending) };
  } catch {
    return undefined;
  }
};

// "Read the story again" (#240), for a script whose story was kept: the
// helper reads it once more to (a) fill in what happens in beats that have
// no events yet, keeping the beats and progress, or (b) split the story
// again from a chosen beat on, keeping the beats before it.
const parseJsonObject = (reply: string): any => {
  const raw = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
};

export const beatsMissingDetails = (script: StoryScript): number[] =>
  script.beats.map((b, i) => (b.details?.trim() ? -1 : i)).filter((i) => i >= 0);

export const buildFillDetailsPrompt = (script: StoryScript): string => {
  const missing = new Set(beatsMissingDetails(script));
  const list = script.beats.map((b, i) => `${i + 1}. ${b.text}${missing.has(i) ? " (needs events)" : ""}`).join("\n");
  return `A story has been planned as the beats below. For each beat marked "(needs events)", write what happens in it in the story: who's there, what they do and the key lines said, in order, 2-4 sentences, using only the story's own events. Keep the beats as they are.

Beats:
${list}

Reply with only a JSON object, no code fence:
{"beats": [{"beat": 1, "events": "what happens in beat 1"}]}

Story:
${script.source || ""}`;
};

// Fills in only beats that had no events; anything already written stays.
export const parseFillDetails = (reply: string, script: StoryScript): StoryScript | undefined => {
  const data = parseJsonObject(reply);
  if (!data || !Array.isArray(data.beats)) return undefined;
  const missing = new Set(beatsMissingDetails(script));
  const found = new Map<number, string>();
  for (const b of data.beats) {
    const n = Number(b?.beat ?? b?.n);
    const events = typeof b?.events === "string" ? b.events.trim() : "";
    if (Number.isInteger(n) && missing.has(n - 1) && events) found.set(n - 1, events);
  }
  if (found.size === 0) return undefined;
  return { ...script, beats: script.beats.map((b, i) => (found.has(i) ? { ...b, details: found.get(i) } : b)) };
};

// `from` is the index of the first beat to split again.
export const buildResplitPrompt = (script: StoryScript, from: number): string => {
  const kept = script.beats.slice(0, from);
  const source = script.source || "";
  const { min, max } = beatRange(source);
  const left = Math.max(1, max - kept.length);
  return `A story is being turned into a roleplay plan of beats. ${kept.length > 0 ? `These first beats are already planned; keep them and don't repeat them:\n${kept.map((b, i) => `${i + 1}. ${b.text}`).join("\n")}\n\nSplit the rest of the story, from where beat ${kept.length} ends,` : "Split the whole story"} into beats, in order. Keep the story's plot, names and order of events; don't add new events. Give each key event its own beat, one short sentence each, about ${Math.max(1, Math.min(left, min - kept.length))} to ${left} beats.

Reply with only a JSON object, no code fence:
{"beats": [{"beat": "the key event, one short sentence", "events": "what happens in it in the story, in order: who's there, what they do and the key lines said, 2-4 sentences"}]}

Story:
${source}`;
};

// The beats before `from` are kept as they are, and so is where the story
// is (kept in range), so re-splitting never loses progress.
export const parseResplit = (reply: string, script: StoryScript, from: number): StoryScript | undefined => {
  const data = parseJsonObject(reply);
  if (!data || !Array.isArray(data.beats)) return undefined;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const fresh: StoryBeat[] = data.beats
    .map((b: any) => {
        if (typeof b === "string") return makeBeat(b.trim());
        const beat = makeBeat(str(b?.beat ?? b?.text), str(b?.events ?? b?.details) || undefined);
        // Only an 18+ reading asks for this (#262); the page decides whether it counts.
        return b?.intimate === true ? { ...beat, intimate: true } : beat;
      })
    .filter((b: StoryBeat) => b.text);
  if (fresh.length === 0) return undefined;
  const beats = [...script.beats.slice(0, from), ...fresh].slice(0, MAX_BEATS);
  return { ...script, beats, currentBeat: Math.min(script.currentBeat, beats.length) };
};

// A short reminder of where the story is, sent after the conversation
// (with the author's note), where models weigh instructions most: the
// story section alone sits at the top of a long system prompt and gets
// drowned out by the character and the chat, so strict stories drifted.
// In an 18+ story (`adult`) with beats marked intimate (#255), it also says
// whether this is one of them, so intimacy stays where the story puts it.
export const buildStoryReminder = (script: StoryScript | undefined, { adult = false }: { adult?: boolean } = {}): string | undefined => {
  if (!script || script.beats.length === 0) return undefined;
  if (isFinished(script)) return `Story: every beat has happened; ${script.ending ? `bring it to its ending: ${script.ending}` : "wrap it up"}.`;
  const beat = script.beats[script.currentBeat];
  const where = `Story: beat ${script.currentBeat + 1} of ${script.beats.length}, "${beat.text}"${beat.details ? ` (${beat.details})` : ""}.`;
  const reminder = script.mode === "strict"
    ? `${where} This reply stays inside the story and moves the scene toward that beat with the story's own events, people and lines; no new plot, people or twists.`
    : `${where} Keep the scene moving toward it.`;
  const heat = adult ? beatHeatLine(script) : undefined;
  return heat ? `${reminder} ${heat}` : reminder;
};

// Whether the current beat is one the author marked intimate. Nothing when
// no beat is marked, so stories that don't use it read as before.
export const beatHeatLine = (script: StoryScript): string | undefined => {
  if (!script.beats.some((b) => b.intimate)) return undefined;
  return script.beats[script.currentBeat]?.intimate
    ? "This is one of the story's intimate beats: intimate scenes here can go as far as the intensity allows."
    : "This isn't one of the story's intimate beats: keep to the plot, and leave intimacy for the beats meant for it.";
};

// What the suggested next moves (an adventure's choices, a chat's reply
// suggestions) must do with the story, so they carry it forward instead of
// only answering the last message.
export const storyChoicesRule = (script: StoryScript | undefined, what = "suggestions"): string | undefined => {
  if (!script || script.beats.length === 0) return undefined;
  if (isFinished(script)) return `The story has reached its last part: at least one of the ${what} heads for its ending${script.ending ? ` (${script.ending})` : ""}.`;
  const beat = script.beats[script.currentBeat];
  return `The story is heading for its next event: "${beat.text}"${beat.details ? ` (${beat.details})` : ""}. At least one of the ${what} moves straight toward it${script.mode === "strict" ? `, and all of them stay inside the story` : ""}.`;
};

// "Finish this beat": the rest of the current beat written out, from what
// the story says happens in it, picking up where the scene is now and
// stopping where the next beat begins. Then the beat is summarised like a
// chapter and the story moves on. The reader picks how long it is, what it
// leans on, and can say what they want to happen.
// "Intimacy" is only offered in an 18+ story or chat (#255).
export type BeatFocus = "balanced" | "dialogue" | "description" | "intimacy";
export const BEAT_FOCUS: Record<BeatFocus, { label: string; rule: string; adult?: boolean }> = {
  balanced: { label: "Balanced", rule: "Mix what happens, what it looks and feels like, and what people say." },
  dialogue: { label: "More dialogue", rule: "Lean on the characters talking, each in their own voice, with short bits of action between the lines." },
  description: { label: "More description", rule: "Lean on vivid description: the place, what people do and feel, with only the key lines spoken." },
  intimacy: { label: "Intimacy", rule: "Lean on the closeness between the characters: touch, tension, and what they feel and want, as far as the content rules allow.", adult: true },
};

export interface BeatBridgeOptions {
  secondPerson?: boolean;
  playerName?: string;
  length?: StoryLength;
  focus?: BeatFocus;
  direction?: string; // what the reader wants in it, in their words
  // The content rule and intensity a reply would get (contentNoteFor), since
  // this helper call doesn't carry the narrator's system prompt.
  content?: string;
  adult?: boolean; // the story or chat is effectively NSFW
  toneDown?: string[]; // #256
}

export const buildBeatBridgePrompt = (
  script: StoryScript,
  transcript: string,
  { secondPerson = false, playerName, length = "medium", focus = "balanced", direction, content, adult = false, toneDown }: BeatBridgeOptions = {}
): string => {
  // Intimacy without an 18+ rule would ask for what the story isn't rated for.
  const lean = BEAT_FOCUS[focus].adult && !adult ? "balanced" : focus;
  const soften = (toneDown || []).map((t) => t.trim()).filter(Boolean);
  const heat = adult ? beatHeatLine(script) : undefined;
  const beat = script.beats[script.currentBeat];
  const next = script.beats[script.currentBeat + 1];
  const voice = secondPerson
    ? `Write in second person ("you"), addressing the player${playerName ? ` as ${playerName}` : ""}; describe what they do only as far as the story has them do it.`
    : `Write it as narration in the third person, present tense, naming everyone${playerName ? ` (the user is ${playerName})` : ""}.`;
  const about = [
    `The current beat is: "${beat?.text || ""}"`,
    beat?.details ? `What happens in it, in the story: ${beat.details}` : "",
    script.premise ? `Premise: ${script.premise}` : "",
    script.cast?.length ? `The story's characters:\n${script.cast.map((c) => `- ${c.name}${c.about ? `: ${c.about}` : ""}`).join("\n")}` : "",
    script.directions ? `The author's directions (always follow them): ${script.directions}` : "",
    script.instructions ? instructionsLine(script.instructions) : "",
    next ? `The next beat (don't start it): "${next.text}"` : script.ending ? `How the story ends (don't reach it yet): ${script.ending}` : "",
  ].filter(Boolean);
  const wish = direction?.trim();
  return `A roleplay follows a story planned in beats. ${about.join("\n")}

Write the rest of the current beat as a passage of the story: everything it still needs, its events and the lines people say, in the story's order, picking up exactly where the conversation below leaves off. Skip what has already happened. Stop where the next beat would begin.
- ${voice}
- Show, don't tell: concrete details of the place, body language and what people feel; everyone sounds and acts like themselves.
- ${BEAT_FOCUS[lean].rule}
- Put spoken lines in quotes.
- Length: ${STORY_LENGTHS[length].passage}.${wish ? `\n- The reader's wishes for this passage (follow them, inside the story): ${wish}` : ""}${content ? `\n- ${content}` : ""}${heat ? `\n- ${heat}` : ""}${soften.length > 0 ? `\n- Tone these down - where the story has them, soften them or leave them out: ${soften.join("; ")}.` : ""}

Reply with only the passage.

Conversation so far:
${transcript}`;
};

// The next beat opens itself (#239): once "Finish this beat" has added the
// passage and moved the story on, the narrator writes the next turn straight
// away, opening the new beat (or heading for the ending once every beat is
// done), so the player gets fresh choices instead of a turn with none.
// `script` is the script after the move.
export const buildNextBeatPrompt = (script: StoryScript): string => {
  if (isFinished(script)) {
    return `Continue the story from the passage above: every planned beat has now happened, so move the scene toward the story's ending${script.ending ? ` (${script.ending})` : ""}, and end with the choices block as instructed.`;
  }
  const beat = script.beats[script.currentBeat];
  return `Continue the story from the passage above: the last beat is done, so open the next one now, "${beat?.text || ""}". Set the scene and start moving toward it without rushing through it, and end with the choices block as instructed.`;
};

// Renaming one of the story's people rewrites the whole script, so the
// model never sees the old name and the new one simply is the character.
// The full name is replaced, then the first name on its own ("Elizabeth
// Bennet" to "Lily Bennet" also turns a lone "Elizabeth" into "Lily").
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const replaceName = (text: string, from: string, to: string): string =>
  text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(from)}(?![\\p{L}\\p{N}_])`, "gu"), to);

export const renameInText = (text: string, from: string, to: string): string => {
  const a = from.trim();
  const b = to.trim();
  if (!a || !b || a === b) return text;
  let out = replaceName(text, a, b);
  const firstA = a.split(/\s+/)[0];
  const firstB = b.split(/\s+/)[0];
  if (firstA !== a && firstA.length > 1 && firstA !== firstB) out = replaceName(out, firstA, firstB);
  return out;
};

export const renameInScript = (script: StoryScript, from: string, to: string): StoryScript => {
  const r = (text: string) => renameInText(text, from, to);
  return {
    ...script,
    premise: r(script.premise),
    beats: script.beats.map((b) => ({ ...b, text: r(b.text) })),
    directions: r(script.directions),
    ...(script.instructions ? { instructions: r(script.instructions) } : {}),
    ending: script.ending ? r(script.ending) : script.ending,
    cast: script.cast?.map((c) => ({ ...c, about: r(c.about) })),
  };
};

// Applies every rename made in the editor: each cast member whose name
// differs from what it was (by id) in `before`. The cast's own names are
// already the new ones.
export const applyCastRenames = (script: StoryScript, before: StoryCastMember[] | undefined): StoryScript =>
  (script.cast || []).reduce((acc, member) => {
    const old = before?.find((c) => c.id === member.id)?.name;
    return old && member.name.trim() && old !== member.name.trim() ? renameInScript(acc, old, member.name.trim()) : acc;
  }, script);

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
  // Without the story's text (#240): localStorage is small, and a template
  // is the plan to reuse, not the story it came from.
  const { source: _source, ...plan } = script;
  const next = [...templates, { id: newBeatId(), name, script: { ...plan, currentBeat: 0 } }];
  localStorage.setItem(LS_STORY_TEMPLATES, JSON.stringify(next));
  return next;
};
