import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { addChat } from "src/features/chatSlice";
import { statusReplyDraft } from "src/features/character/statusUpdates";
import { Character, CharacterStatus, Chat } from "src/types";

// Replying to a status (#8): the character's 1:1 chat (made if needed), with
// the status quoted in the composer. `after` runs once it's open.
export const useStatusReply = (after?: () => void) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const chats = useAppSelector((state) => state.chat.chats);
  return useCallback(async (character: Character, status: Pick<CharacterStatus, "text">) => {
    const draft = statusReplyDraft(status as CharacterStatus);
    const existing = chats.find((chat: Chat) => chat.characterIds?.length === 1 && chat.characterIds[0] === character.id);
    const id = existing?.id ?? ((await dispatch(addChat({ title: character.name, characterIds: [character.id] }))).payload as Chat | undefined)?.id;
    if (id != null) {
      navigate(`/chat/${id}`, { state: { draft } });
      after?.();
    }
  }, [chats, dispatch, navigate, after]);
};
