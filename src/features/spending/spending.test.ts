import {
  addToLedger,
  assertWithinBudget,
  BudgetEvent,
  BudgetExceededError,
  checkThresholds,
  estimateCallCost,
  formatUSD,
  getSpendingSnapshot,
  importLedger,
  lastMonths,
  mergeLedgers,
  monthKey,
  monthTotal,
  providerBreakdown,
  recordSpend,
  resetSpendingStore,
  setBudget,
  SpendingLedger,
  subscribeBudgetEvents,
  thresholdToAnnounce,
} from "./spending";
import { getModelPricing, LS_SPENDING_BUDGET, LS_SPENDING_LEDGER } from "../../utils/constants";

const OCT = new Date(2026, 9, 20, 12);

beforeEach(() => {
  localStorage.clear();
  resetSpendingStore();
});

describe("monthKey and lastMonths", () => {
  it("uses the local calendar month", () => {
    expect(monthKey(OCT)).toBe("2026-10");
    expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
  });

  it("lists months newest first, across a year boundary", () => {
    expect(lastMonths(4, new Date(2026, 1, 10))).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });
});

describe("estimateCallCost", () => {
  it("prices token usage by the serving model", () => {
    const pricing = getModelPricing("deepseek", "deepseek-chat");
    const cost = estimateCallCost({
      kind: "text",
      providerId: "deepseek",
      model: "deepseek-chat",
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 },
    });
    expect(cost).toBeCloseTo(pricing.input + pricing.output);
  });

  it("is free for local providers whatever the usage", () => {
    const usage = { inputTokens: 5000, outputTokens: 5000, totalTokens: 10000 };
    for (const providerId of ["ollama", "sdwebui", "comfyui"]) {
      expect(estimateCallCost({ kind: "image", providerId, model: "x", usage, count: 3 })).toBe(0);
    }
  });

  it("falls back to a flat price per image or video without usage", () => {
    expect(estimateCallCost({ kind: "image", providerId: "fal", model: "seedream", count: 2 })).toBeCloseTo(0.08);
    expect(estimateCallCost({ kind: "video", providerId: "wan", model: "wan2.5-t2v" })).toBeCloseTo(0.5);
    expect(estimateCallCost({ kind: "text", providerId: "openai", model: "gpt-4o" })).toBe(0);
  });
});

describe("ledger helpers", () => {
  it("adds up cost, calls, tokens and cost per kind", () => {
    let ledger: SpendingLedger = {};
    ledger = addToLedger(ledger, "2026-10", "openai", "text", 0.5, 100);
    ledger = addToLedger(ledger, "2026-10", "openai", "image", 0.04, 0);
    ledger = addToLedger(ledger, "2026-10", "deepseek", "text", 0.01, 50);
    ledger = addToLedger(ledger, "2026-09", "openai", "text", 2, 10);
    expect(ledger["2026-10"].openai).toEqual({ cost: 0.54, calls: 2, tokens: 100, byKind: { text: 0.5, image: 0.04 } });
    expect(monthTotal(ledger, "2026-10")).toBeCloseTo(0.55);
    expect(monthTotal(ledger, "2026-08")).toBe(0);
    expect(providerBreakdown(ledger, "2026-10").map((p) => p.providerId)).toEqual(["openai", "deepseek"]);
  });

  it("merges an imported ledger without double counting", () => {
    const here: SpendingLedger = { "2026-10": { openai: { cost: 1, calls: 3, tokens: 30 } } };
    const backup: SpendingLedger = {
      "2026-10": { openai: { cost: 0.5, calls: 1, tokens: 10 }, fal: { cost: 0.2, calls: 5, tokens: 0 } },
      "2026-09": { gemini: { cost: 3, calls: 9, tokens: 90 } },
    };
    const merged = mergeLedgers(here, backup);
    expect(merged["2026-10"].openai.cost).toBe(1);
    expect(merged["2026-10"].fal.cost).toBe(0.2);
    expect(merged["2026-09"].gemini.cost).toBe(3);
    expect(mergeLedgers(merged, backup)).toEqual(merged);
  });

  it("ignores malformed imported entries", () => {
    const merged = mergeLedgers({}, { nonsense: { a: { cost: 1, calls: 1, tokens: 1 } }, "2026-10": { x: null } } as any);
    expect(merged).toEqual({ "2026-10": {} });
  });
});

