import { Character } from "../../types";

// Shared contacts (#128): very rarely, in texting mode, a character sends
// you someone's contact card ([Contact: Name — who they are] at the end of
// a reply): a sister, a friend who can help. Tapping "Message" drafts that
// person as a new character from those words and the sender's world, and
// opens a chat with them; they know of each other.

const CONTACT_TAG = /\n*\[\s*contact\s*:\s*([^\]\n]{2,240})\]\s*$/i;
const CONTACT_PARTIAL = /\n*\[\s*contact\s*:[^\]\n]*$/i;

export const extractContact = (text: string): { text: string; contact?: { name: string; about: string } } => {
  const match = text.match(CONTACT_TAG);
  if (!match) return { text };
  const [name, ...rest] = match[1].split(/\s+[—–-]\s+|\s*\|\s*/);
  const clean = (s: string) => s.trim().replace(/^["“]|["”]$/g, "");
  if (!clean(name || "")) return { text };
  return { text: text.slice(0, match.index).trimEnd(), contact: { name: clean(name).slice(0, 40), about: clean(rest.join(" ")).slice(0, 200) } };
};

export const stripStreamingContact = (text: string): string => text.replace(CONTACT_TAG, "").replace(CONTACT_PARTIAL, "");

export const buildContactDirective = (charName: string, userName: string): string =>
  `Very rarely, when it truly fits (someone from ${charName}'s own life who ${userName} should meet, or who could help), ${charName} can share that person's contact: end the reply with [Contact: their name — who they are to ${charName}]. Never a real person.`;

// The idea a new character is drafted from: the card, and the world and
// life of whoever shared it.
export const contactIdea = (card: { name: string; about: string }, sender: Pick<Character, "name" | "description" | "scenario">): string =>
  `${card.name}${card.about ? `, ${card.about}` : ""}. Someone from ${sender.name}'s life (${sender.name}: ${(sender.description || "").slice(0, 200)}), living in the same world${sender.scenario ? ` (${sender.scenario.slice(0, 200)})` : ""}. ${sender.name} just shared their contact with the user, so they're about to text for the first time.`;
