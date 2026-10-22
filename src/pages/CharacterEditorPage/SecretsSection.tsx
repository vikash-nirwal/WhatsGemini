import React from "react";
import { FaChevronRight, FaPlus, FaTrash } from "react-icons/fa";
import { Select, TextInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { STAGE_LABELS, STAGES } from "src/features/character/relationshipStages";
import { newSecretId } from "src/features/character/secrets";
import { CharacterSecret, RelationshipStage } from "src/types";

interface SecretsSectionProps {
  value: CharacterSecret[];
  onChange: (value: CharacterSecret[]) => void;
}

// Secrets (#81): what the character keeps to themselves, and when each can
// come out. They hint until then.
const SecretsSection: React.FC<SecretsSectionProps> = ({ value, onChange }) => {
  const update = (index: number, patch: Partial<CharacterSecret>) => onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        Secrets
        <span className="text-xs font-normal text-muted-foreground">{value.length > 0 ? `${value.length} secret${value.length === 1 ? "" : "s"}` : "none"}</span>
      </summary>

      <div className="mt-4 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Things they keep to themselves. They only hint at a secret until its time comes, then may tell you; a small note marks the moment. The relationship stage is set in a chat's Scene panel, and trust comes from the scene tracker.
        </p>

        {value.map((s, i) => (
          <div key={s.id} role="group" aria-label={`Secret ${i + 1}`} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <TextInput aria-label="The secret" value={s.text} onChange={(e) => update(i, { text: e.target.value })} placeholder="e.g. She left the navy after a mission went wrong" className="flex-1" />
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove secret ${i + 1}`}>
                <FaTrash size={11} />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56">
                <Select aria-label="When it can come out" value={s.reveal} onChange={(e) => update(i, { reveal: e.target.value as CharacterSecret["reveal"] })}>
                  <option value="stage">At a relationship stage</option>
                  <option value="trust">At a trust level</option>
                  <option value="asked">Only if you ask</option>
                </Select>
              </div>
              {s.reveal === "stage" && (
                <div className="w-40">
                  <Select aria-label="Stage" value={s.stage || "dating"} onChange={(e) => update(i, { stage: e.target.value as RelationshipStage })}>
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {s.reveal === "trust" && (
                <TextInput type="number" aria-label="Trust (0-100)" min="0" max="100" value={s.trust ?? 70} onChange={(e) => update(i, { trust: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-24" />
              )}
            </div>
          </div>
        ))}

        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { id: newSecretId(), text: "", reveal: "stage", stage: "dating" }])}>
            <FaPlus size={10} /> Add a secret
          </Button>
        </div>
      </div>
    </details>
  );
};

export default SecretsSection;
