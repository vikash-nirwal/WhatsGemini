import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { Button } from "src/components/atoms/button";
import { GameKind } from "src/types";
import { GAMES } from "src/features/chat/miniGames";

interface GameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterName: string;
  onStart: (kind: GameKind, guesser: "user" | "character") => void;
}

// "Play a game" (#52): pick a game, and for 20 Questions who guesses.
const GameDialog: React.FC<GameDialogProps> = ({ open, onOpenChange, characterName, onStart }) => {
  const [guesser, setGuesser] = useState<"user" | "character">("user");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Play a game</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">{characterName} plays in character. End it any time from the bar at the bottom of the chat.</DialogDescription>
        <div className="flex flex-col gap-3">
          {GAMES.map((g) => (
            <div key={g.kind} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{g.label}</div>
                  <div className="text-xs text-muted-foreground">{g.description}</div>
                </div>
                <Button type="button" size="sm" onClick={() => { onStart(g.kind, guesser); onOpenChange(false); }} aria-label={`Play ${g.label}`}>
                  Play
                </Button>
              </div>
              {g.kind === "twenty-questions" && (
                <SegmentedControl
                  value={guesser}
                  onChange={(v) => setGuesser(v as "user" | "character")}
                  options={[
                    { value: "user", label: `${characterName} thinks, I guess` },
                    { value: "character", label: `I think, ${characterName} guesses` },
                  ]}
                />
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GameDialog;
