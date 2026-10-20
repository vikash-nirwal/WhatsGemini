import { Message } from "../../types";
import { YOU } from "../../utils/constants";

// "Export as story" (#20): a chat as readable Markdown - who said what, the
// narrator lines and chapter headings - to reread or share, unlike the raw
// JSON export, which is for backups. Leaves out hidden priming messages,
// flagged refusals and the AI's internal summaries (the story itself is all
// still there, since compression no longer deletes anything).

export interface StoryExportInput {
  title: string;
  userName: string;
  speakerNames: Record<number, string>; // character id -> name
  primaryName: string; // who speaks when a message has no speakerId
  messages: Message[];
  exportedAt?: Date;
}

const IMAGE_CONTEXT_TAG = /\n*\[Image Context:[\s\S]*?\]\s*$/i;

const imageLines = (images: string[] | undefined): string[] =>
  (images || []).map((src) => (/^https?:\/\//.test(src) ? `![Picture](${src})` : "_(picture)_"));

export const buildStoryMarkdown = ({ title, userName, speakerNames, primaryName, messages, exportedAt = new Date() }: StoryExportInput): string => {
  const cast = Array.from(new Set([primaryName, ...Object.values(speakerNames)])).filter(Boolean);
  const out: string[] = [`# ${title}`, "", `_With ${cast.join(", ")} · exported ${exportedAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}_`, ""];

  // Chapter summaries close a chapter, so its title belongs above the
  // messages before it: collect the stretches first, then write them out.
  const segments: { title?: string; recap?: string; messages: Message[] }[] = [{ messages: [] }];
  for (const m of messages) {
    if (m.isCompressionSummary) {
      if (m.chapterTitle) {
        segments[segments.length - 1].title = m.chapterTitle;
        segments[segments.length - 1].recap = m.chapterRecap;
        segments.push({ messages: [] });
      }
      continue;
    }
    if (m.isSystem || m.isRefusal) continue;
    segments[segments.length - 1].messages.push(m);
  }
  const hasChapters = segments.some((s) => s.title);

  segments.forEach((segment, i) => {
    if (segment.messages.length === 0) return;
    if (hasChapters) {
      out.push(`## Chapter ${i + 1}${segment.title ? `: ${segment.title}` : ""}`, "");
      if (segment.recap) out.push(`> ${segment.recap}`, "");
    }
    for (const m of segment.messages) {
      const text = (m.txt || "").replace(IMAGE_CONTEXT_TAG, "").trim();
      if (m.isRoomEvent) {
        out.push(`_— ${text} —_`, "");
      } else if (m.isNarration) {
        out.push(`*${text}*`, "");
      } else {
        const speaker = m.role === YOU ? userName : (m.speakerId != null ? speakerNames[m.speakerId] : undefined) || primaryName;
        if (text) out.push(`**${speaker}:** ${text}`, "");
        const pictures = imageLines(m.images);
        if (pictures.length > 0) out.push(...pictures, "");
      }
    }
  });

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
};

// A filesystem-safe name for the download.
export const storyFileName = (title: string): string =>
  `${(title || "story").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "story"}.md`;
