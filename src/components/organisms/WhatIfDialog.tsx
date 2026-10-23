import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextArea, TextInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { cn } from "src/utils/cn";
import { FLASHBACK_IDEAS, Preset, UNIVERSES } from "src/features/chat/whatIf";
import { WhatIfChat } from "src/types";

interface WhatIfDialogProps {
  kind: WhatIfChat["kind"] | null; // open while set
  onOpenChange: (open: boolean) => void;
  characterName: string;
  onStart: (whatIf: WhatIfChat) => void;
}

// Flashbacks (#102) and what-if universes (#104): pick a preset or write
// your own; for a flashback, say who you play in it (or nobody, to watch).
export const WhatIfDialog: React.FC<WhatIfDialogProps> = ({ kind, onOpenChange, characterName, onStart }) => {
  const presets: Preset[] = kind === "flashback" ? FLASHBACK_IDEAS : UNIVERSES;
  const [picked, setPicked] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [setting, setSetting] = useState("");
  const [userRole, setUserRole] = useState("");
  useEffect(() => {
    setPicked(null);
    setTitle("");
    setSetting("");
    setUserRole("");
  }, [kind]);
  const pick = (preset: Preset) => {
    setPicked(preset.id);
    setTitle(preset.title);
    setSetting(preset.setting);
  };
  const ready = Boolean(kind && title.trim() && setting.trim());
  return (
    <Dialog open={Boolean(kind)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{kind === "flashback" ? `A flashback with ${characterName}` : `${characterName} in another world`}</DialogTitle>
        <DialogDescription>
          {kind === "flashback"
            ? `A scene from before you met, in its own chat. When it ends, what happened becomes part of ${characterName}'s past.`
            : `A new chat where ${characterName} lives in another world: same personality, a different life. Nothing here carries back.`}
        </DialogDescription>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!kind || !ready) return;
            onStart({ kind, title: title.trim(), setting: setting.trim(), ...(kind === "flashback" && userRole.trim() ? { userRole: userRole.trim() } : {}) });
          }}
        >
          <div role="group" aria-label={kind === "flashback" ? "Flashback ideas" : "Worlds"} className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button key={p.id} type="button" variant="outline" size="sm" aria-pressed={picked === p.id} className={cn(picked === p.id && "border-primary bg-primary/10")} onClick={() => pick(p)}>
                {p.title}
              </Button>
            ))}
          </div>
          <TextInput aria-label="Name" value={title} onChange={(e) => { setTitle(e.target.value); setPicked(null); }} placeholder={kind === "flashback" ? "e.g. The summer at the lake" : "e.g. Pirates"} />
          <TextArea
            aria-label={kind === "flashback" ? "The scene" : "The world"}
            value={setting}
            onChange={(e) => { setSetting(e.target.value); setPicked(null); }}
            placeholder={kind === "flashback" ? "What happens, and when" : "What this world is like"}
            rows={3}
          />
          {kind === "flashback" && (
            <TextInput aria-label="Who you play in it" value={userRole} onChange={(e) => setUserRole(e.target.value)} placeholder="Nobody (just watch), or e.g. their childhood friend" />
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={!ready}>{kind === "flashback" ? "Start the flashback" : "Go there"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
