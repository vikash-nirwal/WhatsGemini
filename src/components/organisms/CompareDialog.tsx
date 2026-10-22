import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { Select, TextInput } from "src/components/molecules/form-controls";
import { ProviderPicker } from "src/components/molecules/ProviderPicker";
import { Button } from "src/components/atoms/button";
import MarkdownRenderer from "src/components/molecules/MarkdownRenderer";
import { CHAT_PROVIDER_META } from "src/features/ai/providers/registry";
import { CharacterModelOverride } from "src/features/ai/modelResolution";
import { PROVIDER_CHAT_MODELS } from "src/utils/constants";

export interface ComparedReply {
  id: string;
  label: string; // "<provider> / <model>"
  text: string;
}

interface CompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProvider: string;
  busy: boolean;
  // Set once the second reply is in: the two side by side.
  result: { current: ComparedReply; other: ComparedReply } | null;
  onCompare: (override: CharacterModelOverride) => void;
  onKeep: (keepId: string, dropId: string) => void;
}

export const providerLabel = (id: string) => CHAT_PROVIDER_META.find((p) => p.id === id)?.label || id;

// Compare two models (#88): pick another model, its take on the latest
// reply is written next to the current one, and you keep the one you like.
export const CompareDialog: React.FC<CompareDialogProps> = ({ open, onOpenChange, currentProvider, busy, result, onCompare, onKeep }) => {
  const [provider, setProvider] = useState(currentProvider);
  const [model, setModel] = useState("");
  useEffect(() => {
    if (open && !result) {
      setProvider(currentProvider);
      setModel("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const listed = PROVIDER_CHAT_MODELS[provider] || [];
  const typed = provider === "ollama" || listed.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className={result ? "max-w-4xl" : "max-w-md"}>
        <DialogTitle>Compare two models</DialogTitle>
        <DialogDescription>
          {result ? "Keep the reply you like; the other one is dropped." : "Another model writes its own take on the latest reply, next to the current one."}
        </DialogDescription>
        {result ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[result.current, result.other].map((reply) => {
              const other = reply === result.current ? result.other : result.current;
              return (
                <section key={reply.id} aria-label={reply.label} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                  <h3 className="text-xs font-semibold text-muted-foreground">{reply.label}</h3>
                  <div className="text-[14.5px] text-foreground max-h-[45vh] overflow-y-auto">
                    <MarkdownRenderer msgText={reply.text} isUser={false} />
                  </div>
                  <Button type="button" onClick={() => onKeep(reply.id, other.id)} className="mt-auto self-start">
                    Keep this one
                  </Button>
                </section>
              );
            })}
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (model.trim()) onCompare({ provider, model: model.trim() });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] text-muted-foreground">Provider</span>
              <ProviderPicker providers={CHAT_PROVIDER_META} value={provider} onChange={(id) => { setProvider(id); setModel(""); }} />
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] text-muted-foreground">Model</span>
              {typed ? (
                <TextInput aria-label="Model to compare" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. llama3.1" />
              ) : (
                <Select aria-label="Model to compare" value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">Pick a model</option>
                  {listed.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              )}
            </label>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy || !model.trim()}>
                {busy ? "Writing..." : "Compare"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
