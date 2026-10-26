import { Character, GroupPlan } from "../../types";

// Group plans (#168): a plan several characters join - a bonfire, a trip, a
// heist - with a group chat to make it in. When it has happened, how it went
// is written once and each member remembers it.

export const planScenario = (plan: Pick<GroupPlan, "title" | "when">, members: string[], userName: string) =>
  `The group chat for a plan: ${plan.title}${plan.when ? `, ${plan.when}` : ""}. ${userName} set it up with ${members.join(", ")}. Everyone's sorting out the details, getting excited, flaking or bickering the way they would.`;

export const buildPlanOutcomePrompt = (plan: Pick<GroupPlan, "title" | "when">, members: string[], userName: string, transcript: string, idea?: string) =>
  [
    `${userName} and ${members.join(", ")} made a plan: ${plan.title}${plan.when ? ` (${plan.when})` : ""}.`,
    transcript ? `Their group chat about it:\n${transcript}` : "",
    idea?.trim() ? `How ${userName} says it went: ${idea.trim()}` : `Now it has happened. Decide how it went, true to the people and what they said: highs, a mishap or two, who did what.`,
    "Write how it went in two or three sentences, past tense, naming people. Reply with only that.",
  ].filter(Boolean).join("\n\n");

export const cleanOutcome = (reply: string): string | undefined => {
  const text = reply.trim().replace(/^["“]|["”]$/g, "").trim();
  if (text.length < 10) return undefined;
  return text.length > 600 ? `${text.slice(0, 597).trimEnd()}...` : text;
};

// What each member keeps: the plan and how it went, with you in it.
export const planMemory = (plan: Pick<GroupPlan, "title">, outcome: string, userName: string) => `${plan.title} with ${userName} and the others happened: ${outcome}`;

export const withPlanMemory = (c: Character, fact: string): Character => ({ ...c, memory: [...(c.memory || []), fact] });

// Plans resolve (#184): with a date, someone in the group reminds everyone
// the day before, and if the day passes without "It happened", the outcome
// is written anyway - the story moves on whether or not you pressed it.
const DAY = 24 * 60 * 60 * 1000;
const dayStart = (date: string) => new Date(`${date}T00:00:00`).getTime();

export const planReminderDue = (plan: GroupPlan | undefined, now: number) =>
  Boolean(plan?.date && !plan.outcome && !plan.remindedAt && now >= dayStart(plan.date) - DAY && now < dayStart(plan.date) && new Date(now).getHours() >= 9);

export const planPassed = (plan: GroupPlan | undefined, now: number) => Boolean(plan?.date && !plan.outcome && now >= dayStart(plan.date) + DAY);

export const buildPlanReminderPrompt = (plan: Pick<GroupPlan, "title" | "when">, who: Character, others: string[], userName: string) =>
  `You are ${who.name}. ${[who.description, who.prompt].filter(Boolean).join(" ").slice(0, 400)}\n\nTomorrow is the plan you made with ${userName}${others.length ? ` and ${others.join(", ")}` : ""}: ${plan.title}${plan.when ? ` (${plan.when})` : ""}. Text the group about it - excited, a last detail, a worry, whatever you'd say. One or two short lines, in your own voice. Reply with only the message.`;
