import React from "react";
import { Character } from "../../types";
import { CharacterAvatar } from "../ui/CharacterAvatar";
import { cn } from "../../utils/cn";

interface ParticipantStripProps {
  characters: Character[]; // every room member, in characterIds order
  mutedParticipantIds?: number[];
  disabled?: boolean;
  onForceReply: (characterId: number) => void;
}

// Manual turn-routing override (Phase 12) - clicking a bot's avatar forces
// them to reply next, bypassing the round-robin pick. Only ever rendered
// for an actual room (2+ characters); a 1:1 chat has no use for this.
const ParticipantStrip: React.FC<ParticipantStripProps> = ({ characters, mutedParticipantIds, disabled, onForceReply }) => {
  const muted = mutedParticipantIds || [];

  return (
    <div className="flex items-center gap-2 px-1 pb-2 overflow-x-auto">
      <span className="text-[11px] text-subtle font-medium flex-shrink-0">Reply as:</span>
      {characters.map((char) => {
        const isMuted = muted.includes(char.id);
        return (
          <button
            key={char.id}
            type="button"
            onClick={() => onForceReply(char.id)}
            disabled={disabled || isMuted}
            title={isMuted ? `${char.name} is muted` : `Make ${char.name} reply now`}
            aria-label={isMuted ? `${char.name} is muted` : `Make ${char.name} reply now`}
            className={cn(
              "flex-shrink-0 rounded-full transition disabled:cursor-not-allowed",
              isMuted ? "opacity-30" : "hover:scale-110 hover:ring-2 hover:ring-primary/50"
            )}
          >
            <CharacterAvatar name={char.name} accent={char.accent} size={28} />
          </button>
        );
      })}
    </div>
  );
};

export default ParticipantStrip;
