// Episodes and cliffhangers (#103): "End episode" first has the character
// end the scene on a cliffhanger, then closes it like a chapter, with a
// title card and a "Next time on…" teaser. The hook is kept on the chat
// (Chat.pendingHook) until the next reply picks it up.

export const buildCliffhangerDirective = (name: string): string =>
  `This reply ends the episode. Bring the scene to a cliffhanger: something unexpected happens, is revealed or is about to happen - a knock at the door, a confession cut short, a name on a screen - and stop right there, unresolved, at the moment of highest tension. ${name} shouldn't explain it or wrap it up.`;

export const buildTeaserPrompt = (name: string, userName: string, transcript: string): string =>
  `This episode of a story between ${userName} and ${name} just ended on a cliffhanger:

${transcript}

Write:
TEASER: a "Next time on…" teaser for the next episode, two or three short dramatic lines, hinting without spoiling.
HOOK: the cliffhanger itself, in one plain line, so the next episode can pick it up.`;

export const parseTeaser = (reply: string): { teaser?: string; hook?: string } => {
  const teaser = reply.match(/TEASER\s*:\s*([\s\S]*?)(?=\n\s*HOOK\s*:|$)/i)?.[1]?.trim().replace(/^next time on[^:]*:\s*/i, "");
  const hook = reply.match(/HOOK\s*:\s*(.+)/i)?.[1]?.trim();
  return { teaser: teaser ? teaser.slice(0, 500) : undefined, hook: hook ? hook.slice(0, 300) : undefined };
};

export const buildHookSection = (hook: string): string =>
  `The last episode ended on a cliffhanger: ${hook}. Pick it up in this reply - right where it left off, don't skip past it or resolve it off-page.`;
