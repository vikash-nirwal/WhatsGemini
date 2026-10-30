import { UsageInfo } from "../ai/types";

// Where the tokens go (the user's ask, 2026-10-30): every text call is
// counted by what it was for, per day, so it's clear whether chat replies,
// world talk, statuses or memory take the context, and whether a change
// helped. Spending (spending.ts) has only the money; this has the tokens.
//
// A caller names the purpose right before a call (tagPurpose); the spending
// wrapper around every adapter takes it at the call's start, before any
// await, so calls running side by side are never mixed up. An untagged
// call counts as "other".

export interface TokenBucket {
  calls: number;
  input: number;
  output: number;
}

type Ledger = Record<string, Record<string, TokenBucket>>; // day (YYYY-MM-DD) -> purpose -> totals

const LS_TOKEN_USAGE = "token_usage";
const KEEP_DAYS = 31;

let pending: string | undefined;
export const tagPurpose = (purpose: string) => {
  pending = purpose;
};
export const takePurpose = (): string => {
  const purpose = pending || "other";
  pending = undefined;
  return purpose;
};

const dayOf = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const read = (): Ledger => {
  try {
    return JSON.parse(localStorage.getItem(LS_TOKEN_USAGE) || "{}") || {};
  } catch {
    return {};
  }
};

export const recordTokens = (purpose: string, usage: UsageInfo, at = Date.now()) => {
  const ledger = read();
  const day = dayOf(at);
  const bucket = ledger[day]?.[purpose] || { calls: 0, input: 0, output: 0 };
  ledger[day] = { ...ledger[day], [purpose]: { calls: bucket.calls + 1, input: bucket.input + usage.inputTokens, output: bucket.output + usage.outputTokens } };
  const kept = Object.keys(ledger).sort().slice(-KEEP_DAYS);
  try {
    localStorage.setItem(LS_TOKEN_USAGE, JSON.stringify(Object.fromEntries(kept.map((d) => [d, ledger[d]]))));
  } catch {
    // Only a measurement.
  }
};

// Totals per purpose over the last `days` days (1 = today), most input first.
export const tokenUsageSince = (days: number, now = Date.now()): ({ purpose: string } & TokenBucket)[] => {
  const ledger = read();
  const from = dayOf(now - (days - 1) * 86_400_000);
  const totals: Record<string, TokenBucket> = {};
  for (const [day, purposes] of Object.entries(ledger)) {
    if (day < from) continue;
    for (const [purpose, b] of Object.entries(purposes)) {
      const t = totals[purpose] || { calls: 0, input: 0, output: 0 };
      totals[purpose] = { calls: t.calls + b.calls, input: t.input + b.input, output: t.output + b.output };
    }
  }
  return Object.entries(totals).map(([purpose, b]) => ({ purpose, ...b })).sort((a, b) => b.input - a.input);
};

export const PURPOSE_LABELS: Record<string, string> = {
  reply: "Chat and adventure replies",
  "picture-prompt": "Writing picture prompts",
  photo: "Looking at your photos",
  summary: "Summarising old messages",
  memory: "Memory",
  helper: "Helper tasks you asked for",
  "life:status": "Statuses",
  "life:first-text": "Texting you first",
  "life:letter": "Letters",
  "life:channel": "Channel posts",
  "life:profile": "Profile changes",
  "life:talk": "Characters talking to each other",
  "life:rumor": "Rumours",
  "life:day-log": "Their days",
  "life:concerns": "What's on their mind",
  "life:dream": "Dreams",
  "life:event": "World events and life",
  "life:other": "Other background life",
  background: "Other background work",
  other: "Other",
};

export const purposeLabel = (purpose: string) => PURPOSE_LABELS[purpose] || purpose.replace(/^life:/, "").replace(/-/g, " ");
