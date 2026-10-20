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
