// Someone added to a chat (the user's report, 2026-10-30): they used to
// open with their card's fixed greeting, as if the conversation hadn't
// started. Now their first message is written with the chat in front of
// them.
export const buildArrivalDirective = (name: string, userName: string) =>
  `${name}, ${userName} has just added you to this conversation. Read what's been said so far and join in as yourself: greet the people you know the way you would, react to what they're talking about, and pick up from there. Don't use a stock opening line or introduce yourself as if nobody had said anything yet. One message.`;
