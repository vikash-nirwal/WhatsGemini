import { ConversationTree, Message } from "../../types";
import { findDefaultLeafFrom } from "./messageTree";

// Branch map (#53): the conversation tree drawn as storylines. Runs of
// messages with no fork are folded into one segment, so the map shows only
// where the story splits; each segment opens at the branch's latest point.

export interface BranchSegment {
  startId: string;
  endId: string;
  count: number; // visible messages in the segment
  first: string; // preview of its first visible message
  last: string; // preview of its last visible message
  onActivePath: boolean;
  isActiveLeaf: boolean; // the conversation currently ends in this segment
  children: BranchSegment[];
}

const visible = (m: Message) => !m.isSystem && !m.isCompressionSummary;

const preview = (m: Message | undefined): string => {
  const text = (m?.txt || "").replace(/\n*\[Image Context:[\s\S]*?\]\s*$/i, "").replace(/\s+/g, " ").trim();
  if (!text) return m?.images?.length ? "(a picture)" : "";
  return text.length > 90 ? `${text.slice(0, 87).trimEnd()}...` : text;
};

const pathIds = (tree: ConversationTree, leafId: string | null | undefined): Set<string> => {
  const ids = new Set<string>();
  let current = leafId ? tree.nodes[leafId] : undefined;
  while (current) {
    ids.add(current.id);
    current = current.parentId ? tree.nodes[current.parentId] : undefined;
  }
  return ids;
};

export const buildBranchMap = (tree: ConversationTree, activeLeafId: string | null | undefined): BranchSegment[] => {
  const active = pathIds(tree, activeLeafId);
  const segmentFrom = (startId: string): BranchSegment => {
    const messages: Message[] = [];
    let id = startId;
    // Follow the chain while there's exactly one way forward.
    while (true) {
      const node = tree.nodes[id];
      messages.push(node.message);
      if (node.childIds.length !== 1) break;
      id = node.childIds[0];
    }
    const end = tree.nodes[id];
    const shown = messages.filter(visible);
    return {
      startId,
      endId: id,
      count: shown.length,
      first: preview(shown[0]),
      last: preview(shown[shown.length - 1]),
      onActivePath: active.has(startId),
      isActiveLeaf: active.has(id) && end.childIds.every((c) => !active.has(c)),
      children: end.childIds.filter((c) => tree.nodes[c]).map(segmentFrom),
    };
  };
  const roots = Object.values(tree.nodes).filter((n) => n.parentId === null || !tree.nodes[n.parentId]);
  return roots.map((r) => segmentFrom(r.id));
};

export const hasBranches = (tree: ConversationTree | undefined): boolean =>
  Boolean(tree && Object.values(tree.nodes).some((n) => n.childIds.length > 1));

export const countStorylines = (segments: BranchSegment[]): number =>
  segments.reduce((n, s) => n + (s.children.length === 0 ? 1 : countStorylines(s.children)), 0);

// Where jumping to a segment lands: the latest point of that branch.
export const leafForSegment = (tree: ConversationTree, segment: BranchSegment): string => findDefaultLeafFrom(tree, segment.startId);
