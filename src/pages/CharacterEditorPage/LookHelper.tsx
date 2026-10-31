import React from "react";
import { FaCamera, FaMagic, FaUndo } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { FieldLabel, TextInput } from "src/components/molecules/form-controls";

// The look step's helper (2026-10-31): read the Appearance and the locked
// look from the main picture, or steer the written look towards something,
// with an undo for the fields it overwrote. The editor does the AI calls
// (CharacterEditorPage, handleReadLook).
export interface LookHelperProps {
  steer: string;
  setSteer: (v: string) => void;
  hasPicture: boolean;
  hasAppearance: boolean;
  busy: "picture" | "steer" | null;
  error: string | null;
  onRead: (fromPicture: boolean) => void;
  onUndo?: () => void;
}

export const LookHelper: React.FC<LookHelperProps> = ({ steer, setSteer, hasPicture, hasAppearance, busy, error, onRead, onUndo }) => (
  <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3" role="group" aria-label="Look helper">
    <FieldLabel htmlFor="look-steer" hint="Optional. Moves the look towards this when it's read from the picture or rewritten, e.g. a body type, height, age or hair. Everything else stays as it is.">Steer the look</FieldLabel>
    <TextInput
      id="look-steer"
      value={steer}
      onChange={(e) => setSteer(e.target.value)}
      placeholder="e.g. more athletic build, taller, shoulder-length hair"
    />
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => onRead(true)} disabled={!hasPicture || Boolean(busy)} className="h-auto px-3 py-1.5 text-xs">
        <FaCamera size={11} /> {busy === "picture" ? "Reading the picture..." : "Read the look from the picture"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => onRead(false)} disabled={!hasAppearance || !steer.trim() || Boolean(busy)} className="h-auto px-3 py-1.5 text-xs">
        <FaMagic size={11} /> {busy === "steer" ? "Steering..." : "Steer the written look"}
      </Button>
      {onUndo && (
        <Button type="button" variant="ghost" size="sm" onClick={onUndo} className="h-auto px-2 py-1 text-xs">
          <FaUndo size={10} /> Undo
        </Button>
      )}
    </div>
    <p className="text-[11px] text-subtle">
      {hasPicture
        ? "Fills Appearance and the locked look from the main picture, for you to check. Needs a chat or helper model that can see pictures."
        : "Add a picture below to read the look from it."}
    </p>
    {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
  </div>
);
