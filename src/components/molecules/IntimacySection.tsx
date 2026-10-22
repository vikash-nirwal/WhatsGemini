import React from "react";
import { FaChevronRight } from "react-icons/fa";
import { TextInput } from "src/components/molecules/form-controls";
import { IntimacyProfile } from "src/types";
import { INTIMACY_FIELDS, hasIntimacy } from "src/features/character/intimacy";

interface IntimacySectionProps {
  value: IntimacyProfile | undefined;
  onChange: (value: IntimacyProfile | undefined) => void;
  // Shown under the heading; the persona's says it's about you.
  hint?: string;
}

// The intimacy profile (#73), for a character or a persona: a few short
// fields, all optional, sent only when a scene turns romantic.
const IntimacySection: React.FC<IntimacySectionProps> = ({ value, onChange, hint }) => {
  const set = (key: keyof IntimacyProfile, text: string) => {
    const next = { ...value, [key]: text || undefined };
    onChange(hasIntimacy(next) ? next : undefined);
  };
  const filled = INTIMACY_FIELDS.filter((f) => value?.[f.key]?.trim()).length;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        Intimacy profile
        <span className="text-xs font-normal text-muted-foreground">{filled > 0 ? `${filled} of ${INTIMACY_FIELDS.length} filled in` : "none"}</span>
      </summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <p className="sm:col-span-2 text-xs text-muted-foreground">
          {hint || "How they are in romance. Only sent when a scene turns romantic (a relationship stage of flirting or beyond, or romantic talk), so it doesn't fill every prompt."}
        </p>
        {INTIMACY_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {f.label}
            <TextInput value={value?.[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
          </label>
        ))}
      </div>
    </details>
  );
};

export default IntimacySection;
