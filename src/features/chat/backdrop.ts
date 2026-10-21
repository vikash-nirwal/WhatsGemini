// Chat backdrops (#13): a picture behind a chat's bubbles, uploaded or
// generated from where the story is set. Without one, the chat keeps its
// old look: the character's own photo, faintly.

export interface BackdropSource {
  location?: string; // the scene tracker's location (#9), when there is one
  scenario?: string;
  worldName?: string;
  worldPremise?: string;
  tags?: string[];
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text);

// What the setting is, best source first; undefined when there's nothing.
export const describeSetting = (source: BackdropSource): string | undefined => {
  const parts = [
    source.location?.trim(),
    source.worldName ? `in the world of ${source.worldName}${source.worldPremise ? ` (${clip(source.worldPremise.trim(), 160)})` : ""}` : undefined,
    !source.location && source.scenario?.trim() ? clip(source.scenario.trim(), 240) : undefined,
    source.tags && source.tags.length > 0 ? `mood: ${source.tags.join(", ")}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : undefined;
};

export const buildBackdropPrompt = (setting: string, styleClause: string): string =>
  `Wide atmospheric background scene: ${setting}. No people, no characters, no text or lettering. Calm composition with soft lighting and gentle depth of field, suitable as a subtle chat background. ${styleClause}, high quality.`;
