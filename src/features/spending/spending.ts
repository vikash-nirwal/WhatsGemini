import { useSyncExternalStore } from "react";
import { UsageInfo } from "../ai/types";
import {
  FLAT_IMAGE_PRICING,
  FLAT_VIDEO_PRICING,
  getModelPricing,
  LS_SPENDING_BUDGET,
  LS_SPENDING_LEDGER,
  LS_SPENDING_WARNED,
} from "../../utils/constants";

// Spending dashboard and monthly limit (#42). Every paid provider call adds
// its estimated cost to a ledger kept per month and provider. The ledger
// lives in localStorage rather than IndexedDB because the budget check runs
// before every call and must read it synchronously, and because it's small
// (a few numbers per provider per month). It travels with the settings
// export and the full backup (see SettingsPage's buildSettingsExport).

export type SpendKind = "text" | "image" | "video";

export interface ProviderSpend {
  cost: number;
  calls: number;
  tokens: number;
  // Cost per kind of call, so the dashboard can say what the money went on.
  byKind?: Partial<Record<SpendKind, number>>;
}

// Month ("2026-10", local time) -> provider id -> spend.
export type SpendingLedger = Record<string, Record<string, ProviderSpend>>;

export type BudgetMode = "warn" | "block";

export interface Budget {
  // USD; 0 means no limit.
  monthlyLimit: number;
  // What happens at 100%: another warning, or a hard stop on paid calls.
  mode: BudgetMode;
}

export const DEFAULT_BUDGET: Budget = { monthlyLimit: 0, mode: "warn" };

// The highest threshold already announced, so each warning shows once per
// month and limit. Raising or lowering the limit starts the count again.
export interface WarnedState {
  month: string;
  limit: number;
  level: number;
}

export const WARN_FRACTION = 0.8;

// Local and self-hosted backends cost nothing and are never blocked.
export const FREE_PROVIDERS = new Set(["ollama", "sdwebui", "comfyui"]);
export const isFreeProvider = (providerId: string) => FREE_PROVIDERS.has(providerId);

export const monthKey = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

// The `count` months ending with `date`'s, newest first.
export const lastMonths = (count: number, date: Date = new Date()): string[] =>
  Array.from({ length: count }, (_, i) => monthKey(new Date(date.getFullYear(), date.getMonth() - i, 1)));

export const monthLabel = (month: string, style: "long" | "short" = "long"): string => {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-US", { month: style, year: "numeric" });
};

// What one call cost. Token usage is priced by the model that served it;
// image and video calls whose provider reports no usage fall back to a flat
// price per item.
export const estimateCallCost = (call: {
  kind: SpendKind;
  providerId: string;
  model: string;
  usage?: UsageInfo;
  count?: number;
}): number => {
  if (isFreeProvider(call.providerId)) return 0;
  if (call.usage && call.usage.totalTokens > 0) {
    const pricing = getModelPricing(call.providerId, call.model);
    return (call.usage.inputTokens / 1_000_000) * pricing.input + (call.usage.outputTokens / 1_000_000) * pricing.output;
  }
  const count = call.count ?? 1;
  if (call.kind === "image") return (FLAT_IMAGE_PRICING[call.providerId] ?? 0) * count;
  if (call.kind === "video") return (FLAT_VIDEO_PRICING[call.providerId] ?? 0) * count;
  return 0;
};

export const addToLedger = (
  ledger: SpendingLedger,
  month: string,
  providerId: string,
  kind: SpendKind,
  cost: number,
  tokens: number
): SpendingLedger => {
  const monthEntries = ledger[month] || {};
  const prev: ProviderSpend = monthEntries[providerId] || { cost: 0, calls: 0, tokens: 0 };
  const next: ProviderSpend = {
    cost: prev.cost + cost,
    calls: prev.calls + 1,
    tokens: prev.tokens + tokens,
    byKind: { ...prev.byKind, [kind]: (prev.byKind?.[kind] || 0) + cost },
  };
  return { ...ledger, [month]: { ...monthEntries, [providerId]: next } };
};

export const monthTotal = (ledger: SpendingLedger, month: string): number =>
  Object.values(ledger[month] || {}).reduce((sum, p) => sum + p.cost, 0);

export const providerBreakdown = (ledger: SpendingLedger, month: string): ({ providerId: string } & ProviderSpend)[] =>
  Object.entries(ledger[month] || {})
    .map(([providerId, spend]) => ({ providerId, ...spend }))
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls);

// Combines an imported ledger with the current one. Each month and provider
// keeps the larger of the two entries, so restoring the same backup twice,
// or a backup taken from this very browser, doesn't count anything twice.
export const mergeLedgers = (current: SpendingLedger, incoming: SpendingLedger): SpendingLedger => {
  const merged: SpendingLedger = { ...current };
  for (const [month, providers] of Object.entries(incoming || {})) {
    if (!/^\d{4}-\d{2}$/.test(month) || !providers || typeof providers !== "object") continue;
    const target = { ...(merged[month] || {}) };
    for (const [providerId, spend] of Object.entries(providers)) {
      if (!spend || typeof spend.cost !== "number") continue;
      if (!target[providerId] || spend.cost > target[providerId].cost) target[providerId] = spend;
    }
    merged[month] = target;
  }
  return merged;
};

export const isOverLimit = (spent: number, budget: Budget) => budget.monthlyLimit > 0 && spent >= budget.monthlyLimit;

