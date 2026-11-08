import React from "react";
import { FaPlus, FaTrash } from "react-icons/fa";
import { Select, TextInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { StoryCastMember } from "src/types";
import { makeCastMember } from "src/features/chat/storyScript";

// The story's own people: rename anyone (the script is rewritten on save,
// see applyCastRenames), say who they are, and who plays them. One part
// each for the user and the chat's character, so picking a part for
// someone takes it from whoever had it. In a group chat (#242) each member
// can take one part instead of the chat's character.
type Player = Pick<StoryCastMember, "playedBy" | "playedById">;

// A cast member with a new player, without leftover keys from the old one.
const withPlayer = (c: StoryCastMember, player: Player): StoryCastMember => {
  const { playedBy: _by, playedById: _id, ...rest } = c;
  return { ...rest, ...(player.playedBy ? { playedBy: player.playedBy } : {}), ...(player.playedById != null ? { playedById: player.playedById } : {}) };
};

export const StoryCastEditor = ({
  cast,
  onChange,
  characterName,
  members,
}: {
  cast: StoryCastMember[];
  onChange: (cast: StoryCastMember[]) => void;
  // The chat's character, who can take a part; unset outside 1:1 chats.
  characterName?: string;
  // A group chat's members (#242), who can each take a part.
  members?: { id: number; name: string }[];
}) => {
  const patch = (id: string, change: Partial<StoryCastMember>) => onChange(cast.map((c) => (c.id === id ? { ...c, ...change } : c)));
  const setPlayer = (id: string, player: Player) =>
    onChange(
      cast.map((c) => {
        if (c.id === id) return withPlayer(c, player);
        // Only one person per part.
        if (player.playedBy && c.playedBy === player.playedBy) return withPlayer(c, {});
        if (player.playedById != null && c.playedById === player.playedById) return withPlayer(c, {});
        return c;
      })
    );
  const valueOf = (c: StoryCastMember): string => {
    if (c.playedBy === "user") return "user";
    if (members && c.playedById != null && members.some((m) => m.id === c.playedById)) return `member-${c.playedById}`;
    if (c.playedBy === "character" && characterName) return "character";
    return "ai";
  };
  const playerOf = (value: string): Player => {
    if (value.startsWith("member-")) return { playedById: Number(value.slice(7)) };
    return value === "user" || value === "character" ? { playedBy: value } : {};
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-3" aria-label="Story characters">
        {cast.map((member, i) => (
          <li key={member.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                aria-label={`Name of story character ${i + 1}`}
                value={member.name}
                onChange={(e) => patch(member.id, { name: e.target.value })}
                placeholder="Name"
                className="min-w-[140px] flex-1"
              />
              <Select
                aria-label={`Who plays ${member.name || `story character ${i + 1}`}`}
                value={valueOf(member)}
                onChange={(e) => setPlayer(member.id, playerOf(e.target.value))}
                className="h-9 w-auto gap-2"
              >
                <option value="ai">The AI plays them</option>
                <option value="user">You play them</option>
                {characterName && <option value="character">{characterName} plays them</option>}
                {members?.map((m) => (
                  <option key={m.id} value={`member-${m.id}`}>
                    {m.name} plays them
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(cast.filter((c) => c.id !== member.id))}
                aria-label={`Remove ${member.name || `story character ${i + 1}`}`}
              >
                <FaTrash size={11} />
              </Button>
            </div>
            <TextInput
              aria-label={`About ${member.name || `story character ${i + 1}`}`}
              value={member.about}
              onChange={(e) => patch(member.id, { about: e.target.value })}
              placeholder="Who they are"
              className="text-[13px]"
            />
          </li>
        ))}
      </ul>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...cast, makeCastMember("")])}>
          <FaPlus size={10} /> Add character
        </Button>
      </div>
    </div>
  );
};
