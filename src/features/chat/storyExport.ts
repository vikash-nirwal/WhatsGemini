import { Message, StoryScript } from "../../types";
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

// "Export as a book" (#241): a Story or adventure as something to read
// straight through, in Markdown or as one self-contained HTML page. The
// title and premise come first, then the story in order, with the
// chapters ("End chapter" and "Finish this beat" summaries) and the
// script's beats as headings. The player's turns are set apart from the
// narration; the choices offered, rolls, hidden messages and the AI's
// summaries are left out, since they're how the game ran, not the story.

export interface StoryBookInput {
  title: string;
  premise?: string;
  playerName: string; // who the player's turns are by
  script?: StoryScript; // for the beats' headings
  messages: Message[];
}

export type BookBlock =
  | { kind: "chapter"; number: number; title?: string; recap?: string }
  | { kind: "beat"; number: number; text: string }
  | { kind: "player"; text: string }
  | { kind: "narration"; text: string; images: string[] };

export const buildStoryBook = ({ script, messages }: Pick<StoryBookInput, "script" | "messages">): BookBlock[] => {
  // As in the chat export, a chapter summary closes the chapter before it,
  // so its title belongs above that stretch of the story.
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
  const blocks: BookBlock[] = [];
  let lastBeat: number | undefined;
  segments.forEach((segment, i) => {
    if (segment.messages.length === 0) return;
    if (hasChapters) blocks.push({ kind: "chapter", number: i + 1, title: segment.title, recap: segment.recap });
    for (const m of segment.messages) {
      // A beat's heading goes where its first turn is, as the story shows it.
      if (m.beat != null && m.beat !== lastBeat) {
        const text = script?.beats[m.beat - 1]?.text;
        if (text) blocks.push({ kind: "beat", number: m.beat, text });
        lastBeat = m.beat;
      }
      const text = (m.txt || "").replace(IMAGE_CONTEXT_TAG, "").trim();
      if (m.role === YOU && !m.isNarration) {
        if (text) blocks.push({ kind: "player", text });
      } else if (text || (m.images && m.images.length > 0)) {
        blocks.push({ kind: "narration", text, images: m.images || [] });
      }
    }
  });
  return blocks;
};

const chapterHeading = (b: { number: number; title?: string }) => `Chapter ${b.number}${b.title ? `: ${b.title}` : ""}`;

export const buildBookMarkdown = (input: StoryBookInput): string => {
  const out: string[] = [`# ${input.title}`, ""];
  if (input.premise?.trim()) out.push(`_${input.premise.trim()}_`, "");
  for (const b of buildStoryBook(input)) {
    if (b.kind === "chapter") {
      out.push(`## ${chapterHeading(b)}`, "");
      if (b.recap) out.push(`> ${b.recap}`, "");
    } else if (b.kind === "beat") {
      out.push(`### ${b.text}`, "");
    } else if (b.kind === "player") {
      // A quote, so the player's turns stand apart from the narration.
      out.push(b.text.split("\n").map((line, i) => `> ${i === 0 ? `**${input.playerName}:** ` : ""}${line}`).join("\n"), "");
    } else {
      if (b.text) out.push(b.text, "");
      const pictures = imageLines(b.images);
      if (pictures.length > 0) out.push(...pictures, "");
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
};

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Just the Markdown the narrator writes (bold names, italics), turned into
// paragraphs; everything is escaped first, so nothing in a reply can add
// markup or scripts to the page.
const inlineHtml = (text: string) =>
  escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^\w])_(?!\s)(.+?)_(?!\w)/g, "$1<em>$2</em>");
const paragraphs = (text: string, className?: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p${className ? ` class="${className}"` : ""}>${inlineHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

const BOOK_STYLE = `body{margin:0;background:#faf7f2;color:#2a2622;font:18px/1.7 Georgia,"Times New Roman",serif}
main{max-width:680px;margin:0 auto;padding:48px 20px 80px}
h1{font-size:2.2em;line-height:1.2;margin:0 0 .4em}
.premise{font-style:italic;color:#6b625a;margin-bottom:2.5em}
h2{font-size:1.5em;margin:2.5em 0 .6em;border-top:1px solid #e3dcd2;padding-top:1.2em}
h3{font-size:1.1em;font-variant:small-caps;letter-spacing:.03em;color:#7a5c3e;margin:2em 0 .6em}
.recap{font-style:italic;color:#6b625a}
.player{margin:1.2em 0;padding:.4em 0 .4em 1em;border-left:3px solid #c9a46a;color:#4a3f35;font-family:system-ui,sans-serif;font-size:.9em}
img{max-width:100%;border-radius:8px}
@media (prefers-color-scheme:dark){body{background:#1d1b19;color:#e8e2da}.premise,.recap{color:#a99f94}h2{border-color:#3a3530}h3{color:#d1ae84}.player{color:#d8cfc4}}`;

export const buildBookHtml = (input: StoryBookInput): string => {
  const body: string[] = [`<h1>${escapeHtml(input.title)}</h1>`];
  if (input.premise?.trim()) body.push(`<p class="premise">${inlineHtml(input.premise.trim())}</p>`);
  for (const b of buildStoryBook(input)) {
    if (b.kind === "chapter") {
      body.push(`<h2>${escapeHtml(chapterHeading(b))}</h2>`);
      if (b.recap) body.push(`<p class="recap">${inlineHtml(b.recap)}</p>`);
    } else if (b.kind === "beat") {
      body.push(`<h3>${escapeHtml(b.text)}</h3>`);
    } else if (b.kind === "player") {
      body.push(`<p class="player"><strong>${escapeHtml(input.playerName)}:</strong> ${inlineHtml(b.text).replace(/\n+/g, "<br>")}</p>`);
    } else {
      if (b.text) body.push(paragraphs(b.text));
      // Only pictures with a web address: local ones live in this browser
      // and would be missing from the file anyway.
      for (const src of b.images.filter((u) => /^https?:\/\//.test(u))) body.push(`<p><img src="${escapeHtml(src)}" alt="Picture"></p>`);
    }
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<style>
${BOOK_STYLE}
</style>
</head>
<body>
<main>
${body.join("\n")}
</main>
</body>
</html>
`;
};

export const bookFileName = (title: string, format: "md" | "html"): string => storyFileName(title).replace(/\.md$/, `.${format}`);
