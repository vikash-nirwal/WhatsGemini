import { ConversationTree, Message } from "../../types";

// Search inside a chat (#247): every message whose text has the words, in
// the conversation tree's order, so other branches are found too. The order
// doesn't depend on which branch is showing: jumping to a match on another
// branch switches to it, and the matches then stay where they were in the
// list instead of reshuffling under the user.

export interface ChatSearchMatch {
  id: string; // the message's id, which is also its tree node's id
  active: boolean; // on the branch showing now
  snippet: string; // the words around the first match, for the bar
}

// Accents and case don't count: "cafe" finds "Café".
export const foldForSearch = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// What a message shows as text. Hidden setup messages and summaries aren't
// messages the user wrote or read, so they're never matches.
const searchableText = (m: Message): string => {
  if (m.isSystem || m.isCompressionSummary || !m.id) return "";
  const txt = m.txt || "";
  if (txt.startsWith("Role play as, Character Name:") || txt.startsWith("[SYSTEM DIRECTIVE]:")) return "";
  // The picture tag is for the model; it never shows (the same rule as
  // stripImageContextTag, which can't be imported here without the providers).
  return txt.replace(/[ \t]*\n*\[Image Context:[^\]]*\]/gi, "");
};

const snippetAround = (text: string, at: number, length: number): string => {
  // The position comes from the folded text, which is as long as the text
  // itself unless it was typed with separate accent marks; then the snippet
  // is only a few letters off.
  const start = Math.max(0, at - 30);
  const end = Math.min(text.length, at + length + 50);
  return `${start > 0 ? "..." : ""}${text.slice(start, end).trim()}${end < text.length ? "..." : ""}`;
};

const matchIn = (m: Message, folded: string): { at: number; text: string } | null => {
  const text = searchableText(m).replace(/\s+/g, " ");
  if (!text) return null;
  const at = foldForSearch(text).indexOf(folded);
  return at >= 0 ? { at, text } : null;
};

// Every message in the tree, parents before children and earlier branches
// before later ones; without a tree the chat is just its messages.
const treeOrder = (tree: ConversationTree | undefined, content: Message[]): Message[] => {
  if (!tree || Object.keys(tree.nodes).length === 0) return content;
  const ordered: Message[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    const node = tree.nodes[id];
    if (!node || seen.has(id)) return;
    seen.add(id);
    ordered.push(node.message);
    node.childIds.forEach(visit);
  };
  Object.values(tree.nodes).filter((n) => !n.parentId || !tree.nodes[n.parentId]).forEach((n) => visit(n.id));
  // Anything on the showing branch the tree doesn't have yet still counts.
  for (const m of content) if (m.id && !seen.has(m.id)) ordered.push(m);
  return ordered;
};

export const searchChat = (content: Message[], tree: ConversationTree | undefined, query: string): ChatSearchMatch[] => {
  const folded = foldForSearch(query.replace(/\s+/g, " ").trim());
  if (!folded) return [];
  const showing = new Set(content.map((m) => m.id).filter(Boolean) as string[]);
  const matches: ChatSearchMatch[] = [];
  for (const m of treeOrder(tree, content)) {
    const hit = matchIn(m, folded);
    if (!hit || !m.id) continue;
    matches.push({ id: m.id, active: showing.has(m.id), snippet: snippetAround(hit.text, hit.at, folded.length) });
  }
  return matches;
};

// Where the search starts: the newest match on the showing branch, as other
// chat apps search up from the bottom. None when every match is on another
// branch: typing never switches branches, only choosing a match does.
export const startingMatch = (matches: ChatSearchMatch[]): number => {
  for (let i = matches.length - 1; i >= 0; i--) if (matches[i].active) return i;
  return -1;
};

// One step older (-1) or newer (+1), wrapping round at either end; from no
// match, older starts at the newest and newer at the oldest.
export const stepMatch = (matches: ChatSearchMatch[], current: number, step: 1 | -1): number => {
  if (matches.length === 0) return -1;
  if (current < 0) return step === -1 ? matches.length - 1 : 0;
  return (current + step + matches.length) % matches.length;
};
