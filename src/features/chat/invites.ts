import { Message } from "../../types";

// Event invites (#134): now and then a character invites you to something -
// [Invite: what | when | where] at the end of a reply - shown as a card you
// accept or decline. Accepting adds it to your shared plans (#84), which
// they bring up before and after; either answer reaches their next reply.

const INVITE_TAG = /\n*\[\s*invite\s*:\s*([^\]\n]{2,240})\]\s*$/i;
const INVITE_PARTIAL = /\n*\[\s*invite\s*:[^\]\n]*$/i;

export type Invite = NonNullable<Message["invite"]>;

export const extractInvite = (text: string): { text: string; invite?: Invite } => {
  const match = text.match(INVITE_TAG);
  if (!match) return { text };
  const [what, when, where] = match[1].split("|").map((s) => s.trim().replace(/^["“]|["”]$/g, ""));
  if (!what) return { text };
  return {
    text: text.slice(0, match.index).trimEnd(),
    invite: { what: what.slice(0, 80), ...(when ? { when: when.slice(0, 60) } : {}), ...(where ? { where: where.slice(0, 80) } : {}) },
  };
};

export const stripStreamingInvite = (text: string): string => text.replace(INVITE_TAG, "").replace(INVITE_PARTIAL, "");

export const buildInviteDirective = (charName: string, userName: string): string =>
  `Now and then, when ${charName} wants to do something specific with ${userName} (a gig, a dinner, a trip, a party), ${charName} can send a proper invite: end the reply with [Invite: what | when | where], e.g. [Invite: Jazz at Hot Clube | Friday 22:00 | Praça da Alegria]. At most one invite at a time, and not every day.`;

// How you answered their latest invite, for their next reply.
export const buildInviteAnswerNote = (messages: Message[], charName: string, userName: string): string | undefined => {
  const last = [...messages].reverse().find((m) => m.invite);
  if (!last?.invite?.answer) return undefined;
  const { what, when } = last.invite;
  return last.invite.answer === "accepted"
    ? `${userName} accepted ${charName}'s invite to ${what}${when ? ` (${when})` : ""}. It's a plan now.`
    : `${userName} declined ${charName}'s invite to ${what}. ${charName} can react to that in character.`;
};
