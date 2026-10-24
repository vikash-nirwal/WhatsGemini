import React from "react";
import { FaChevronRight } from "react-icons/fa";
import { Select } from "src/components/molecules/form-controls";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { MAX_UNANSWERED } from "src/features/character/firstTexts";

interface TextsFirstSectionProps {
  name: string;
  enabled: boolean;
  limit: number;
  onChange: (value: { enabled: boolean; limit: number }) => void;
}

// They text first (#93), set while making or editing the character: the
// switch, and how many texts in a row they send before waiting for an
// answer. With it on, a character you haven't chatted with yet starts the
// chat themselves.
const TextsFirstSection: React.FC<TextsFirstSectionProps> = ({ name, enabled, limit, onChange }) => {
  const who = name.trim() || "The character";
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        Texts first
        <span className="text-xs font-normal text-muted-foreground">{enabled ? `on, up to ${limit} without an answer` : "off"}</span>
      </summary>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {who} sends a short text out of the blue after a few quiet hours, while the app is open, and starts a chat with you if you haven't started one. Never while asleep, at most two a day, hours apart.
          </p>
          <ToggleSwitch checked={enabled} onChange={(on) => onChange({ enabled: on, limit })} label={<span className="sr-only">{who} texts first</span>} />
        </div>
        {enabled && (
          <label className="flex flex-wrap items-center justify-between gap-2 text-sm text-foreground">
            Texts in a row without an answer
            <Select aria-label="Texts in a row without an answer" value={String(limit)} onChange={(e) => onChange({ enabled, limit: Number(e.target.value) })} className="w-28">
              {Array.from({ length: MAX_UNANSWERED }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === 1 ? "1 (then wait)" : String(n)}</option>
              ))}
            </Select>
          </label>
        )}
      </div>
    </details>
  );
};

export default TextsFirstSection;
