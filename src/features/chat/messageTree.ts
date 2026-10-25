import { Message, MessageNode, ConversationTree } from "../../types";

export const generateNodeId = (): string =>
  `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

// Builds a linear tree from a flat message array, assigning an id to any
// message that doesn't already have one. Called lazily the first time a chat
// is branched - chats that are never branched never pay this cost, and this
// is what lets old pre-existing chats (no `tree` field at all) still work.
export const migrateToTree = (content: Message[]): { tree: ConversationTree; activeLeafId: string | null; content: Message[] } => {
  const nodes: Record<string, MessageNode> = {};
  let parentId: string | null = null;
  const newContent: Message[] = [];

  for (const msg of content) {
    const id = msg.id || generateNodeId();
    const message: Message = { ...msg, id };
    nodes[id] = { id, message, parentId, childIds: [] };
    if (parentId) nodes[parentId].childIds.push(id);
    parentId = id;
    newContent.push(message);
  }

  return { tree: { nodes }, activeLeafId: parentId, content: newContent };
};

// Walks leaf -> root via parentId, then reverses - this is what rebuilds
// Chat.content (the flat "active path") after any tree operation.
export const flattenPath = (tree: ConversationTree, leafId: string | null | undefined): Message[] => {
  const result: Message[] = [];
  let current = leafId || null;
  while (current) {
    const node: MessageNode | undefined = tree.nodes[current];
    if (!node) break;
    result.push(node.message);
    current = node.parentId;
  }
  return result.reverse();
};

// History strictly before a node - the context used to regenerate/edit it.
export const getPathToNode = (tree: ConversationTree, nodeId: string | null): Message[] => {
  if (!nodeId) return [];
  const node = tree.nodes[nodeId];
  if (!node) return [];
  return flattenPath(tree, node.parentId);
};

// Adds a new child under parentId (parentId null means "new root"). Returns a
// new tree object (nodes map is shallow-copied) plus the new node's id.
export const addChildNode = (
  tree: ConversationTree,
  parentId: string | null,
  message: Message
): { tree: ConversationTree; nodeId: string } => {
  const id = message.id || generateNodeId();
  const fullMessage: Message = { ...message, id };
  const nodes: Record<string, MessageNode> = { ...tree.nodes, [id]: { id, message: fullMessage, parentId, childIds: [] } };
  if (parentId && nodes[parentId]) {
    nodes[parentId] = { ...nodes[parentId], childIds: [...nodes[parentId].childIds, id] };
  }
  return { tree: { nodes }, nodeId: id };
};

// Splices a chain of new messages into the tree directly after `nodeId`:
// the first new message becomes its only child, and every child it had
// (the following message plus any alternate variants of it) moves under the
// last new message. Used to place a compression summary between the
// messages it summarizes and the ones that follow, so every branch below
// that point picks it up and nothing is deleted.
export const insertAfterNode = (
  tree: ConversationTree,
  nodeId: string,
  messages: Message[]
): { tree: ConversationTree; insertedIds: string[] } => {
  const anchor = tree.nodes[nodeId];
  if (!anchor || messages.length === 0) return { tree, insertedIds: [] };

  const nodes: Record<string, MessageNode> = { ...tree.nodes };
  const insertedIds: string[] = [];
  let parentId = nodeId;
  for (const message of messages) {
    const id = message.id || generateNodeId();
    nodes[id] = { id, message: { ...message, id }, parentId, childIds: [] };
    nodes[parentId] = { ...nodes[parentId], childIds: parentId === nodeId ? [id] : [...nodes[parentId].childIds, id] };
    insertedIds.push(id);
    parentId = id;
  }

  const lastId = parentId;
  nodes[lastId] = { ...nodes[lastId], childIds: [...anchor.childIds] };
  for (const childId of anchor.childIds) {
    if (nodes[childId]) nodes[childId] = { ...nodes[childId], parentId: lastId };
  }
  return { tree: { nodes }, insertedIds };
};

// Places a compression summary pair into a chat's or adventure's
// conversation right after the last message it covers, migrating a flat
// (never-branched) conversation into a tree first. `afterMessageId` is the
// preferred anchor; `afterIndex` (into the active path) covers older
// conversations whose messages only get ids during that migration. Returns
// null when neither points at a real message.
export const spliceSummaryIntoConversation = (
  conversation: { content: Message[]; tree?: ConversationTree; activeLeafId?: string | null },
  afterMessageId: string | undefined,
  afterIndex: number,
  summaryMessages: Message[]
): { tree: ConversationTree; activeLeafId: string | null; content: Message[] } | null => {
  const base = conversation.tree
    ? { tree: conversation.tree, activeLeafId: conversation.activeLeafId ?? null, content: conversation.content }
    : migrateToTree(conversation.content);
  const anchorId = afterMessageId && base.tree.nodes[afterMessageId] ? afterMessageId : base.content[afterIndex]?.id;
  if (!anchorId || !base.tree.nodes[anchorId]) return null;

  const { tree, insertedIds } = insertAfterNode(base.tree, anchorId, summaryMessages);
  // Placed after the newest message (ending a chapter), the summary becomes
  // the new end of the conversation, so the next message follows it.
  const activeLeafId = anchorId === base.activeLeafId && insertedIds.length > 0 ? insertedIds[insertedIds.length - 1] : base.activeLeafId;
  return { tree, activeLeafId, content: flattenPath(tree, activeLeafId) };
};

// Undoes a compression or chapter: takes the summary and its hidden
// acknowledgement back out of the tree, the reverse of
// spliceSummaryIntoConversation. Whatever followed the pair (every branch)
// moves back under the message before it, so nothing else changes, and the
// prompt goes back to including the messages it covered. Returns null when
// `summaryId` isn't a summary in this conversation.
export const removeSummaryFromConversation = (
  conversation: { content: Message[]; tree?: ConversationTree; activeLeafId?: string | null },
  summaryId: string
): { tree: ConversationTree; activeLeafId: string | null; content: Message[] } | null => {
  const base = conversation.tree
    ? { tree: conversation.tree, activeLeafId: conversation.activeLeafId ?? null }
    : migrateToTree(conversation.content);
  const first = base.tree.nodes[summaryId];
  if (!first?.message.isCompressionSummary) return null;

  // The pair: the summary, then its acknowledgement when that's its only child.
  const removed = [first.id];
  let last = first;
  const ack = first.childIds.length === 1 ? base.tree.nodes[first.childIds[0]] : undefined;
  if (ack?.message.isSystem && !ack.message.isCompressionSummary) {
    removed.push(ack.id);
    last = ack;
  }

  const nodes: Record<string, MessageNode> = { ...base.tree.nodes };
  const parentId = first.parentId;
  for (const childId of last.childIds) {
    if (nodes[childId]) nodes[childId] = { ...nodes[childId], parentId };
  }
  if (parentId && nodes[parentId]) {
    const siblings = nodes[parentId].childIds;
    const at = siblings.indexOf(first.id);
    nodes[parentId] = { ...nodes[parentId], childIds: [...siblings.slice(0, at), ...last.childIds, ...siblings.slice(at + 1)] };
  }
  for (const id of removed) delete nodes[id];

  const tree = { nodes };
  const activeLeafId = base.activeLeafId && removed.includes(base.activeLeafId) ? parentId : base.activeLeafId;
  return { tree, activeLeafId, content: flattenPath(tree, activeLeafId) };
};

// Replaces a node's message content in place (used for non-branching text
// edits of an earlier message) without touching its position in the tree.
export const updateNodeMessage = (tree: ConversationTree, nodeId: string, message: Message): ConversationTree => {
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  return { nodes: { ...tree.nodes, [nodeId]: { ...node, message: { ...message, id: nodeId } } } };
};

// This node's position among its siblings - drives the "‹ 2/3 ›" pager. Root
// nodes are compared against every other root (a chat only ever has one root
// in practice, but editing the very first message can create more).
export const getSiblingInfo = (tree: ConversationTree, nodeId: string): { index: number; total: number; siblingIds: string[] } => {
  const node = tree.nodes[nodeId];
  if (!node) return { index: 0, total: 1, siblingIds: [nodeId] };

  const siblingIds = node.parentId
    ? tree.nodes[node.parentId]?.childIds || [nodeId]
    : Object.values(tree.nodes).filter((n) => n.parentId === null).map((n) => n.id);

  const index = siblingIds.indexOf(nodeId);
  return { index: index === -1 ? 0 : index, total: siblingIds.length, siblingIds };
};

// Removes a node and its entire descendant subtree (everything that was
// generated after it in that branch) - used to delete an unwanted variant.
// Returns the parent id so the caller can pick a replacement active leaf
// from a remaining sibling.
export const deleteBranch = (tree: ConversationTree, nodeId: string): { tree: ConversationTree; parentId: string | null } => {
  const node = tree.nodes[nodeId];
  if (!node) return { tree, parentId: null };

  const toRemove = new Set<string>();
  const collect = (id: string) => {
    toRemove.add(id);
    tree.nodes[id]?.childIds.forEach(collect);
  };
  collect(nodeId);

  const nodes: Record<string, MessageNode> = {};
  for (const [id, n] of Object.entries(tree.nodes)) {
    if (!toRemove.has(id)) nodes[id] = n;
  }
  if (node.parentId && nodes[node.parentId]) {
    nodes[node.parentId] = { ...nodes[node.parentId], childIds: nodes[node.parentId].childIds.filter((id) => id !== nodeId) };
  }

  return { tree: { nodes }, parentId: node.parentId };
};

// Given a chosen sibling, find which leaf should become active: descend into
// the most-recently-added child at each level, i.e. resume wherever that
// branch was last left off.
export const findDefaultLeafFrom = (tree: ConversationTree, nodeId: string): string => {
  let current = nodeId;
  while (true) {
    const node = tree.nodes[current];
    if (!node || node.childIds.length === 0) return current;
    current = node.childIds[node.childIds.length - 1];
  }
};

// Takes messages out of the tree (#136), keeping everything else: a removed
// message's children move up to its nearest kept ancestor, in their order.
export const removeNodes = (tree: ConversationTree, ids: Set<string>): ConversationTree => {
  const keptParent = (id: string | null): string | null => {
    let current = id;
    while (current && ids.has(current)) current = tree.nodes[current]?.parentId ?? null;
    return current;
  };
  const nodes: Record<string, MessageNode> = {};
  for (const [id, node] of Object.entries(tree.nodes)) {
    if (!ids.has(id)) nodes[id] = { ...node, parentId: keptParent(node.parentId), childIds: [] };
  }
  for (const [id, node] of Object.entries(nodes)) {
    if (node.parentId && nodes[node.parentId]) nodes[node.parentId].childIds.push(id);
  }
  return { nodes };
};
