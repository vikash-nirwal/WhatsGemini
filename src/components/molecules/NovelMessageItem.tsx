import React from "react";
import { FaImage, FaSyncAlt } from "react-icons/fa";
import { Character, Message } from "../../types";
import { YOU } from "../../utils/constants";
import { cn } from "../../utils/cn";
import { resolveEmotionPortrait } from "../../features/ai/utils/emotionUtils";
import MarkdownRenderer from "./MarkdownRenderer";
import { DisplayImage } from "./DisplayImage";
import { CharacterAvatar } from "./CharacterAvatar";

interface NovelMessageItemProps {
  msg: Message;
  index: number;
  cast: Character[];
  illustrating: boolean;
  onIllustrate: () => void;
  onImageClick: (imgSrc: string) => void;
  illustrationError?: string;
  isFirstNarratorTurn?: boolean;
  fontFamily: "serif" | "sans";
  fontSize: "sm" | "base" | "lg" | "xl";
}

const FONT_SIZES = {
  sm: "text-[14.5px]",
  base: "text-[16px]",
  lg: "text-[17.5px]",
  xl: "text-[19px]",
};

export const NovelMessageItem: React.FC<NovelMessageItemProps> = ({
  msg,
  cast,
  illustrating,
  onIllustrate,
  onImageClick,
  illustrationError,
  isFirstNarratorTurn = false,
  fontFamily,
  fontSize,
}) => {
  const isUser = msg.role === YOU;
  const fontClass = fontFamily === "serif" ? "font-serif" : "font-sans";
  const sizeClass = FONT_SIZES[fontSize] || FONT_SIZES.base;

  if (isUser) {
    return (
      <div className="w-full my-5 py-3 px-4 md:px-5 rounded-xl border-l-4 border-primary/70 bg-primary/[0.04] backdrop-blur-[1px] transition-all">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-sans font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary">
            {msg.chosenChoiceId ? "Choice Taken" : "Player Action"}
          </span>
          {msg.isImageRequest && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              • <FaImage size={10} /> Picture requested
            </span>
          )}
        </div>
        <div className={cn("text-foreground/95 leading-relaxed", sizeClass, fontClass)}>
          <MarkdownRenderer msgText={msg.txt || ""} isUser={true} />
        </div>
      </div>
    );
  }

  return (
    <article className="w-full flex flex-col gap-4 py-2">
      {/* Scene illustration if present */}
      {msg.id && illustrating ? (
        <div className="w-full aspect-video rounded-xl bg-muted animate-pulse flex items-center justify-center gap-2 text-xs text-muted-foreground border border-border/40">
          <FaImage size={12} /> Illustrating the scene...
        </div>
      ) : (
        msg.images?.map((imgSrc, idx) => (
          <figure key={idx} className="w-full my-1 group relative">
            <DisplayImage
              srcContext={imgSrc}
              alt="Scene illustration"
              onClick={() => onImageClick(imgSrc)}
              className="w-full rounded-xl shadow-md border border-border/50 cursor-zoom-in hover:opacity-95 transition-opacity object-cover"
            />
          </figure>
        ))
      )}

      {/* Story narration text */}
      <div
        className={cn(
          "text-foreground/90 leading-relaxed",
          sizeClass,
          fontClass,
          isFirstNarratorTurn &&
            "[&_.markdown-content>p:first-of-type]:first-letter:float-left [&_.markdown-content>p:first-of-type]:first-letter:text-5xl [&_.markdown-content>p:first-of-type]:first-letter:font-bold [&_.markdown-content>p:first-of-type]:first-letter:font-serif [&_.markdown-content>p:first-of-type]:first-letter:mr-3 [&_.markdown-content>p:first-of-type]:first-letter:leading-none [&_.markdown-content>p:first-of-type]:first-letter:text-primary"
        )}
      >
        <MarkdownRenderer msgText={msg.txt || ""} isUser={false} />
      </div>

      {/* Cast mood reactions */}
      {msg.castEmotions && Object.keys(msg.castEmotions).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/20 text-xs text-muted-foreground">
          <span className="font-serif italic text-[11px] text-subtle">Reactions:</span>
          {cast
            .filter((c) => msg.castEmotions![c.id])
            .map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-secondary/60 text-[11px] border border-border/30"
              >
                <CharacterAvatar
                  name={c.name}
                  accent={c.accent}
                  imageSrc={resolveEmotionPortrait(c, msg.castEmotions![c.id])}
                  size={18}
                />
                <span className="font-medium text-foreground">{c.name}</span>
                <span className="text-subtle capitalize">({msg.castEmotions![c.id]})</span>
              </span>
            ))}
        </div>
      )}

      {/* Illustrate / Redraw action */}
      {msg.id && !illustrating && (
        <div className="flex items-center gap-3 pt-0.5">
          <button
            type="button"
            onClick={onIllustrate}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            {msg.images?.length ? (
              <>
                <FaSyncAlt size={10} /> Redraw scene
              </>
            ) : (
              <>
                <FaImage size={11} /> Illustrate scene
              </>
            )}
          </button>
          {illustrationError && <span className="text-xs text-destructive">{illustrationError}</span>}
        </div>
      )}

      {/* Chapter divider */}
      <div className="w-full flex items-center justify-center my-4 opacity-40">
        <div className="h-px flex-1 bg-border" />
        <span className="mx-3 text-xs tracking-widest text-muted-foreground select-none">✦</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    </article>
  );
};
