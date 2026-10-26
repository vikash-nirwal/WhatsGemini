import React, { useId, useState } from "react";
import { FaMagic } from "react-icons/fa";
import { TextArea, TextInput } from "src/components/molecules/form-controls";

// A field with AI help (#144): a "Suggest" button that fills it, and, when
// it has choices, a list to pick from - with anything else typed in just as
// well, so a choice that isn't listed is never out of reach.
export const SuggestField = ({ label, value, onChange, options, multiline, placeholder, hint, onSuggest, id }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
  onSuggest?: () => Promise<string | undefined>;
  id?: string;
}) => {
  const auto = useId();
  const fieldId = id || `field-${auto}`;
  const listId = `${fieldId}-choices`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggest = async () => {
    if (!onSuggest) return;
    setBusy(true);
    setError(null);
    try {
      const next = await onSuggest();
      if (next) onChange(next);
      else setError("No suggestion came back. Try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get a suggestion.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium text-foreground">{label}</label>
        {onSuggest && (
          <button type="button" onClick={() => void suggest()} disabled={busy} aria-label={`Suggest ${label.toLowerCase()}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-text hover:underline disabled:opacity-50">
            <FaMagic size={10} /> {busy ? "Thinking..." : "Suggest"}
          </button>
        )}
      </div>
      {multiline ? (
        <TextArea id={fieldId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-[90px] resize-none" />
      ) : (
        <>
          <TextInput id={fieldId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} list={options?.length ? listId : undefined} />
          {options?.length ? <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist> : null}
        </>
      )}
      {hint && <p className="text-xs text-subtle">{hint}{options?.length ? " Pick one or type your own." : ""}</p>}
      {!hint && options?.length ? <p className="text-xs text-subtle">Pick one or type your own.</p> : null}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

export default SuggestField;