describe("thresholdToAnnounce", () => {
  const budget = { monthlyLimit: 10, mode: "warn" as const };

  it("announces 80% then 100%, each once per month and limit", () => {
    expect(thresholdToAnnounce(7.99, budget, null, "2026-10")).toBeNull();
    expect(thresholdToAnnounce(8, budget, null, "2026-10")).toBe(80);
    expect(thresholdToAnnounce(9, budget, { month: "2026-10", limit: 10, level: 80 }, "2026-10")).toBeNull();
    expect(thresholdToAnnounce(10, budget, { month: "2026-10", limit: 10, level: 80 }, "2026-10")).toBe(100);
    expect(thresholdToAnnounce(12, budget, { month: "2026-10", limit: 10, level: 100 }, "2026-10")).toBeNull();
  });

  it("starts again in a new month or with a new limit", () => {
    expect(thresholdToAnnounce(9, budget, { month: "2026-09", limit: 10, level: 100 }, "2026-10")).toBe(80);
    expect(thresholdToAnnounce(9, budget, { month: "2026-10", limit: 5, level: 100 }, "2026-10")).toBe(80);
  });

  it("never announces without a limit", () => {
    expect(thresholdToAnnounce(100, { monthlyLimit: 0, mode: "block" }, null, "2026-10")).toBeNull();
  });
});

describe("formatUSD", () => {
  it("shows tiny amounts as under a cent", () => {
    expect(formatUSD(0)).toBe("$0.00");
    expect(formatUSD(0.004)).toBe("<$0.01");
    expect(formatUSD(12.345)).toBe("$12.35");
  });
});

describe("the spending store", () => {
  const events: BudgetEvent[] = [];
  let unsubscribe: () => void;
  beforeEach(() => {
    events.length = 0;
    unsubscribe = subscribeBudgetEvents((e) => events.push(e));
  });
  afterEach(() => unsubscribe());

  const spend = (cost: number, providerId = "openai") =>
    // gpt-4o output is $10 per million tokens.
    recordSpend({ kind: "text", providerId, model: "gpt-4o", usage: { inputTokens: 0, outputTokens: cost * 100_000, totalTokens: cost * 100_000 } }, OCT);

  it("records paid calls to localStorage and skips free ones", () => {
    spend(1);
    recordSpend({ kind: "text", providerId: "ollama", model: "llama3", usage: { inputTokens: 9, outputTokens: 9, totalTokens: 18 } }, OCT);
    const saved = JSON.parse(localStorage.getItem(LS_SPENDING_LEDGER)!);
    expect(Object.keys(saved["2026-10"])).toEqual(["openai"]);
    expect(saved["2026-10"].openai.cost).toBeCloseTo(1);
    resetSpendingStore();
    expect(monthTotal(getSpendingSnapshot().ledger, "2026-10")).toBeCloseTo(1);
  });

  it("warns at 80% and at 100% once each", () => {
    setBudget({ monthlyLimit: 10, mode: "warn" });
    spend(5);
    expect(events).toEqual([]);
    spend(3.5);
    spend(0.5);
    expect(events.map((e) => e.type === "threshold" && e.level)).toEqual([80]);
    spend(2);
    spend(2);
    expect(events.map((e) => e.type === "threshold" && e.level)).toEqual([80, 100]);
    checkThresholds(OCT);
    expect(events).toHaveLength(2);
  });

  it("warns on open when the limit was lowered below this month's spending", () => {
    spend(9);
    setBudget({ monthlyLimit: 10, mode: "warn" });
    checkThresholds(OCT);
    expect(events.map((e) => e.type === "threshold" && e.level)).toEqual([80]);
  });

  it("blocks paid providers at 100% only in block mode", () => {
    setBudget({ monthlyLimit: 2, mode: "warn" });
    spend(3);
    expect(() => assertWithinBudget("openai", OCT)).not.toThrow();

    setBudget({ monthlyLimit: 2, mode: "block" });
    expect(() => assertWithinBudget("openai", OCT)).toThrow(BudgetExceededError);
    expect(() => assertWithinBudget("gemini", OCT)).toThrow(/Raise the limit in Settings/);
    expect(events.filter((e) => e.type === "blocked")).toHaveLength(2);

    for (const free of ["ollama", "sdwebui", "comfyui"]) expect(() => assertWithinBudget(free, OCT)).not.toThrow();

    setBudget({ monthlyLimit: 5, mode: "block" });
    expect(() => assertWithinBudget("openai", OCT)).not.toThrow();
  });

  it("doesn't block next month", () => {
    setBudget({ monthlyLimit: 1, mode: "block" });
    spend(2);
    expect(() => assertWithinBudget("openai", new Date(2026, 10, 1))).not.toThrow();
  });

  it("sanitizes the budget it saves", () => {
    setBudget({ monthlyLimit: -4, mode: "bogus" as any });
    expect(JSON.parse(localStorage.getItem(LS_SPENDING_BUDGET)!)).toEqual({ monthlyLimit: 0, mode: "warn" });
  });

  it("merges an imported ledger into the stored one", () => {
    spend(1);
    importLedger({ "2026-09": { anthropic: { cost: 4, calls: 2, tokens: 20 } } });
    resetSpendingStore();
    const { ledger } = getSpendingSnapshot();
    expect(monthTotal(ledger, "2026-09")).toBe(4);
    expect(monthTotal(ledger, "2026-10")).toBeCloseTo(1);
  });
});
