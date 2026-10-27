import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { addFalModel, FalCatalogEntry, listFalImageModels } from "src/features/ai/providers/falCatalog";
import { cn } from "src/utils/cn";

// Browsing fal.ai's image models (the user's ask, 2026-10-27): search all of
// them, see which take reference photos, and pick one; it's set up from its
// own schema before it's chosen.
export const FalModelBrowser = ({ open, onOpenChange, apiKey, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; apiKey: string; onPick: (id: string) => void }) => {
  const [models, setModels] = useState<FalCatalogEntry[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "image-to-image" | "text-to-image">("all");
  const [picking, setPicking] = useState<string | undefined>();

  useEffect(() => {
    if (!open || models) return;
    setError(undefined);
    listFalImageModels(apiKey.trim() || undefined).then(setModels, (err) => setError(err instanceof Error ? err.message : "fal.ai's model list didn't load."));
  }, [open, models, apiKey]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (models || []).filter((m) => (kind === "all" || m.category === kind) && (!q || `${m.name} ${m.id} ${m.description}`.toLowerCase().includes(q))).slice(0, 80);
  }, [models, query, kind]);

  const pick = async (m: FalCatalogEntry) => {
    setPicking(m.id);
    setError(undefined);
    try {
      await addFalModel(m, models || [], apiKey.trim() || undefined);
      onPick(m.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn't set up ${m.name}.`);
    } finally {
      setPicking(undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sheet" className="px-4">
        <div className="flex min-h-0 flex-col gap-3 pb-2">
          <DialogTitle className="pt-1">fal.ai models</DialogTitle>
          <DialogDescription>Every image model fal.ai offers. Models that edit an image take your character's photos as references, so their face stays the same; text-to-image models draw from the description alone.</DialogDescription>
          <TextInput aria-label="Search fal.ai models" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, e.g. flux, seedream, nano banana" />
          <div role="group" aria-label="Kind of model" className="flex flex-wrap gap-1.5">
            {([["all", "All"], ["image-to-image", "Uses reference photos"], ["text-to-image", "Text to image"]] as const).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)}
                className={cn("h-8 rounded-full px-3 text-[12.5px] font-semibold ring-1 ring-inset", kind === v ? "bg-primary/15 text-foreground ring-primary" : "bg-raised text-foreground ring-border")}>{l}</button>
            ))}
          </div>
          {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
          {!models && !error && <p className="text-[13px] text-muted-foreground">Loading fal.ai's models...</p>}
          {models && (
            <ul aria-label="fal.ai models" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {shown.map((m) => (
                <li key={m.id} className="flex items-start gap-3 rounded-xl px-3 py-2 ring-1 ring-inset ring-border">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-foreground">{m.name} <span className="font-normal text-subtle">· {m.category === "image-to-image" ? "edits, uses photos" : "text to image"}</span></div>
                    <div className="truncate font-mono text-[11.5px] text-subtle">{m.id}</div>
                    {m.description && <div className="line-clamp-2 text-[12.5px] text-muted-foreground">{m.description}</div>}
                  </div>
                  <Button type="button" size="sm" disabled={Boolean(picking)} aria-label={`Use ${m.name}`} onClick={() => void pick(m)}>{picking === m.id ? "Setting up..." : "Use"}</Button>
                </li>
              ))}
              {shown.length === 0 && <li className="text-[13px] text-muted-foreground">Nothing matches.</li>}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FalModelBrowser;
