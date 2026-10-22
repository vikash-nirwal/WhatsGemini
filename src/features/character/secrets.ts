import { Character, CharacterSecret, Chat } from "../../types";
import { STAGE_LABELS, STAGES } from "./relationshipStages";

// Secrets (#81): a few things a character keeps to themselves, each with
// when it can come out - a relationship stage (#70), a trust level (the
// scene tracker's trust, #9/#71), or only if you ask. Until then the
// character only hints; once a secret's time has come they may tell it,
// and close that reply with a tag the app turns into "A secret came out".
// What came out is kept per chat, so a fork or another chat starts fresh.

export const newSecretId = () => `secret-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const trustIn = (chat: Chat | undefined): number | undefined => chat?.sceneState?.trust ?? chat?.sceneState?.meters?.trust;

export const describeCondition = (secret: CharacterSecret): string =>
  secret.reveal === "asked"
    ? "only if asked"
    : secret.reveal === "stage"
      ? `once you're ${STAGE_LABELS[secret.stage || "dating"].toLowerCase()}`
      : `once trust reaches ${secret.trust ?? 70}`;

// Whether a stage or trust secret's time has come in this chat.
export const conditionMet = (secret: CharacterSecret, chat: Chat | undefined): boolean => {
  if (secret.reveal === "stage") {
    const at = chat?.stage ? STAGES.indexOf(chat.stage) : -1;
    return at >= 0 && at >= STAGES.indexOf(secret.stage || "dating");
  }
  if (secret.reveal === "trust") {
    const trust = trustIn(chat);
    return trust != null && trust >= (secret.trust ?? 70);
  }
  return false;
};

export interface SecretsInPlay {
  hidden: CharacterSecret[]; // not yet: hint only
  // The ones that may come out now, numbered from 1 in the prompt and the
  // tag: at most one whose time has come (the first), then the ask-only ones.
  revealable: CharacterSecret[];
}

export const secretsInPlay = (character: Character | undefined, chat: Chat | undefined): SecretsInPlay => {
  const revealed = new Set(chat?.revealedSecrets || []);
  const left = (character?.secrets || []).filter((s) => s.text.trim() && !revealed.has(s.id));
  const ready = left.filter((s) => s.reveal !== "asked" && conditionMet(s, chat)).slice(0, 1);
  const asked = left.filter((s) => s.reveal === "asked");
  return {
    hidden: left.filter((s) => s.reveal !== "asked" && !ready.includes(s)),
    revealable: [...ready, ...asked],
  };
};

export const SECRET_TAG_EXAMPLE = "[Secret revealed: 1]";

export const buildSecretsSection = (characterName: string, userName: string, inPlay: SecretsInPlay): string | undefined => {
  const { hidden, revealable } = inPlay;
  if (hidden.length === 0 && revealable.length === 0) return undefined;
  const lines: string[] = [`${characterName}'s secrets (never mention that you were told about them):`];
  if (hidden.length > 0) {
    lines.push(`Not ready to tell ${userName} yet - keep these, but let them show now and then in small hints (a pause, a change of subject, a look), never saying what they are:`);
    lines.push(...hidden.map((s) => `- ${s.text.trim()}`));
  }
  if (revealable.length > 0) {
    lines.push("You may tell these now:");
    revealable.forEach((s, i) => {
      const when = s.reveal === "asked" ? `only if ${userName} asks you about it directly` : "when the moment feels right, in this reply or a coming one; build up to it";
      lines.push(`${i + 1}. ${s.text.trim()} (${when})`);
    });
    lines.push(`In the reply where you actually tell one, add its tag on its own line at the very end: ${SECRET_TAG_EXAMPLE} (with that secret's number). Never add the tag otherwise.`);
  }
  return lines.join("\n");
};

const SECRET_TAG = /\n?\s*\[\s*secret\s+revealed\s*:?\s*(\d+)?\s*\]\s*/i;

// Strips the tag wherever it ended up; the number is 1-based, into
// `revealable` (1 when the model left it out).
export const extractSecretTag = (text: string): { text: string; secretRevealed?: number } => {
  const match = text.match(SECRET_TAG);
  if (!match || match.index === undefined) return { text };
  const rest = (text.slice(0, match.index) + text.slice(match.index + match[0].length)).trim();
  return { text: rest, secretRevealed: match[1] ? Number(match[1]) : 1 };
};

// While streaming: the tag, or the start of one at the very end.
export const stripStreamingSecretTag = (text: string): string =>
  text.replace(new RegExp(SECRET_TAG.source, "gi"), "").replace(/\[\s*se(c(r(e(t[^\]]*)?)?)?)?$/i, "").trimEnd();
