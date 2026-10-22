import React, { useEffect, useState } from "react";
import { Input } from "src/components/atoms/input";

// A relationship's note, saved on blur so typing doesn't write every key.
export const RelationshipNote: React.FC<{ value: string; onSave: (note: string) => void }> = ({ value, onSave }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      aria-label="How they feel"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
      placeholder="e.g. Resents him for the crash, but won't say so"
      className="h-8 text-[12.5px] px-2.5 rounded-lg"
    />
  );
};
