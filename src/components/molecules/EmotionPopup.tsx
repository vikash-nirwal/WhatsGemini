import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DisplayImage } from "./DisplayImage";
import { EmotionSprite } from "./EmotionSpritePanel";

export interface EmotionPopupTrigger extends EmotionSprite {
  key: number; // bumped by the caller on every re-trigger so the same mood can pop again later
}

interface EmotionPopupProps {
  trigger: EmotionPopupTrigger | null;
  durationMs: number;
}

// A character's mood portrait, centered over the whole page, for a moment
// when their emotion changes mid-conversation - separate from the docked
// EmotionSpritePanel (which shows the *current* state at rest); this is
// the moment-of-change callout. `trigger.key` is what actually starts the
// animation/timer - bumping it retriggers even if imageSrc/emotion are
// identical to the last popup (e.g. a mood that left and came back).
const EmotionPopup: React.FC<EmotionPopupProps> = ({ trigger, durationMs }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!trigger) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), durationMs);
    return () => clearTimeout(timer);
  }, [trigger, durationMs]);

  if (!trigger) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 pointer-events-none">
      <AnimatePresence>
        {visible && (
          <motion.div
            key={trigger.key}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="flex flex-col items-center gap-2.5"
          >
            <div className="w-[200px] h-[260px] rounded-2xl overflow-hidden shadow-2xl bg-background/50 backdrop-blur-sm border border-border/40">
              <DisplayImage
                srcContext={trigger.imageSrc}
                alt={`${trigger.characterName || "Character"} is now feeling ${trigger.emotion || "different"}`}
                className="w-full h-full object-contain"
              />
            </div>
            {(trigger.characterName || trigger.emotion) && (
              <div className="px-3.5 py-1 rounded-full bg-background/85 border border-border/40 shadow-sm text-xs font-semibold text-foreground">
                {trigger.characterName}
                {trigger.emotion && <span className="font-medium text-subtle capitalize"> · {trigger.emotion}</span>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EmotionPopup;
