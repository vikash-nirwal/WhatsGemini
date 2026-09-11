import React from "react";
import { DisplayImage } from "./DisplayImage";

interface EmotionSpritePanelProps {
  imageSrc: string;
  characterName?: string;
  emotion?: string;
  showName?: boolean; // multi-character rooms: label whose face this is, since it's no longer always the one named in the chat header
}

// Docks the character's current mood portrait beside the chat, larger than
// the per-message avatar - a SillyTavern-style presence rather than a UI
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
// in - ChatWindow.tsx's dockedSpriteImageSrc is deliberately stricter than
// that and never passes this component that fallback image.
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
const EmotionSpritePanel: React.FC<EmotionSpritePanelProps> = ({ imageSrc, characterName, emotion, showName }) => (
  <aside className="relative z-30 w-[200px] flex-none hidden lg:flex flex-col items-center justify-end overflow-hidden pointer-events-none">
    {(showName || emotion) && (
      <div className="mb-2 flex flex-col items-center text-center">
        {showName && characterName && (
          <span className="text-[12px] font-semibold text-foreground">{characterName}</span>
        )}
        {emotion && (
          <span className="text-[11px] font-medium text-subtle capitalize">{emotion}</span>
        )}
      </div>
    )}
    <DisplayImage
      srcContext={imageSrc}
      alt={`${characterName || "Character"}'s current mood`}
      className="max-w-full max-h-full object-contain object-bottom"
    />
  </aside>
);

export default EmotionSpritePanel;