// The threshold (80 or 100) that `spent` has reached and that hasn't been
// announced yet for this month and limit, or null.
export const thresholdToAnnounce = (spent: number, budget: Budget, warned: WarnedState | null, month: string): 80 | 100 | null => {
  if (budget.monthlyLimit <= 0) return null;
  const level = spent >= budget.monthlyLimit ? 100 : spent >= budget.monthlyLimit * WARN_FRACTION ? 80 : 0;
  if (level === 0) return null;
  const already = warned && warned.month === month && warned.limit === budget.monthlyLimit ? warned.level : 0;
  return level > already ? (level as 80 | 100) : null;
};

// Small amounts still show as something, so a cheap model doesn't look free.
export const formatUSD = (amount: number): string => {
  if (amount > 0 && amount < 0.01) return "<$0.01";
  return `$${amount.toFixed(2)}`;
};

export class BudgetExceededError extends Error {
  constructor(spent: number, limit: number) {
    super(
      `Monthly spending limit reached (${formatUSD(spent)} of ${formatUSD(limit)}), so paid calls are paused. ` +
        "Raise the limit in Settings, Spending, or use a local provider (Ollama, SD WebUI, ComfyUI)."
    );
    this.name = "BudgetExceededError";
  }
}

// --- The store: the ledger and budget, persisted to localStorage and shared
// with React through useSyncExternalStore.

export interface SpendingSnapshot {
  ledger: SpendingLedger;
  budget: Budget;
}

export type BudgetEvent =
  | { type: "threshold"; level: 80 | 100; spent: number; budget: Budget }
  | { type: "blocked"; spent: number; budget: Budget };

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Couldn't save ${key}`, e);
  }
};

const sanitizeBudget = (value: Partial<Budget> | null | undefined): Budget => ({
  monthlyLimit: typeof value?.monthlyLimit === "number" && value.monthlyLimit > 0 ? value.monthlyLimit : 0,
  mode: value?.mode === "block" ? "block" : "warn",
});

const load = (): SpendingSnapshot => ({
  ledger: readJson<SpendingLedger>(LS_SPENDING_LEDGER, {}),
  budget: sanitizeBudget(readJson<Partial<Budget>>(LS_SPENDING_BUDGET, DEFAULT_BUDGET)),
});

let snapshot: SpendingSnapshot | null = null;
const listeners = new Set<() => void>();
const eventListeners = new Set<(event: BudgetEvent) => void>();

const current = (): SpendingSnapshot => {
  if (!snapshot) snapshot = load();
  return snapshot;
};

const setSnapshot = (next: SpendingSnapshot) => {
  snapshot = next;
  for (const listener of listeners) listener();
};

const emitEvent = (event: BudgetEvent) => {
  for (const listener of eventListeners) listener(event);
};

// Another tab recorded a call or changed the limit: pick it up, so two open
// tabs can't each spend up to the limit on their own.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === LS_SPENDING_LEDGER || e.key === LS_SPENDING_BUDGET) setSnapshot(load());
  });
}

export const getSpendingSnapshot = (): SpendingSnapshot => current();

export const subscribeSpending = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const subscribeBudgetEvents = (listener: (event: BudgetEvent) => void): (() => void) => {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
};

export const useSpending = (): SpendingSnapshot => useSyncExternalStore(subscribeSpending, getSpendingSnapshot);

export const setBudget = (budget: Budget) => {
  const clean = sanitizeBudget(budget);
  writeJson(LS_SPENDING_BUDGET, clean);
  setSnapshot({ ...current(), budget: clean });
};

export const importLedger = (incoming: SpendingLedger) => {
  const ledger = mergeLedgers(current().ledger, incoming);
  writeJson(LS_SPENDING_LEDGER, ledger);
  setSnapshot({ ...current(), ledger });
};

// For tests: forget the cached snapshot so the next read comes from storage.
export const resetSpendingStore = () => {
  snapshot = null;
};

// Announces the 80% or 100% threshold if it's been reached and not yet
// announced. Runs after every recorded call and once when the app opens.
export const checkThresholds = (now: Date = new Date()) => {
  const { ledger, budget } = current();
  const month = monthKey(now);
  const spent = monthTotal(ledger, month);
  const warned = readJson<WarnedState | null>(LS_SPENDING_WARNED, null);
  const level = thresholdToAnnounce(spent, budget, warned, month);
  if (!level) return;
  writeJson(LS_SPENDING_WARNED, { month, limit: budget.monthlyLimit, level });
  emitEvent({ type: "threshold", level, spent, budget });
};

// Called before every provider call. Throws for a paid provider once a hard
// limit is reached; free providers always pass.
export const assertWithinBudget = (providerId: string, now: Date = new Date()) => {
  if (isFreeProvider(providerId)) return;
  const { ledger, budget } = current();
  if (budget.mode !== "block") return;
  const spent = monthTotal(ledger, monthKey(now));
  if (!isOverLimit(spent, budget)) return;
  emitEvent({ type: "blocked", spent, budget });
  throw new BudgetExceededError(spent, budget.monthlyLimit);
};

export const recordSpend = (
  call: { kind: SpendKind; providerId: string; model: string; usage?: UsageInfo; count?: number },
  now: Date = new Date()
) => {
  if (isFreeProvider(call.providerId)) return;
  const cost = estimateCallCost(call);
  const ledger = addToLedger(current().ledger, monthKey(now), call.providerId, call.kind, cost, call.usage?.totalTokens || 0);
  writeJson(LS_SPENDING_LEDGER, ledger);
  setSnapshot({ ...current(), ledger });
  checkThresholds(now);
};
