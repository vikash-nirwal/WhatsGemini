import React, { useEffect, useState } from "react";
import { FaMagic, FaPlus, FaTrash, FaBook } from "react-icons/fa";
import Modal from "src/components/molecules/Modal";
import { Button } from "src/components/atoms/button";
import { Input } from "src/components/atoms/input";
import { Card } from "src/components/atoms/card";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { TextArea, FieldLabel, TagInput } from "src/components/molecules/form-controls";
import { useAppDispatch } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { LoreEntry } from "src/types";
import { ParsedCharacterCard } from "src/features/character/characterCard";
import {
  ImportCustomizeFields,
  pickCustomizeFields,
  applyCustomizeFields,
  buildImportCustomizePrompt,
  parseImportCustomizeResponse,
} from "src/features/character/importCustomize";

interface ImportReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  data: ParsedCharacterCard | null;
  onConfirm: (data: ParsedCharacterCard) => void;
}

const newLoreEntry = (): LoreEntry => ({
  id: `book_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  keywords: [],
  content: "",
  enabled: true,
});

// Shown right after a character card (and, since chub.ai/SillyTavern cards
// fold their lorebook into the same file, its lore entries too) is parsed
// but before it's saved - lets the user hand-edit anything the card brought
// in, or describe a change in plain English and have the AI rewrite the
// relevant fields, without ever touching the character list until they
// confirm.
const ImportReviewDialog: React.FC<ImportReviewDialogProps> = ({ isOpen, onClose, data, onConfirm }) => {
  const dispatch = useAppDispatch();
  const [fields, setFields] = useState<ImportCustomizeFields | null>(null);
  const [instruction, setInstruction] = useState("");
  const [applying, setApplying] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Re-seed the form from whatever was just parsed each time a new import
  // opens the dialog - `data` is a fresh object per import, so identity is a
  // reliable "this is a new file" signal.
  useEffect(() => {
    if (isOpen && data) {
      setFields(pickCustomizeFields(data));
      setInstruction("");
      setAiError(null);
    }
  }, [isOpen, data]);

  if (!fields) return null;

  const update = (patch: Partial<ImportCustomizeFields>) => setFields((prev) => (prev ? { ...prev, ...patch } : prev));

  const updateLoreEntry = (id: string, patch: Partial<LoreEntry>) =>
    setFields((prev) => (prev ? { ...prev, loreEntries: prev.loreEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : prev));

  const removeLoreEntry = (id: string) =>
    setFields((prev) => (prev ? { ...prev, loreEntries: prev.loreEntries.filter((e) => e.id !== id) } : prev));

  const addLoreEntry = () => setFields((prev) => (prev ? { ...prev, loreEntries: [...prev.loreEntries, newLoreEntry()] } : prev));

  const handleApplyWithAi = async () => {
    if (!fields || !instruction.trim()) return;
    setAiError(null);
    setApplying(true);
    try {
      const prompt = buildImportCustomizePrompt(fields, instruction.trim());
      const text = await dispatch(generateAssistText({ instruction: prompt })).unwrap();
      setFields(parseImportCustomizeResponse(text));
      setInstruction("");
    } catch (err: any) {
      setAiError(typeof err === "string" ? err : err?.message || "Failed to apply that change. Check your API key in Settings.");
    } finally {
      setApplying(false);
    }
  };

  const handleConfirm = () => {
    if (!data || !fields) return;
    onConfirm(applyCustomizeFields(data, fields));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Review before importing" subtitle="Edit anything below, or describe a change and let AI apply it, then import." size="lg">
      <div className="flex flex-col gap-5">
        <Card className="p-4 flex flex-col gap-2.5 border-primary/20 bg-primary/5">
          <FieldLabel hint={'Describe a change in plain English (e.g. "make her sarcastic and add a lore entry about her hometown") and the AI will rewrite the fields below. Nothing is saved until you hit Import.'}>
            AI assist (optional)
          </FieldLabel>
          <TextArea
            placeholder='e.g. "Tone down the personality, remove the NSFW tag, and merge the two lore entries about the tavern into one."'
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="resize-none min-h-[60px]"
          />
          <div>
            <Button type="button" variant="outline" onClick={handleApplyWithAi} disabled={applying || !instruction.trim()} className="text-xs">
              <FaMagic size={11} /> {applying ? "Applying..." : "Apply with AI"}
            </Button>
          </div>
          {aiError && <p className="text-xs text-destructive">{aiError}</p>}
        </Card>

        <div className="flex flex-col gap-3">
          <div>
            <FieldLabel>Name</FieldLabel>
            <Input value={fields.name} onChange={(e) => update({ name: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Tags</FieldLabel>
            <TagInput value={fields.tags} onChange={(tags) => update({ tags })} placeholder="Add a tag..." />
          </div>
          <div>
            <FieldLabel>Relationship</FieldLabel>
            <Input value={fields.relationship} onChange={(e) => update({ relationship: e.target.value })} placeholder="e.g. Childhood friend" />
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <TextArea value={fields.description} onChange={(e) => update({ description: e.target.value })} className="resize-none min-h-[70px]" />
          </div>
          <div>
            <FieldLabel>Personality</FieldLabel>
            <TextArea value={fields.prompt} onChange={(e) => update({ prompt: e.target.value })} className="resize-none min-h-[90px]" />
          </div>
          <div>
            <FieldLabel>Scenario</FieldLabel>
            <TextArea value={fields.scenario} onChange={(e) => update({ scenario: e.target.value })} className="resize-none min-h-[60px]" />
          </div>
          <div>
            <FieldLabel>Appearance</FieldLabel>
            <TextArea value={fields.appearance} onChange={(e) => update({ appearance: e.target.value })} className="resize-none min-h-[60px]" />
          </div>
          <div>
            <FieldLabel>Greeting</FieldLabel>
            <TextArea value={fields.first_mes} onChange={(e) => update({ first_mes: e.target.value })} className="resize-none min-h-[70px]" />
          </div>
          <div>
            <FieldLabel>Example dialogue</FieldLabel>
            <TextArea value={fields.mes_example} onChange={(e) => update({ mes_example: e.target.value })} className="resize-none min-h-[70px]" />
          </div>
        </div>

        <Card className="p-4 flex flex-col gap-3">
          <h3 className="font-semibold text-[13px] text-foreground flex items-center gap-2">
            <FaBook size={12} className="text-subtle" /> Lorebook ({fields.loreEntries.length})
          </h3>
          {fields.loreEntries.length === 0 && <p className="text-xs text-subtle italic">No lore entries.</p>}
          <div className="flex flex-col gap-2.5">
            {fields.loreEntries.map((entry, idx) => (
              <div key={entry.id} className="rounded-lg border border-border p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-subtle">Entry {idx + 1}</span>
                  <div className="flex items-center gap-3">
                    <ToggleSwitch checked={entry.enabled !== false} onChange={(v) => updateLoreEntry(entry.id, { enabled: v })} label="Enabled" className="text-xs" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLoreEntry(entry.id)}
                      className="h-7 w-7 text-subtle hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                      title="Delete this lore entry"
                      aria-label="Delete this lore entry"
                    >
                      <FaTrash size={11} />
                    </Button>
                  </div>
                </div>
                <TagInput value={entry.keywords} onChange={(kws) => updateLoreEntry(entry.id, { keywords: kws })} placeholder="Add a keyword..." />
                <TextArea value={entry.content} onChange={(e) => updateLoreEntry(entry.id, { content: e.target.value })} className="resize-none min-h-[60px]" />
              </div>
            ))}
          </div>
          <Button type="button" variant="panel" onClick={addLoreEntry} className="h-auto w-full px-3 py-2 text-xs font-medium border border-dashed border-border hover:border-primary hover:text-primary">
            <FaPlus size={11} /> Add Lore Entry
          </Button>
        </Card>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="default" onClick={handleConfirm} disabled={!fields.name.trim()}>
            Import
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ImportReviewDialog;
