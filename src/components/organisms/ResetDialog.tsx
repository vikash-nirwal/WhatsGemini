import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { Button } from "src/components/atoms/button";
import { Checkbox } from "src/components/atoms/checkbox";

export interface ResetOption {
  id: string;
  label: string;
  defaultOn?: boolean;
}

// Reset (#158), confirmed first: what goes, the choices that go with it,
// and that it can't be undone.
export const ResetDialog = ({ open, onOpenChange, title, description, options = [], onReset }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  options?: ResetOption[];
  onReset: (choices: Record<string, boolean>) => Promise<void> | void;
}) => {
  const initial = () => Object.fromEntries(options.map((o) => [o.id, Boolean(o.defaultOn)]));
  const [choices, setChoices] = useState<Record<string, boolean>>(initial);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setChoices(initial()); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sheet">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description} This can't be undone.</DialogDescription>
        {options.length > 0 && (
          <div className="flex flex-col gap-2 pt-2">
            {options.map((o) => (
              <label key={o.id} className="flex items-center gap-2.5 text-sm text-foreground">
                <Checkbox checked={choices[o.id]} onCheckedChange={(v) => setChoices((c) => ({ ...c, [o.id]: v === true }))} aria-label={o.label} />
                {o.label}
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onReset(choices);
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Resetting..." : "Reset"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
