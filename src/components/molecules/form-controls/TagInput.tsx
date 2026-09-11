import React, { useState } from "react";
import { FaTimes } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { useColorTheme } from "src/hooks/useColorTheme";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

// Freeform chip input: type a tag and press Enter or "," to commit it,
// Backspace on the empty draft removes the last chip. Dedupes case-insensitively.
export const TagInput: React.FC<TagInputProps> = ({ value, onChange, placeholder, className }) => {
  const [draft, setDraft] = useState("");
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const aurora = is("aurora");

  const commitDraft = () => {
    const tag = draft.trim();
    setDraft("");
    if (!tag) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const removeTag = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 p-2 rounded-md bg-transparent min-h-[42px]",
        // Kept JS-conditional rather than a bare static class: neumorphic
        // wants NO border at all (zero width, replaced by the inset
        // shadow), not just a transparent one, so it can't share the same
        // "border border-input" base every other theme uses here.
        neumorphic ? "surface-sunken" : "border border-input",
        aurora && "surface-sunken",
        className
      )}
    >
      {value.map((tag, i) => (
        <span
          key={tag}
          className={cn(
            "inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium",
            "surface-raised-sm"
          )}
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive"
            aria-label={`Remove tag ${tag}`}
          >
            <FaTimes size={9} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commitDraft();
          } else if (e.key === "Backspace" && !draft && value.length > 0) {
            removeTag(value.length - 1);
          }
        }}
        onBlur={commitDraft}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[100px] bg-transparent outline-none text-sm placeholder-subtle"
      />
    </div>
  );
};
