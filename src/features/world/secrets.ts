import { Character, KeptSecret, Chat } from "../../types";

// Secrets between characters (#170): now and then someone starts keeping
// something from a person in their life. A third person who knows them both
// may pass it to you as gossip; then it's yours to keep or to tell.

const DAY = 24 * 60 * 60 * 1000;
export const SECRET_GAP_MS = 5 * DAY;
const KEEP = 6;

export const secretDue = (lastAt: number | undefined, now: number, gapMs: number = SECRET_GAP_MS, rand: () => number = Math.random) =>
  now - (lastAt || 0) >= gapMs && rand() < 0.5;

// Who keeps what from whom: two people tied to each other.
export const pickSecretPair = (cast: Character[], rand: () => number = Math.random): { keeper: Character; from: Character } | undefined => {
  const pairs = cast.flatMap((keeper) => (keeper.ties || []).map((t) => cast.find((c) => c.id === t.withId)).filter((from): from is Character => Boolean(from)).map((from) => ({ keeper, from })));
  return pairs.length ? pairs[Math.floor(rand() * pairs.length)] : undefined;
};

// Who might gossip: tied to the keeper, not the one it's kept from, and
// someone you have a chat with.
export const pickGossip = (cast: Character[], chats: Chat[], keeper: Character, from: Character): Character | undefined =>
  cast.find((c) => c.id !== keeper.id && c.id !== from.id && (c.ties || []).some((t) => t.withId === keeper.id) && chats.some((ch) => ch.characterIds?.length === 1 && ch.characterIds[0] === c.id && !ch.whatIf));

const bare = (t: string) => t.replace(/^your\s+/i, "");

export const buildSecretPrompt = (keeper: Character, from: Character, gossip: Character | undefined, userName: string) => {
  const tie = keeper.ties?.find((t) => t.withId === from.id)?.tie;
  return [
    `${keeper.name}: ${[keeper.description, keeper.prompt].filter(Boolean).join(" ").slice(0, 400)}`,
    `${from.name}${tie ? ` is ${keeper.name}'s ${bare(tie)}` : ""}.`,
    `Invent a secret ${keeper.name} is now keeping from ${from.name}: something that would matter to ${from.name} if they knew. True to who they are; dramatic but believable.`,
    "Answer with:",
    `SECRET: <one sentence, third person, what ${keeper.name} is hiding from ${from.name}>`,
    gossip ? `GOSSIP: <${gossip.name}'s text to ${userName} letting it slip, one or two short lines in ${gossip.name}'s voice, as a "don't tell anyone">` : "",
  ].filter(Boolean).join("\n");
};

export const parseSecret = (reply: string): { secret: string; gossip?: string } | undefined => {
  const pick = (name: string) => reply.match(new RegExp(`^[\\s*_-]*${name}\\s*:\\s*([\\s\\S]+?)(?=\\n[\\s*_-]*[A-Z]+\\s*:|(?![\\s\\S]))`, "m"))?.[1].replace(/[*_]/g, "").trim().replace(/^["“]|["”]$/g, "").trim();
  const secret = pick("SECRET");
  if (!secret || secret.length < 8) return undefined;
  const gossip = pick("GOSSIP");
  return { secret: secret.slice(0, 300), ...(gossip ? { gossip: gossip.slice(0, 400) } : {}) };
};

export const addSecret = (keeper: Character, secret: KeptSecret): Character => ({ ...keeper, keptSecrets: [...(keeper.keptSecrets || []), secret].slice(-KEEP) });

// For the keeper's own prompt: what they're hiding, and from whom.
export const buildSecretsNote = (keeper: Character | undefined, characters: Character[], userName: string): string | undefined => {
  const kept = (keeper?.keptSecrets || []).filter((s) => !s.toldAt && !s.outAt);
  if (!kept.length) return undefined;
  return `Secrets you're keeping (act like it: careful, guilty or defensive around it; you might confide in ${userName} if you trust them):\n${kept.map((s) => `- From ${characters.find((c) => c.id === s.fromId)?.name || "someone"}: ${s.text}`).join("\n")}`;
};

// Secrets about this person that you know and haven't told them.
export const secretsYouKnowAbout = (person: Character, characters: Character[]) =>
  characters.flatMap((keeper) => (keeper.keptSecrets || []).filter((s) => s.fromId === person.id && s.heardFrom !== undefined && !s.toldAt && !s.outAt).map((s) => ({ keeper, secret: s })));

export const toldFact = (userName: string, keeper: string, text: string) => `${userName} told you something ${keeper} was hiding from you: ${text}`;
export const toldOnFact = (userName: string, to: string) => `${userName} told ${to} the secret you were keeping from them.`;

// Secrets come out on their own (#184): after a week or so (scaled by the
// life dial), now and then one does - the keeper confesses, lets it slip,
// or the other one finds out. Both remember how.
export const SECRET_OUT_AFTER_MS = 7 * 86_400_000;

export const secretReadyToSurface = (keepers: Character[], now: number, afterMs: number = SECRET_OUT_AFTER_MS, rand: () => number = Math.random): { keeper: Character; secret: KeptSecret } | undefined => {
  const ready = keepers.flatMap((k) => (k.keptSecrets || []).filter((s) => !s.toldAt && !s.outAt && now - s.at >= afterMs).map((secret) => ({ keeper: k, secret })));
  return ready.length && rand() < 0.4 ? ready[Math.floor(rand() * ready.length)] : undefined;
};

export const HOW_IT_CAME_OUT: KeptSecret["how"][] = ["confessed", "slipped", "found out"];

export const surfacedFacts = (keeperName: string, fromName: string, text: string, how: NonNullable<KeptSecret["how"]>) => ({
  forKeeper: how === "confessed" ? `You told ${fromName} what you'd been hiding: ${text}` : how === "slipped" ? `It slipped out in front of ${fromName}: ${text}` : `${fromName} found out what you'd been hiding: ${text}`,
  forFrom: how === "confessed" ? `${keeperName} confessed something they'd been hiding from you: ${text}` : how === "slipped" ? `${keeperName} let slip something they'd been hiding: ${text}` : `You found out what ${keeperName} had been hiding from you: ${text}`,
  timeline: how === "confessed" ? `${keeperName} confessed to ${fromName}` : how === "slipped" ? `${keeperName}'s secret slipped out in front of ${fromName}` : `${fromName} found out what ${keeperName} was hiding`,
});
