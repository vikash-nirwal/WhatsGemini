import React, { useState } from "react";
import { avatarOf } from "../../features/character/profileChanges";
import { FaHeart, FaRegHeart } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";
import { Input } from "src/components/atoms/input";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { fetchCharacterById, updateCharacter } from "src/features/characterSlice";
import { generateAssistText } from "src/features/aiSlice";
import { buildCommentReplyPrompt, cleanCommentReply, newCommentId, toggleLike, updateStatus, withComment } from "src/features/character/statusFeed";
import { formatRelativeTime } from "src/utils/formatRelativeTime";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { NsfwBlur } from "src/components/molecules/NsfwBlur";
import { isNsfwCharacter } from "src/features/character/contentRating";
import { Character, CharacterStatus } from "src/types";

interface StatusFeedProps {
  items: { character: Character; status: CharacterStatus }[];
  onReply: (character: Character, status: CharacterStatus) => void;
  showPoster?: boolean; // the whole feed names each post's author; one character's statuses don't need to
}

// Character feed (#85): statuses with their likes and comments. You can
// like one, comment (the poster answers), or reply in private, which opens
// the chat with the status quoted.
export const StatusFeed: React.FC<StatusFeedProps> = ({ items, onReply, showPoster = false }) => {
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.character.characters);
  const personas = useAppSelector((state) => state.settings.personas);
  const activePersonaId = useAppSelector((state) => state.settings.activePersonaId);
  const userName = (personas.find((p) => p.id === activePersonaId) || personas[0])?.name?.trim() || "You";
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [answering, setAnswering] = useState<string | null>(null);
  const blurMedia = useAppSelector((state) => state.settings.privacy.blurNsfwMedia);
  const nameOf = (from: number | "you") => (from === "you" ? "You" : characters.find((c) => c.id === from)?.name || "Someone");

  // Always change the latest copy of the poster, so a like and a comment
  // (or the poster's answer) never overwrite each other.
  const change = async (posterId: number, statusId: string, fn: (s: CharacterStatus) => CharacterStatus) => {
    const latest = characters.find((c) => c.id === posterId);
    if (latest) await dispatch(updateCharacter({ ...latest, statuses: updateStatus(latest.statuses, statusId, fn) }));
  };

  const comment = async (poster: Character, status: CharacterStatus) => {
    const text = (drafts[status.id] || "").trim();
    if (!text) return;
    setDrafts((d) => ({ ...d, [status.id]: "" }));
    await change(poster.id, status.id, (s) => withComment(s, { id: newCommentId(), from: "you", text, at: Date.now() }));
    setAnswering(status.id);
    try {
      const reply = cleanCommentReply(await dispatch(generateAssistText({ instruction: buildCommentReplyPrompt(poster, status, text, userName), background: true })).unwrap());
      if (reply) {
        // Re-read: the store has your comment by now.
        const base: Character = (await dispatch(fetchCharacterById(poster.id)).unwrap().catch(() => poster)) || poster;
        await dispatch(updateCharacter({ ...base, statuses: updateStatus(base.statuses, status.id, (s) => withComment(s, { id: newCommentId(), from: poster.id, text: reply, at: Date.now() })) }));
      }
    } catch (err) {
      console.warn("Status comment reply failed (non-fatal):", err);
    } finally {
      setAnswering(null);
    }
  };

  return (
    <ol className="flex flex-col gap-3" aria-label="Statuses">
      {items.map(({ character, status }) => {
        const likers = (status.likes || []).map((id) => nameOf(id));
        if (status.likedByYou) likers.unshift("you");
        return (
          <li key={status.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3" aria-label={`${character.name}: ${status.text}`}>
            {showPoster && (
              <div className="flex items-center gap-2">
                <CharacterAvatar name={character.name} accent={character.accent} imageSrc={avatarOf(character)} size={26} />
                <span className="text-sm font-semibold text-foreground">{character.name}</span>
              </div>
            )}
            {status.image && (
              <NsfwBlur active={blurMedia && isNsfwCharacter(character)} className="w-full">
                <DisplayImage srcContext={status.image} alt={`${character.name}'s status photo`} className="max-h-80 w-full rounded-lg object-cover" />
              </NsfwBlur>
            )}
            <p className="text-[15px] text-foreground">{status.text}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-subtle">{formatRelativeTime(status.createdAt)}</span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={Boolean(status.likedByYou)}
                  aria-label={status.likedByYou ? "Unlike" : "Like"}
                  onClick={() => change(character.id, status.id, toggleLike)}
                  className={cn("h-8 px-2", status.likedByYou ? "text-primary" : "text-muted-foreground")}
                >
                  {status.likedByYou ? <FaHeart size={13} /> : <FaRegHeart size={13} />}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onReply(character, status)}>
                  Reply
                </Button>
              </div>
            </div>
            {likers.length > 0 && <p className="text-xs text-muted-foreground" data-slot="status-likes">♥ Liked by {likers.join(", ")}</p>}
            {(status.comments || []).length > 0 && (
              <ul className="flex flex-col gap-1 border-t border-border/50 pt-2" aria-label="Comments">
                {status.comments!.map((c) => (
                  <li key={c.id} className="text-[13px] text-foreground">
                    <span className="font-semibold">{nameOf(c.from)}</span> {c.text}
                  </li>
                ))}
              </ul>
            )}
            {answering === status.id && <p className="text-xs text-subtle">{character.name} is replying...</p>}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                comment(character, status);
              }}
            >
              <Input
                aria-label={`Comment on ${character.name}'s status`}
                value={drafts[status.id] || ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [status.id]: e.target.value }))}
                placeholder="Add a comment"
                className="h-8 text-[13px]"
              />
              <Button type="submit" size="sm" disabled={!(drafts[status.id] || "").trim()}>
                Post
              </Button>
            </form>
          </li>
        );
      })}
    </ol>
  );
};
