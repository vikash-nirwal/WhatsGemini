import React from "react";
import { FaChevronRight } from "react-icons/fa";
import { Select } from "src/components/molecules/form-controls";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { WritingStyle } from "src/types";
import { EMOJI_LABELS, LENGTH_LABELS, PUNCTUATION_LABELS } from "src/features/character/writingStyle";

interface WritingStyleSectionProps {
  name: string;
  value: WritingStyle | undefined;
  onChange: (value: WritingStyle | undefined) => void;
}

const SwitchRow: React.FC<{ label: string; checked: boolean; onChange: (on: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm text-foreground">{label}</span>
    <ToggleSwitch checked={checked} onChange={onChange} label={<span className="sr-only">{label}</span>} />
  </div>
);

// "How they write" (#111): the texting profile that goes into every prompt.
// Example dialogue above shows the voice; this pins down the habits.
const WritingStyleSection: React.FC<WritingStyleSectionProps> = ({ name, value, onChange }) => {
  const style = value || {};
  const set = (patch: Partial<WritingStyle>) => onChange({ ...style, ...patch });
  const count = Object.values(style).filter(Boolean).length;
  const who = name.trim() || "they";
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        How {who} write{name.trim() ? "s" : ""}
        <span className="text-xs font-normal text-muted-foreground">{count > 0 ? `${count} habit${count === 1 ? "" : "s"}` : "as written"}</span>
      </summary>
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Texting habits the model keeps to in every reply: length, case, punctuation, emoji. Leave a setting blank to let the personality decide.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Select aria-label="Message length" value={style.length || ""} onChange={(e) => set({ length: (e.target.value || undefined) as WritingStyle["length"] })}>
              <option value="">Length: as written</option>
              {(Object.keys(LENGTH_LABELS) as NonNullable<WritingStyle["length"]>[]).map((k) => <option key={k} value={k}>{LENGTH_LABELS[k]}</option>)}
            </Select>
          </div>
          <div>
            <Select aria-label="Punctuation" value={style.punctuation || ""} onChange={(e) => set({ punctuation: (e.target.value || undefined) as WritingStyle["punctuation"] })}>
              <option value="">Punctuation: as written</option>
              {(Object.keys(PUNCTUATION_LABELS) as NonNullable<WritingStyle["punctuation"]>[]).map((k) => <option key={k} value={k}>{PUNCTUATION_LABELS[k]}</option>)}
            </Select>
          </div>
          <div>
            <Select aria-label="Emoji" value={style.emoji || ""} onChange={(e) => set({ emoji: (e.target.value || undefined) as WritingStyle["emoji"] })}>
              <option value="">Emoji: as written</option>
              {(Object.keys(EMOJI_LABELS) as NonNullable<WritingStyle["emoji"]>[]).map((k) => <option key={k} value={k}>{EMOJI_LABELS[k]}</option>)}
            </Select>
          </div>
        </div>
        <SwitchRow label="Mostly lowercase" checked={Boolean(style.lowercase)} onChange={(on) => set({ lowercase: on || undefined })} />
        <SwitchRow label="Abbreviations (u, rn, tbh)" checked={Boolean(style.abbreviations)} onChange={(on) => set({ abbreviations: on || undefined })} />
        <SwitchRow label="Splits a thought over several texts" checked={Boolean(style.doubleTexts)} onChange={(on) => set({ doubleTexts: on || undefined })} />
      </div>
    </details>
  );
};

export default WritingStyleSection;
