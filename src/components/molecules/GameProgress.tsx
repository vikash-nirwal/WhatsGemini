import React from "react";
import { FaGamepad } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { Button } from "src/components/atoms/button";
import { ChatGame } from "src/types";
import { gameLabel, gameProgress } from "src/features/chat/miniGames";

// The mini-game being played (#52), at the end of the chat: how far it's
// got, the score so far, and a way to stop.
export const GameProgress = ({ game, score, characterName, onEnd, terminal = false }: { game: ChatGame; score?: { user: number; character: number }; characterName: string; onEnd: () => void; terminal?: boolean }) => (
  <section
    aria-label="Game"
    className={cn(
      "mb-6 mx-auto flex max-w-xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 font-sans text-xs",
      terminal ? "border border-border" : "rounded-2xl border border-border/60 bg-card/[0.88] shadow-soft"
    )}
  >
    <FaGamepad aria-hidden size={13} className="text-primary flex-shrink-0" />
    <div className="min-w-0 flex-1">
      <span className="font-semibold text-foreground">{gameLabel(game.kind)}</span>
      <span className="text-muted-foreground">
        {" · "}
        {game.kind === "twenty-questions" ? (game.guesser === "character" ? `${characterName} is guessing` : "You're guessing") + " · " : ""}
        {gameProgress(game)}
      </span>
      {score && (score.user > 0 || score.character > 0) && (
        <span className="text-muted-foreground"> · Score: you {score.user}, {characterName} {score.character}</span>
      )}
    </div>
    <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={onEnd}>
      End game
    </Button>
  </section>
);
