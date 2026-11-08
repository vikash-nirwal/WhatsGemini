import React from "react";
import { FaPlus, FaTrash } from "react-icons/fa";
import { Select, TextInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { StoryCastMember } from "src/types";
import { makeCastMember } from "src/features/chat/storyScript";

// The story's own people: rename anyone (the script is rewritten on save,
// see applyCastRenames), say who they are, and who plays them. One part
// each for the user and the chat's character, so picking a part for
// someone takes it from whoever had it.
export const StoryCastEditor = ({
  cast,
  onChange,
  characterName,
}: {
  cast: StoryCastMember[];
  onChange: (cast: StoryCastMember[]) => void;
  // The chat's character, who can take a part; unset outside 1:1 chats.
  characterName?: string;
}) => {
  const patch = (id: string, change: Partial<StoryCastMember>) =>
    onChange(
      cast.map((c) => {
        if (c.id === id) return { ...c, ...change };
        // Only one person per part.
        if (change.playedBy && c.playedBy === change.playedBy) return { ...c, playedBy: undefined };
        return c;
      })
    );

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
                value={member.playedBy || "ai"}
                onChange={(e) => patch(member.id, { playedBy: e.target.value === "ai" ? undefined : (e.target.value as StoryCastMember["playedBy"]) })}
                className="h-9 w-auto gap-2"
              >
                <option value="ai">The AI plays them</option>
                <option value="user">You play them</option>
                {characterName && <option value="character">{characterName} plays them</option>}
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
