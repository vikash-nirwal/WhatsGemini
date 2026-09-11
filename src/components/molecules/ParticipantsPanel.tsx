import React, { useMemo, useState } from "react";
import { FaPlus, FaSearch, FaTimes } from "react-icons/fa";
import { useAppDispatch } from "../../store/hooks";
import { updateChatMutedParticipants, addChatParticipant, removeChatParticipant } from "../../features/chatSlice";
import { Character } from "../../types";
import { CharacterAvatar } from "./CharacterAvatar";
import { ChatSidePanelShell } from "./ChatSidePanelShell";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";

interface ParticipantsPanelProps {
  chatId: number;
  characters: Character[]; // every member of the room, in characterIds order
  allCharacters?: Character[]; // the full character roster - used to offer who's not in the room yet
  mutedParticipantIds?: number[];
  onClose: () => void;
}

// Same slide-in drawer shape as ScenePanel - a room's equivalent surface for
// "who's actually in this conversation right now", with a mute toggle per
// member and an invite picker to pull someone new in. Also doubles as the
// 1:1-chat entry point into becoming a room: with only one member, this is
// just the invite picker with nothing to mute yet.
const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({ chatId, characters, allCharacters, mutedParticipantIds, onClose }) => {
  const dispatch = useAppDispatch();
  const muted = mutedParticipantIds || [];
  const [inviting, setInviting] = useState(false);
  const [search, setSearch] = useState("");

  const handleToggleMute = (id: number) => {
    const next = muted.includes(id) ? muted.filter((m) => m !== id) : [...muted, id];
    dispatch(updateChatMutedParticipants({ chatId, mutedParticipantIds: next }));
  };

  const handleRemove = (id: number) => {
    dispatch(removeChatParticipant({ chatId, characterId: id }));
  };

  const handleInvite = (id: number) => {
    dispatch(addChatParticipant({ chatId, characterId: id }));
    setInviting(false);
    setSearch("");
  };

  const memberIds = useMemo(() => new Set(characters.map((c) => c.id)), [characters]);
  const invitable = useMemo(() => {
    const pool = (allCharacters || []).filter((c) => !memberIds.has(c.id));
    const q = search.trim().toLowerCase();
    return q ? pool.filter((c) => c.name.toLowerCase().includes(q)) : pool;
  }, [allCharacters, memberIds, search]);

  return (
    <ChatSidePanelShell title="Participants" onClose={onClose} closeLabel="Close participants panel">
      <div className="flex-1 overflow-y-auto px-[18px] py-[18px] flex flex-col gap-2">
        {characters.length > 1 && (
          <p className="text-[12px] text-subtle -mt-1 mb-1">
            Muted members sit out the round-robin and won't speak up on their own, but can still be brought in with @their name.
          </p>
        )}
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
              {characters.length > 1 && (
                <ToggleSwitch
                  checked={!isMuted}
                  onChange={() => handleToggleMute(char.id)}
                  title={isMuted ? `Unmute ${char.name}` : `Mute ${char.name}`}
                />
              )}
              {characters.length > 1 && (
                <Button
                  onClick={() => handleRemove(char.id)}
                  variant="ghost"
                  size="icon"
                  className="h-auto w-auto p-1.5 text-subtle hover:text-destructive hover:bg-transparent flex-shrink-0"
                  title={`Remove ${char.name} from this chat`}
                  aria-label={`Remove ${char.name} from this chat`}
                >
                  <FaTimes size={12} />
                </Button>
              )}
            </div>
          );
        })}

        <div className="mt-1">
          {inviting ? (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <FaSearch size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search characters"
                  aria-label="Search characters to invite"
                  className="pl-8 text-[12.5px] h-9 rounded-lg"
                />
              </div>
              <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto">
                {invitable.length === 0 ? (
                  <p className="text-[12.5px] text-subtle px-1 py-2">
                    {search.trim() ? "No characters match." : "Everyone you have is already in this chat."}
                  </p>
                ) : (
                  invitable.map((char) => (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => handleInvite(char.id)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-background border border-border/30 hover:border-primary/50 text-left transition"
                    >
                      <CharacterAvatar name={char.name} accent={char.accent} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate text-foreground">{char.name}</div>
                        {char.relationship && <div className="text-xs text-subtle truncate">{char.relationship}</div>}
                      </div>
                    </button>
                  ))
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setInviting(false); setSearch(""); }} className="self-start text-xs text-subtle">
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setInviting(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border/40 text-subtle text-sm hover:border-primary hover:text-primary transition"
            >
              <FaPlus size={11} /> Invite someone
            </button>
          )}
        </div>
      </div>
    </ChatSidePanelShell>
  );
};

export default ParticipantsPanel;
