import React from "react";
import { useAppDispatch } from "../../store/hooks";
import { updateChatMutedParticipants } from "../../features/chatSlice";
import { Character } from "../../types";
import { CharacterAvatar } from "./CharacterAvatar";
import { ChatSidePanelShell } from "./ChatSidePanelShell";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";

interface ParticipantsPanelProps {
  chatId: number;
  characters: Character[]; // every member of the room, in characterIds order
  mutedParticipantIds?: number[];
  onClose: () => void;
}

// Same slide-in drawer shape as ScenePanel - a room's equivalent surface for
// "who's actually in this conversation right now", with a mute toggle per
// member instead of removing them outright.
const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({ chatId, characters, mutedParticipantIds, onClose }) => {
  const dispatch = useAppDispatch();
  const muted = mutedParticipantIds || [];

  const handleToggleMute = (id: number) => {
    const next = muted.includes(id) ? muted.filter((m) => m !== id) : [...muted, id];
    dispatch(updateChatMutedParticipants({ chatId, mutedParticipantIds: next }));
  };

  return (
    <ChatSidePanelShell title="Participants" onClose={onClose} closeLabel="Close participants panel">
      <div className="flex-1 overflow-y-auto px-[18px] py-[18px] flex flex-col gap-2">
        <p className="text-[12px] text-subtle -mt-1 mb-1">
          Muted members sit out the round-robin and won't speak up on their own, but can still be brought in with @their name.
        </p>
        {characters.map((char) => {
          const isMuted = muted.includes(char.id);
          return (
            <div
              key={char.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background border border-border/30"
            >
              <CharacterAvatar name={char.name} accent={char.accent} size={36} className={isMuted ? "opacity-40" : undefined} />
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold truncate ${isMuted ? "text-subtle" : "text-foreground"}`}>{char.name}</div>
                {char.relationship && <div className="text-xs text-subtle truncate">{char.relationship}</div>}
              </div>
              <ToggleSwitch
                checked={!isMuted}
                onChange={() => handleToggleMute(char.id)}
                title={isMuted ? `Unmute ${char.name}` : `Mute ${char.name}`}
              />
            </div>
          );
        })}
      </div>
    </ChatSidePanelShell>
  );
};

export default ParticipantsPanel;
