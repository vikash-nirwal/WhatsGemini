import { useState } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { fetchCharacterById, updateCharacter } from "src/features/characterSlice";
import { generateAssistText } from "src/features/aiSlice";
import { buildCommentReplyPrompt, cleanCommentReply, newCommentId, toggleLike, updateStatus, withComment } from "src/features/character/statusFeed";
import { Character, CharacterStatus } from "src/types";
import { useWorldCharacters } from "src/hooks/useWorld";

// Liking and commenting on a character's status (#85), shared by the feed
// and the status viewer (#152). A comment gets the poster's answer.
export const useStatusActions = () => {
  const dispatch = useAppDispatch();
  const characters = useWorldCharacters();
  const personas = useAppSelector((state) => state.settings.personas);
  const activePersonaId = useAppSelector((state) => state.settings.activePersonaId);
  const userName = (personas.find((p) => p.id === activePersonaId) || personas[0])?.name?.trim() || "You";
  const [answering, setAnswering] = useState<string | null>(null);
  const nameOf = (from: number | "you") => (from === "you" ? "You" : characters.find((c) => c.id === from)?.name || "Someone");

  // Always change the latest copy of the poster, so a like and a comment
  // (or the poster's answer) never overwrite each other.
  const change = async (posterId: number, statusId: string, fn: (s: CharacterStatus) => CharacterStatus) => {
    const latest = characters.find((c) => c.id === posterId);
    if (latest) await dispatch(updateCharacter({ ...latest, statuses: updateStatus(latest.statuses, statusId, fn) }));
  };

  const like = (poster: Character, status: CharacterStatus) => change(poster.id, status.id, toggleLike);

  const comment = async (poster: Character, status: CharacterStatus, text: string) => {
    if (!text.trim()) return;
    await change(poster.id, status.id, (s) => withComment(s, { id: newCommentId(), from: "you", text: text.trim(), at: Date.now() }));
    setAnswering(status.id);
    try {
      const reply = cleanCommentReply(await dispatch(generateAssistText({ instruction: buildCommentReplyPrompt(poster, status, text.trim(), userName), background: true })).unwrap());
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

  const likers = (status: CharacterStatus) => {
    const names = (status.likes || []).map((id) => nameOf(id));
    if (status.likedByYou) names.unshift("you");
    return names;
  };

  return { like, comment, answering, nameOf, likers };
};
