// Long chats (the out-of-memory crash of 2026-11-18): the chat used to
// render every message it had, and every bubble re-rendered on each step of
// a streaming reply. A chat of a few thousand messages took the tab past
// what Chrome allows it, and sending froze or crashed it. Now only the
// newest messages are rendered, with "Show earlier messages" above them.

// How many messages a chat renders when it opens, and how many more each
// "Show earlier messages" adds.
export const RENDER_WINDOW = 150;

// A message brought into view (a search match, the unread line, a bookmark)
// gets a few before it, so it isn't the very first thing on the list.
const CONTEXT = 3;

// The index of the first message to render. `pinnedFrom` is where the window
// started when the chat opened (or was last widened), so new messages add to
// the bottom without dropping any from the top while you read. A chat that
// shrinks (a shorter branch, a deleted message) still shows its newest
// `size`. Every index in `mustShow` (-1 for none) is kept in the window.
export const renderWindowStart = (length: number, pinnedFrom: number | undefined, mustShow: number[] = [], size = RENDER_WINDOW): number => {
  let start = Math.min(pinnedFrom ?? Infinity, Math.max(0, length - size));
  for (const index of mustShow) {
    if (index >= 0 && index < length) start = Math.min(start, Math.max(0, index - CONTEXT));
  }
  return Math.max(0, start);
};

// Asks the open chat to bring a message into view, rendering it first if
// it's older than what's shown. For jumps from outside the chat list: a
// bookmark or chapter in the Scene panel, a starred message.
const SHOW_MESSAGE_EVENT = "kindred:show-message";

export const showMessage = (id: string) => {
  window.dispatchEvent(new CustomEvent<string>(SHOW_MESSAGE_EVENT, { detail: id }));
};

export const onShowMessage = (handler: (id: string) => void): (() => void) => {
  const listener = (event: Event) => {
    const id = (event as CustomEvent<string>).detail;
    if (typeof id === "string" && id) handler(id);
  };
  window.addEventListener(SHOW_MESSAGE_EVENT, listener);
  return () => window.removeEventListener(SHOW_MESSAGE_EVENT, listener);
};
