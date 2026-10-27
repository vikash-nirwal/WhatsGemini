import { Character } from "../../types";

// Goals (#208, a per-world switch, off by default): each person in the world
// wants something this week - a job, a reconciliation, money for rent -
// and their talks lean towards it. A talk can move it on; when it's done or
// a week has passed, they pick a new one.

export const GOAL_FOR_MS = 7 * 24 * 60 * 60 * 1000;

export const needsGoal = (c: Pick<Character, "goal">, now: number) => !c.goal || now - c.goal.setAt >= GOAL_FOR_MS;

// `others` (#221): what the others here want, so a goal can clash with
// one of theirs - wanting the same thing, or standing in the way - which is
// where a week gets interesting.
export const buildGoalPrompt = (c: Character, worldName: string | undefined, knows?: string, others: { name: string; goal: string }[] = []) =>
  [
    `${c.name}${worldName ? `, who lives in ${worldName}` : ""}: ${[c.description, c.prompt].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 600)}`,
    c.lifeEvents?.length ? `Lately in their life: ${c.lifeEvents.slice(-3).map((e) => e.text).join(" ")}` : "",
    c.goal ? `What they wanted last week: ${c.goal.text}${c.goal.progress ? ` (${c.goal.progress})` : ""}` : "",
    knows || "",
    others.length ? `What others here want this week: ${others.slice(0, 6).map((o) => `${o.name}: ${o.goal}`).join("; ")}` : "",
    `What does ${c.name} want this week? Something concrete and personal they can work towards by talking to people and doing things - not world-changing. Reply with one sentence in the third person.`,
    others.length ? `If it fits who they are, it can clash with one of the others' (wanting the same thing, or standing in their way); then add a second line: AGAINST: <their name>. Otherwise just the sentence.` : "Nothing else.",
  ].filter(Boolean).join("\n");

export const cleanGoal = (reply: string): string | undefined => {
  const text = reply.split("\n").map((l) => l.trim()).find((l) => l && !/^[\s*_-]*AGAINST\s*:/i.test(l))?.replace(/^["'*\s]+|["'*\s]+$/g, "");
  return text && text.length >= 8 && text.length <= 240 ? text : undefined;
};

// Whose goal it works against (#221), when the reply names someone.
export const parseGoalAgainst = (reply: string, people: Pick<Character, "id" | "name">[]): number | undefined => {
  const name = reply.match(/^[\s*_-]*AGAINST\s*:\s*(.+)$/im)?.[1].replace(/[*_.]/g, "").trim().toLowerCase();
  if (!name) return undefined;
  return people.find((p) => p.name.toLowerCase() === name || p.name.toLowerCase().split(/\s+/)[0] === name.split(/\s+/)[0])?.id;
};

// Two people whose goals pull against each other this week (#221).
export const goalsClash = (a: Pick<Character, "id" | "goal">, b: Pick<Character, "id" | "goal">) => a.goal?.against === b.id || b.goal?.against === a.id;

export const clashLine = (a: Pick<Character, "id" | "name" | "goal">, b: Pick<Character, "id" | "name" | "goal">) =>
  goalsClash(a, b) ? `What ${a.name} and ${b.name} want this week pulls against each other; it's on their minds, said or not.` : undefined;

// For prompts: what they're after.
export const goalLine = (c: Pick<Character, "name" | "goal">) =>
  c.goal ? `What ${c.name} wants this week: ${c.goal.text}${c.goal.progress ? ` (so far: ${c.goal.progress})` : ""}` : undefined;

export const buildGoalNote = (c: Pick<Character, "name" | "goal"> | undefined) =>
  c?.goal ? `${goalLine(c)}. It colours what you bring up and ask for, without taking over.` : undefined;

// The line a talk ends with when it moved someone's goal on.
export const GOAL_ASK = '- If this talk moved one of their goals on, add one line: GOAL: <name>: <where it stands now, a few words>, or GOAL: <name>: done. Most talks don\'t; then leave it out.';

export const parseGoalProgress = (reply: string, people: Pick<Character, "id" | "name">[]): { id: number; progress: string; done: boolean }[] => {
  const out: { id: number; progress: string; done: boolean }[] = [];
  for (const m of Array.from(reply.matchAll(/^[\s*_-]*GOAL\s*:\s*([^:]{1,40}):\s*(.+)$/gim))) {
    const name = m[1].replace(/[*_]/g, "").trim().toLowerCase();
    const who = people.find((p) => p.name.toLowerCase() === name || p.name.toLowerCase().split(/\s+/)[0] === name.split(/\s+/)[0]);
    const progress = m[2].replace(/[*_]/g, "").trim().slice(0, 160);
    if (who && progress && !out.some((o) => o.id === who.id)) out.push({ id: who.id, progress, done: /^done\b/i.test(progress) });
  }
  return out;
};
