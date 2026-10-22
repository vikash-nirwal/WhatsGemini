import { SharedPlan } from "../../types";

// Shared plans (#84): things you and the character agree to do. They're a
// short list in the Story tab, added by hand or - with "Notice plans" on -
// by a helper check after a reply that sounds like one. The character is
// told about the open ones, brings one up when its day comes, and the same
// check ticks a plan off once it happens in the story.

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_OPEN_IN_PROMPT = 6;

export const newPlanId = () => `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// Words that suggest a plan is being made, or kept. Only then is the helper
// asked, so most replies cost nothing extra.
const PLAN_WORDS = /\b(let'?s|we should|we could|shall we|wanna|want to|promise|plan|date|tomorrow|tonight|this (?:weekend|evening|afternoon)|next (?:week|time|month)|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|see you|meet (?:you|up)|pick you up)\b/i;
export const mentionsPlan = (text: string): boolean => PLAN_WORDS.test(text);

// Or the exchange mentions an open plan (a longer word of it), so the check
// can tick it off when it happens.
export const mentionsOpenPlan = (text: string, open: SharedPlan[]): boolean => {
  const lower = text.toLowerCase();
  return open.some((p) => p.what.toLowerCase().split(/[^a-z0-9']+/).some((w) => w.length >= 4 && lower.includes(w)));
};

const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const todayLabel = (now: number) => {
  const d = new Date(now);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

export const openPlans = (plans: SharedPlan[] | undefined) => (plans || []).filter((p) => !p.doneAt);

// Days from today to the plan's date (negative once it's passed), or
// undefined when it has no date.
export const daysUntilPlan = (plan: SharedPlan, now: number): number | undefined => {
  if (!plan.date || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date)) return undefined;
  const [y, m, d] = plan.date.split("-").map(Number);
  const today = new Date(now);
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / DAY_MS);
};

export const isPlanDue = (plan: SharedPlan, now: number) => {
  const days = daysUntilPlan(plan, now);
  return days !== undefined && days <= 0;
};

export const buildPlansPrompt = (characterName: string, userName: string, open: SharedPlan[], transcript: string, now: number): string =>
  `In this roleplay between ${userName} and ${characterName}, today is ${todayLabel(now)} (${isoDay(now)}).

${open.length > 0 ? `Plans they've already made:\n${open.map((p, i) => `${i + 1}. ${p.what}${p.when ? ` (${p.when})` : ""}`).join("\n")}\n\n` : ""}The latest exchange:
${transcript}

1. Did they just agree on something new to do together later (not something happening right now)? List each one.
2. Did any plan above happen in this exchange? List its number.

Reply with only JSON, no code fence: {"new": [{"what": "short description, e.g. \\"Picnic by the lake\\"", "when": "when, in a few words, e.g. \\"Saturday afternoon\\", or \\"\\"", "date": "YYYY-MM-DD if it can be worked out from today's date, else \\"\\""}], "done": [plan numbers]}. Use {"new": [], "done": []} when nothing applies.`;

export interface PlanChanges {
  added: { what: string; when?: string; date?: string }[];
  doneIndexes: number[]; // 0-based, into the open plans the prompt listed
}

export const parsePlansReply = (reply: string, openCount: number): PlanChanges => {
  const raw = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { added: [], doneIndexes: [] };
  try {
    const data = JSON.parse(raw.slice(start, end + 1));
    const added = (Array.isArray(data?.new) ? data.new : [])
      .map((p: any) => ({
        what: typeof p?.what === "string" ? p.what.trim() : "",
        when: typeof p?.when === "string" && p.when.trim() ? p.when.trim() : undefined,
        date: typeof p?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date.trim()) ? p.date.trim() : undefined,
      }))
      .filter((p: { what: string }) => p.what && p.what.length <= 120)
      .slice(0, 3);
    const doneIndexes = (Array.isArray(data?.done) ? data.done : [])
      .map((n: unknown) => Number(n) - 1)
      .filter((n: number) => Number.isInteger(n) && n >= 0 && n < openCount);
    return { added, doneIndexes };
  } catch {
    return { added: [], doneIndexes: [] };
  }
};

// Adds the new plans (skipping ones already listed) and ticks off the done
// ones, by their place among the open plans.
export const applyPlanChanges = (plans: SharedPlan[] | undefined, changes: PlanChanges, now: number): SharedPlan[] => {
  const all = plans || [];
  const open = openPlans(all);
  const doneIds = new Set(changes.doneIndexes.map((i) => open[i]?.id).filter(Boolean));
  const known = new Set(all.map((p) => p.what.toLowerCase()));
  const fresh = changes.added
    .filter((p) => !known.has(p.what.toLowerCase()))
    .map((p): SharedPlan => ({ id: newPlanId(), what: p.what, when: p.when, date: p.date, createdAt: now }));
  return [...all.map((p) => (doneIds.has(p.id) ? { ...p, doneAt: now } : p)), ...fresh];
};

const formatPlanDay = (plan: SharedPlan, now: number): string => {
  const days = daysUntilPlan(plan, now);
  if (days === undefined) return plan.when ? ` (${plan.when})` : "";
  if (days === 0) return " - that's TODAY";
  if (days === 1) return " - tomorrow";
  if (days < 0) return ` - it was meant for ${plan.when || plan.date}, and hasn't happened yet`;
  return ` (${plan.when || plan.date})`;
};

// The prompt note: open plans, with today's called out so the character
// brings it up.
export const buildPlansSection = (plans: SharedPlan[] | undefined, userName: string, now: number): string | undefined => {
  const open = openPlans(plans).slice(-MAX_OPEN_IN_PROMPT);
  if (open.length === 0) return undefined;
  const due = open.filter((p) => daysUntilPlan(p, now) === 0);
  return [
    `Plans you and ${userName} have made together:`,
    ...open.map((p) => `- ${p.what}${formatPlanDay(p, now)}`),
    due.length > 0
      ? `Today is the day for ${due.map((p) => p.what.toLowerCase()).join(" and ")}: bring it up yourself, with some excitement, unless you're already doing it.`
      : "Remember them, and look forward to them; mention one only when it fits.",
  ].join("\n");
};
