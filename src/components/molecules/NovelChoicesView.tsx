import React from "react";
import { FaImage, FaPaperPlane, FaTimes } from "react-icons/fa";
import { AdventureChoice } from "../../types";
import { cn } from "../../utils/cn";
import { Button } from "../atoms/button";
import { Textarea } from "../atoms/textarea";

interface NovelChoicesViewProps {
  choices?: AdventureChoice[];
  onSelectChoice: (label: string, choiceId?: string) => void;
  inputText: string;
  setInputText: (val: string) => void;
  onSend: (text: string) => void;
  generating: boolean;
  imageRequested: boolean;
  setImageRequested: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
  fontFamily: "serif" | "sans";
}

const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export const NovelChoicesView: React.FC<NovelChoicesViewProps> = ({
  choices,
  onSelectChoice,
  inputText,
  setInputText,
  onSend,
  generating,
  imageRequested,
  setImageRequested,
  disabled = false,
  fontFamily,
}) => {
  const fontClass = fontFamily === "serif" ? "font-serif" : "font-sans";

  return (
    <div className="flex-shrink-0 border-t border-border/40 bg-background/95 backdrop-blur px-4 md:px-8 py-4 flex flex-col gap-4">
      {/* Story choices as decision forks */}
      {choices && choices.length > 0 && (
        <div className="w-full max-w-[760px] mx-auto flex flex-col gap-2.5">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-serif italic text-xs uppercase tracking-widest text-muted-foreground font-semibold">
              ✦ Paths Ahead ✦
            </span>
            <div className="h-px flex-1 bg-border/40" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {choices.map((choice, i) => {
              const marker = ROMAN_NUMERALS[i] || `${i + 1}`;
              return (
                <button
                  key={choice.id}
                  type="button"
                  disabled={generating || disabled}
                  onClick={() => onSelectChoice(choice.label, choice.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border border-border/60 bg-card/50 hover:bg-primary/[0.06] hover:border-primary/50 transition-all flex items-start gap-2.5 group shadow-sm disabled:opacity-50",
                    fontClass
                  )}
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-md bg-primary/10 text-primary font-serif font-bold text-[11px] flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors mt-0.5">
                    {marker}
                  </span>
                  <span className="flex-1 text-[13.5px] text-foreground group-hover:text-primary transition-colors leading-snug">
                    {choice.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Picture request notification */}
      {imageRequested && (
        <div className="w-full max-w-[760px] mx-auto flex items-center gap-2.5 px-3 py-2 bg-primary/10 border border-primary rounded-lg">
          <span className="text-primary flex-shrink-0 flex">
            <FaImage size={13} />
          </span>
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Picture requested — your next action will be illustrated with the whole cast, focused on what you ask to see.
          </span>
          <Button
            onClick={() => setImageRequested(false)}
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
            aria-label="Cancel picture request"
          >
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      {/* Custom player action input */}
      <div className="w-full max-w-[760px] mx-auto flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-serif italic text-xs text-muted-foreground">
            Or write your own action:
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => setImageRequested((v) => !v)}
            disabled={generating || disabled}
            variant="ghost"
            title="Request a picture with your next action"
            aria-label="Request a picture with your next action"
            aria-pressed={imageRequested}
            className={cn(
              "h-auto flex-shrink-0 self-end aspect-square rounded-lg",
              imageRequested
                ? "bg-primary/[0.14] text-primary hover:bg-primary/[0.2]"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <FaImage size={15} />
          </Button>
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend(inputText);
              }
            }}
            placeholder="What do you do? (e.g. I inspect the ancient engravings...)"
            disabled={generating || disabled}
            className={cn("resize-none min-h-[44px] max-h-[160px] text-sm", fontClass)}
          />
          <Button
            onClick={() => onSend(inputText)}
            disabled={generating || !inputText.trim() || disabled}
            size="icon"
            className="h-auto flex-shrink-0 self-end aspect-square"
            aria-label="Send action"
            title="Send action"
          >
            <FaPaperPlane size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
};
