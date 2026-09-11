import React from "react";
import { DisplayImage } from "./DisplayImage";
import { useColorTheme } from "src/hooks/useColorTheme";

export interface EmotionSprite {
  imageSrc: string;
  characterName?: string;
  emotion?: string;
}

interface EmotionSpritePanelProps {
  sprites: EmotionSprite[];
  showNames?: boolean; // label whose face is whose; defaults to on once there's more than one sprite to tell apart
}

// Docks the room's current mood portraits beside the chat, larger than the
// per-message avatar - a SillyTavern-style presence rather than a UI
// drawer. Deliberately carries no bg-*/border-* classes (unlike ScenePanel/
// ParticipantsPanel's `bg-card/70 border-l` drawer treatment) so the page's
// own background shows straight through and it reads as one continuous
// surface with the chat column, not a separate boxed panel - don't add a
// background/border here without deliberately revisiting that choice.
//
// Only really seamless once a specifically-generated portrait is showing
// (neutral included, once one's been generated for it) - those alone are
// generated against a chroma-key backdrop and stripped to real transparency
// (see portraitUtils.ts's removeChromaKeyBackground). The no-portrait-yet
// fallback (resolveEmotionPortrait, emotionUtils.ts) is the character's
// ordinary main avatar, an opaque image with its own plain background baked
// in - ChatWindow.tsx's dockedSprites is deliberately stricter than that and
// never feeds this component that fallback image.
//
// `relative z-30`: the message composer (ChatPage.tsx) is a sibling of
// ChatWindow entirely, floated via `absolute ... z-20` over the whole page -
// not a descendant this panel's own DOM order would naturally sit above.
// Without an explicit position+z-index of its own this panel stayed in the
// static-flow stacking layer, which always paints *below* any positioned/
// z-indexed element regardless of DOM order - that's what put it behind the
// composer. z-30 puts it above both the composer and the atmospheric
// full-bleed background image ChatWindow renders behind the messages
// (unpositioned, so effectively z-0) - the sprite is meant to read as the
// frontmost thing in the room. Still pointer-events-none, so it never
// blocks clicks/typing on whatever it visually overlaps.
//
// Group chats dock every participant with a current mood, not just the last
// speaker - `flex-1 min-w-0`/`min-h-0` per sprite (rather than a fixed size)
// is what keeps them all *contained* as the roster grows: each portrait
// shrinks to share the fixed-width panel instead of overflowing it or
// forcing a scrollbar.
const EmotionSpritePanel: React.FC<EmotionSpritePanelProps> = ({ sprites, showNames }) => {
  const { is } = useColorTheme();
  if (sprites.length === 0) return null;
  const namesOn = showNames ?? sprites.length > 1;

  if (is("terminal")) {
    // Terminal boxes each portrait in a bordered frame with a name + mood
    // badge instead of letting it float over the chat.
    return (
      <aside className="relative z-30 w-[210px] flex-none hidden lg:flex flex-col gap-3 px-5 py-5 border-l border-border bg-background overflow-y-auto pointer-events-none">
        <span className="text-[10px] text-muted-foreground"># portrait{sprites.length > 1 ? "s" : ""}</span>
        {sprites.map((sprite, i) => (
          <div key={i} className="flex-1 min-h-0 border border-border-bright p-2 flex flex-col gap-2.5">
            <div
              className={
                sprites.length > 1
                  ? "flex-1 min-h-0 overflow-hidden flex items-end justify-center"
                  : "aspect-[3/4] overflow-hidden flex items-end justify-center"
              }
            >
              <DisplayImage
                srcContext={sprite.imageSrc}
                alt={`${sprite.characterName || "Character"}'s current mood`}
                className="max-w-full max-h-full object-contain object-bottom"
              />
            </div>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-xs font-bold text-foreground truncate">{sprite.characterName}</span>
              {sprite.emotion && (
                <span className="flex-none text-[9px] font-bold uppercase px-2 py-0.5 bg-primary text-primary-foreground">
                  {sprite.emotion}
                </span>
              )}
            </div>
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground leading-relaxed"># portrait follows the current mood.</p>
      </aside>
    );
  }
  return (
    <aside className="relative z-30 w-[200px] flex-none hidden lg:flex flex-row items-end justify-center gap-1 overflow-hidden pointer-events-none">
      {sprites.map((sprite, i) => (
        <div key={i} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end overflow-hidden">
          {(namesOn || sprite.emotion) && (
            <div className="mb-2 flex flex-col items-center text-center">
              {namesOn && sprite.characterName && (
                <span className="text-[12px] font-semibold text-foreground truncate max-w-full">{sprite.characterName}</span>
              )}
              {sprite.emotion && <span className="text-[11px] font-medium text-subtle capitalize">{sprite.emotion}</span>}
            </div>
          )}
          <DisplayImage
            srcContext={sprite.imageSrc}
            alt={`${sprite.characterName || "Character"}'s current mood`}
            className="max-w-full max-h-full object-contain object-bottom"
          />
        </div>
      ))}
    </aside>
  );
};

export default EmotionSpritePanel;
