import React from "react";
import { FaUserSecret } from "react-icons/fa";
import { useModal } from "src/contexts/ModalContext";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { updateCharacter } from "src/features/characterSlice";
import { addChatNotice } from "src/features/chatSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { secretsYouKnowAbout, toldFact, toldOnFact } from "src/features/world/secrets";
import { logToTimeline } from "src/features/world/timeline";
import { Character } from "src/types";

// Secrets between characters (#170), in the contact info of the person
// they're kept from: what you've heard, and whether to tell them. Telling
// is for good - they'll know, and so will the one who kept it.
export const SecretsYouKnow = ({ character }: { character: Character }) => {
  const dispatch = useAppDispatch();
  const { showConfirm } = useModal();
  const characters = useAppSelector((state) => state.character.characters);
  const chats = useAppSelector((state) => state.chat.chats);
  const worlds = useAppSelector((state) => state.world.worlds);
  const persona = useAppSelector(selectActivePersona);
  const known = secretsYouKnowAbout(character, characters);
  if (!known.length) return null;
  const userName = persona?.name?.trim() || "You";
  const tell = async (keeper: Character, id: string, text: string) => {
    if (!(await showConfirm(`Tell ${character.name}?`, `${character.name} will know what ${keeper.name} kept from them, and ${keeper.name} will find out you told.`))) return;
    const now = Date.now();
    await dispatch(updateCharacter({ ...keeper, memory: [...(keeper.memory || []), toldOnFact(userName, character.name)], keptSecrets: (keeper.keptSecrets || []).map((s) => (s.id === id ? { ...s, toldAt: now } : s)) }));
    const fresh = characters.find((c) => c.id === character.id) || character;
    await dispatch(updateCharacter({ ...fresh, memory: [...(fresh.memory || []), toldFact(userName, keeper.name, text)] }));
    const chat = chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === character.id && !c.whatIf);
    if (chat?.id) await dispatch(addChatNotice({ chatId: chat.id, text: `You told ${character.name} what ${keeper.name} was hiding` }));
    const world = worlds.find((w) => w.id === character.worldId);
    void logToTimeline(world ? world.id : null, { kind: "you", text: `You told ${character.name} what ${keeper.name} was hiding`, characterIds: [character.id, keeper.id], at: now }, world?.storyTime);
  };
  return (
    <section aria-label="Secrets you know" className="flex flex-col gap-2">
      <h3 className="text-[15px] font-bold text-foreground">Secrets you know</h3>
      {known.map(({ keeper, secret }) => (
        <div key={secret.id} className="flex items-start gap-3 rounded-card bg-raised p-3 ring-1 ring-inset ring-border">
          <FaUserSecret size={14} aria-hidden className="mt-0.5 flex-none text-primary-text" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-subtle">{keeper.name} is keeping this from {character.name}{secret.heardFrom != null ? ` · heard from ${characters.find((c) => c.id === secret.heardFrom)?.name || "someone"}` : ""}</div>
            <p className="text-[13.5px] leading-[19px] text-foreground">{secret.text}</p>
          </div>
          <button type="button" onClick={() => void tell(keeper, secret.id, secret.text)} className="flex-none text-[13px] font-bold text-primary-text">Tell {character.name}</button>
        </div>
      ))}
    </section>
  );
};

export default SecretsYouKnow;
