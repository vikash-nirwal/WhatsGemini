import { MessageNote } from "../../types";
import { extractPointsTags, PointsChange, stripStreamingPoints } from "../world/points";

// Story tags (#97, #98, #100): short tags a reply can close with, which the
// app strips and acts on - the character got upset or made up with you, told
// a lie (with the truth), was caught in one, or brought up a rumor. Like the
// secret tag (#81), each is stripped wherever the model put it.

export interface StoryTags {
  upset?: string; // what about
  madeUp?: boolean;
  lie?: string; // the truth
  lieCaught?: number; // 1-based, into the standing lies the prompt listed
  rumorRaised?: boolean;
  points?: PointsChange[]; // how they feel moved (#234), toward you or someone named
}

const UPSET = /\n?[ \t]*\[\s*upset\s*:\s*([^\]\n]*)\]\s*/i;
const MADE_UP = /\n?[ \t]*\[\s*made\s+up\s*\]\s*/i;
const LIE_CAUGHT = /\n?[ \t]*\[\s*lie\s+caught\s*:?\s*(\d+)?\s*\]\s*/i;
const LIE = /\n?[ \t]*\[\s*lie\s*:\s*([^\]\n]*)\]\s*/i;
const RUMOR = /\n?[ \t]*\[\s*rumou?r\s+raised\s*\]\s*/i;

const cut = (text: string, match: RegExpMatchArray): string =>
  `${text.slice(0, match.index)}${text.slice((match.index || 0) + match[0].length)}`;

export const extractStoryTags = (text: string): { text: string; tags: StoryTags } => {
  let out = text;
  const tags: StoryTags = {};
  const upset = out.match(UPSET);
  if (upset) {
    out = cut(out, upset);
    tags.upset = upset[1].trim() || "something you said";
  }
  const madeUp = out.match(MADE_UP);
  if (madeUp) {
    out = cut(out, madeUp);
    tags.madeUp = true;
  }
  // "Lie caught" first: the plain lie pattern would otherwise not match it,
  // but checking it first keeps the two clearly apart.
  const caught = out.match(LIE_CAUGHT);
  if (caught) {
    out = cut(out, caught);
    tags.lieCaught = caught[1] ? Number(caught[1]) : 1;
  }
  const lie = out.match(LIE);
  if (lie && lie[1].trim()) {
    out = cut(out, lie);
    tags.lie = lie[1].trim();
  }
  const rumor = out.match(RUMOR);
  if (rumor) {
    out = cut(out, rumor);
    tags.rumorRaised = true;
  }
  const points = extractPointsTags(out);
  out = points.text;
  if (points.changes.length) tags.points = points.changes;
  return { text: out.trim(), tags };
};

export const hasStoryTags = (tags: StoryTags | undefined): boolean =>
  Boolean(tags && (tags.upset || tags.madeUp || tags.lie || tags.lieCaught || tags.rumorRaised || tags.points?.length));

// While streaming: whole tags, and one still being typed at the very end.
export const stripStreamingStoryTags = (text: string): string =>
  [UPSET, MADE_UP, LIE_CAUGHT, LIE, RUMOR]
    .reduce((out, re) => out.replace(new RegExp(re.source, "gi"), "\n"), stripStreamingPoints(text))
    .replace(/\[\s*(u(p(s(e(t[^\]]*)?)?)?)?|m(a(d(e[^\]]*)?)?)?|l(i(e[^\]]*)?)?|r(u(m[^\]]*)?)?)$/i, "")
    .trimEnd();

// The notes shown under a reply, and what they say.
export const NOTE_LABELS: Record<MessageNote, { emoji: string; text: string }> = {
  "texted-first": { emoji: "💬", text: "Texted first" },
  dream: { emoji: "💤", text: "A dream" },
  upset: { emoji: "😠", text: "Upset with you" },
  "made-up": { emoji: "🤝", text: "Made up" },
  "lie-caught": { emoji: "🫢", text: "Caught in a lie" },
  rumor: { emoji: "👂", text: "Heard a rumor" },
};
