// Relationship that evolves (#30): every so often the helper model reads the
// recent story and, if things between the user and the character have
// clearly changed, suggests a new label for Character.relationship
// ("strangers" -> "reluctant allies"). The user approves or dismisses each
// suggestion; nothing is rewritten on its own.

export const RELATIONSHIP_INTERVAL = 20; // messages between checks

// Due once another RELATIONSHIP_INTERVAL messages have passed since the
// last check (or since the start of the chat).
export const relationshipCheckDue = (messageCount: number, lastCheckedAt: number | undefined): boolean =>
  messageCount >= RELATIONSHIP_INTERVAL && messageCount - (lastCheckedAt ?? 0) >= RELATIONSHIP_INTERVAL;

export const buildRelationshipPrompt = (charName: string, userName: string, current: string, transcript: string, summary?: string): string =>
  `Read this roleplay between ${userName} and ${charName} and decide whether their relationship has clearly changed.

The relationship is currently described as: "${current || "not set"}"
${summary ? `\nThe story so far:\n${summary}\n` : ""}
Recent messages:
${transcript}

If it has clearly changed (closer, colder, romantic, rivals, betrayed, reconciled...), reply with only the new description: 2 to 8 words, in the same style as the current one, from ${charName}'s side (for example "Reluctant allies" or "Falling for each other").
If it hasn't clearly changed, reply with only: SAME`;

export const parseRelationshipReply = (reply: string, current: string): string | undefined => {
  const text = reply
    .trim()
    .split("\n")[0]
    .replace(/^(new description|relationship|answer)\s*:\s*/i, "")
    .replace(/^["“'*]+|["”'*.]+$/g, "")
    .trim();
  if (!text || /^same\b/i.test(text) || text.split(/\s+/).length > 12) return undefined;
  if (text.toLowerCase() === current.trim().toLowerCase()) return undefined;
  return text.charAt(0).toUpperCase() + text.slice(1);
};
