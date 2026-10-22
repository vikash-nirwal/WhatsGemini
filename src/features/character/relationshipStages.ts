import { RelationshipStage } from "../../types";

// Relationship stages (#70): an opt-in ladder per chat. The stage tells the
// character how forward they're willing to be, so a romance builds instead
// of jumping ahead. Every so often a cheap check may suggest moving a step
// up or down, which the user accepts or dismisses; it can be set by hand.
// The content rating and hard limits still decide what may be described.

export const STAGES: RelationshipStage[] = ["strangers", "flirting", "dating", "intimate", "committed"];

export const STAGE_LABELS: Record<RelationshipStage, string> = {
  strangers: "Strangers",
  flirting: "Flirting",
  dating: "Dating",
  intimate: "Intimate",
  committed: "Committed",
};

const STAGE_RULES: Record<RelationshipStage, string> = {
  strangers: "You've only just met. Be polite, curious and a little guarded; at most a hint of interest, no flirting or physical closeness yet.",
  flirting: "There's chemistry between you: teasing, compliments, lingering looks and light touches, but nothing is settled and you don't rush it.",
  dating: "You're dating: openly affectionate and romantic, kissing and closeness are welcome, and you're still getting to know each other.",
  intimate: "You're lovers: physical intimacy is part of the relationship when the moment fits, along with real emotional closeness.",
  committed: "You're in a committed relationship: deep trust, easy closeness, shared routines and plans, talk of the future.",
};

export const STAGE_INTERVAL = 20; // messages between checks

export const buildStageSection = (stage: RelationshipStage, userName: string): string =>
  `Where things stand between you and ${userName}: ${STAGE_LABELS[stage]}. ${STAGE_RULES[stage]} Stay at this stage unless the story clearly moves past it; ${userName} sets the pace.`;

export const stageCheckDue = (messageCount: number, lastCheckedAt: number | undefined): boolean =>
  messageCount >= STAGE_INTERVAL && messageCount - (lastCheckedAt ?? 0) >= STAGE_INTERVAL;

export const buildStagePrompt = (charName: string, userName: string, stage: RelationshipStage, transcript: string): string => {
  const i = STAGES.indexOf(stage);
  const next = STAGES[i + 1];
  const back = STAGES[i - 1];
  return `Read this roleplay between ${userName} and ${charName}. Their relationship is at the stage "${STAGE_LABELS[stage]}".

Recent messages:
${transcript}

Has the story clearly moved ${next ? `on to "${STAGE_LABELS[next]}"` : ""}${next && back ? " or " : ""}${back ? `back to "${STAGE_LABELS[back]}"` : ""}? Only answer yes if both of them have clearly acted that way, not just hinted at it.
Reply with only one word: ${[next ? "NEXT" : "", back ? "BACK" : "", "SAME"].filter(Boolean).join(", ")}.`;
};

export const parseStageReply = (reply: string, stage: RelationshipStage): RelationshipStage | undefined => {
  const word = reply.trim().split(/\s+/)[0]?.replace(/[^a-z]/gi, "").toUpperCase();
  const i = STAGES.indexOf(stage);
  if (word === "NEXT") return STAGES[i + 1];
  if (word === "BACK") return STAGES[i - 1];
  return undefined;
};
