import { Message } from "../../types";
import { latestSummaryIndex } from "../ai/utils/transcript";

// Summarising a long chat's older messages in the background (the user's ask,
// 2026-11-20). It used to run inside the send, before the reply was even
// asked for, so a long chat sat silent for the whole summary call. Now the
// reply goes out with the history as it is, and the summary is worked out
// alongside it and spliced in when it's ready. Kept apart from aiSlice so it
// can be unit tested without the provider registry.

// What the summary call found: the summary pair, and where it goes (right
// after `messages[afterIndex]`, the last message it covers).
export interface SummaryResult {
  compressed: boolean;
  summaryMessages?: Message[];
  afterIndex?: number;
  error?: string;
}

// What a run came to. "busy": one was already running for this chat, so this
// one did nothing. "stale": the chat changed under it (another summary went
// in, one was undone, the branch was switched), so its summary was dropped
// rather than spliced into a conversation it no longer describes.
export type CompressionOutcome<R extends SummaryResult> =
  | { status: "busy" | "idle" | "stale" }
  | { status: "done"; result: R }
  | { status: "failed"; error: string };

// A summary call that never answers mustn't stop the chat from ever being
// summarised again: after this long a run no longer counts as running.
export const STALE_AFTER_MS = 5 * 60_000;

// Which chats are being summarised now, and since when.
const running = new Map<number, number>();
const watchers = new Set<() => void>();
const emit = () => watchers.forEach((fn) => fn());

export const isCompressing = (chatId: number | null | undefined, now = Date.now()): boolean => {
  if (chatId == null) return false;
  const since = running.get(chatId);
  return since != null && now - since < STALE_AFTER_MS;
};

export const watchCompressions = (fn: () => void) => {
  watchers.add(fn);
  return () => void watchers.delete(fn);
};

// Claims the chat for one run. Returns the function that lets it go, which
// only lets go of its own claim (a run that outlived STALE_AFTER_MS and was
// replaced mustn't end its replacement), or null when one is already running.
export const claimCompression = (chatId: number, now = Date.now()): (() => void) | null => {
  if (isCompressing(chatId, now)) return null;
  running.set(chatId, now);
  emit();
  return () => {
    if (running.get(chatId) !== now) return;
    running.delete(chatId);
    emit();
  };
};

// For tests: forget every claim.
export const resetCompressions = () => {
  running.clear();
  emit();
};

// The id of the newest summary in a conversation's active path, or null.
export const latestSummaryId = (messages: Message[]): string | null => {
  const at = latestSummaryIndex(messages);
  return at >= 0 ? messages[at].id ?? null : null;
};

// Whether a summary worked out on an earlier copy of the conversation can
// still go into it as it is now: the newest summary must be the one there was
// when it started (else it would fold the same messages twice, or bring back
// what an undo took out), and the last message it covers must still be on
// the active path after that summary. Messages sent in the meantime don't
// matter; they come after that message and stay where they are. An old chat
// saved before messages had ids is matched by place, time and text instead.
export const summaryStillFits = (
  current: Message[],
  expected: { latestSummaryId: string | null; anchor: Message | undefined; afterIndex: number }
): boolean => {
  const { anchor } = expected;
  if (!anchor) return false;
  if (latestSummaryId(current) !== expected.latestSummaryId) return false;
  const anchorAt = anchor.id
    ? current.findIndex((m) => m.id === anchor.id)
    : current[expected.afterIndex]?.timestamp === anchor.timestamp && current[expected.afterIndex]?.txt === anchor.txt ? expected.afterIndex : -1;
  return anchorAt >= 0 && anchorAt > latestSummaryIndex(current);
};

// What the chat looked like when the summary was worked out.
export type SummaryExpectation = Parameters<typeof summaryStillFits>[1];

export interface CompressionDeps<R extends SummaryResult> {
  // The chat's active path as saved now.
  read: () => Promise<Message[]>;
  // The summary call itself (nothing is saved).
  summarise: (messages: Message[]) => Promise<R>;
  // Splices the summary in, checking inside the chat's lock that it still
  // fits (summaryStillFits with `expect`). Resolves false when it didn't.
  insert: (args: { afterMessageId?: string; afterIndex: number; summaryMessages: Message[]; expect: SummaryExpectation }) => Promise<boolean>;
}

// One background run for one chat: never two at once for the same chat, and
// the claim is always let go, whatever happens, so a failure can't leave the
// chat stuck. Never throws.
export const runBackgroundCompression = async <R extends SummaryResult>(chatId: number, deps: CompressionDeps<R>): Promise<CompressionOutcome<R>> => {
  const release = claimCompression(chatId);
  if (!release) return { status: "busy" };
  try {
    const messages = await deps.read();
    const result = await deps.summarise(messages);
    if (!result.compressed || !result.summaryMessages || result.afterIndex == null) {
      return result.error ? { status: "failed", error: result.error } : { status: "idle" };
    }
    const placed = await deps.insert({
      afterMessageId: messages[result.afterIndex]?.id,
      afterIndex: result.afterIndex,
      summaryMessages: result.summaryMessages,
      expect: { latestSummaryId: latestSummaryId(messages), anchor: messages[result.afterIndex], afterIndex: result.afterIndex },
    });
    return placed ? { status: "done", result } : { status: "stale" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  } finally {
    release();
  }
};
