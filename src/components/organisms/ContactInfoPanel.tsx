import React from "react";
import { useNavigate } from "react-router-dom";
import { FaBan, FaEdit, FaImages, FaStar } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { useModal } from "src/contexts/ModalContext";
import { setBlocked } from "src/features/chatSlice";
import { blockedByThem, blockedByYou } from "src/features/chat/blocking";
import { ChatSidePanelShell } from "src/components/molecules/ChatSidePanelShell";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { avatarOf } from "src/features/character/profileChanges";
import { liveStatuses } from "src/features/character/statusUpdates";
import { formatRelativeTime } from "src/utils/formatRelativeTime";
import { ScenePanelTabProps } from "./scene-panel/types";
import ChatTab from "./scene-panel/ChatTab";
import MemoryTab from "./scene-panel/MemoryTab";
import RelationshipsSection from "./RelationshipsSection";
import PointsSection from "./PointsSection";
import { featureOn } from "src/features/world/worldPrefs";
import SecretsYouKnow from "./SecretsYouKnow";

// Contact info (#151), as on the revamp canvas: the character everywhere,
// not just this chat - who they are at the top, then their life between
// messages, their inner life, how you two are, their memory and their look.
// Opened from the chat header's avatar and name.
const ContactInfoPanel: React.FC<ScenePanelTabProps> = (props) => {
  const { character } = props;
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { showConfirm } = useModal();
  const chat = useAppSelector((state) => state.chat.chats.find((c) => c.id === props.chatId));
  if (!character) return null;
  // Blocking (#133), at the bottom like a messaging app's contact page.
  const toggleBlock = async () => {
    if (blockedByYou(chat)) {
      void dispatch(setBlocked({ chatId: props.chatId, blocked: null, notice: `You unblocked ${character.name}` }));
      return;
    }
    const confirmed = await showConfirm(`Block ${character.name}?`, `${character.name} can't text you, and their statuses stop reaching you. They aren't told, but friends you share may notice and bring it up.`);
    if (confirmed) void dispatch(setBlocked({ chatId: props.chatId, blocked: { by: "you", at: Date.now() }, notice: `You blocked ${character.name}` }));
  };
  const status = liveStatuses(character, Date.now()).slice(-1)[0];
  const actions = [
    { label: "Edit", icon: FaEdit, onClick: () => navigate(`/characters/${character.id}/edit`) },
    { label: "Photos", icon: FaImages, onClick: () => navigate(`/characters/${character.id}/gallery`) },
    { label: "Starred", icon: FaStar, onClick: () => navigate("/starred") },
  ];

  return (
    <ChatSidePanelShell title="Contact info" subtitle={`${character.name}, everywhere`} onClose={props.onClose} closeLabel="Close contact info">
      <div className="flex-1 overflow-y-auto">
        <section aria-label={`About ${character.name}`} className="flex flex-col items-center gap-2 px-6 pb-5 pt-6 text-center">
          <CharacterAvatar name={character.name} accent={character.accent} imageSrc={avatarOf(character)} size={96} />
          <h2 className="mt-1 text-[22px] font-bold leading-7 text-foreground">{character.name}</h2>
          {(character.about || character.description) && (
            <p className="line-clamp-3 max-w-[300px] text-[13.5px] leading-[19px] text-muted-foreground">{character.about || character.description}</p>
          )}
          {character.relationship && (
            <span className="rounded-full bg-primary/[0.14] px-2.5 py-0.5 text-[12px] font-semibold text-primary-text">{character.relationship}</span>
          )}
          <div className="mt-2 grid w-full grid-cols-3 gap-2">
            {actions.map(({ label, icon: Icon, onClick }) => (
              <button key={label} type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-card bg-raised py-2.5 text-[12.5px] font-semibold text-foreground ring-1 ring-inset ring-border hover:ring-primary/50">
                <Icon size={15} aria-hidden className="text-primary-text" />
                {label}
              </button>
            ))}
          </div>
          {status && (
            <div className="mt-2 w-full rounded-card bg-raised px-3.5 py-2.5 text-left ring-1 ring-inset ring-border">
              <div className="text-[12px] font-semibold text-subtle">Status · {formatRelativeTime(status.createdAt)}</div>
              <div className="mt-0.5 line-clamp-2 text-[13.5px] text-foreground">{status.text || "Photo"}</div>
            </div>
          )}
          {/* Goals (#208): what they're after this week, while the switch is on. */}
          {character.goal && featureOn(character.worldId, "goals") && (
            <div data-slot="goal" className="mt-2 w-full rounded-card bg-raised px-3.5 py-2.5 text-left ring-1 ring-inset ring-border">
              <div className="text-[12px] font-semibold text-subtle">Wants this week</div>
              <div className="mt-0.5 text-[13.5px] text-foreground">{character.goal.text}</div>
              {character.goal.progress && <div className="mt-0.5 text-[12.5px] text-muted-foreground">So far: {character.goal.progress}</div>}
            </div>
          )}
        </section>
        <div className="flex flex-col gap-[22px] border-t border-border px-[18px] py-[18px]">
          <ChatTab {...props} groups={["alive", "inner", "texting", "relationship", "look"]} />
          <RelationshipsSection character={character} />
          <PointsSection character={character} />
          <SecretsYouKnow character={character} />
          <MemoryTab {...props} />
          {!blockedByThem(chat) && (
            <button type="button" onClick={() => void toggleBlock()} className="flex min-h-12 items-center gap-3 rounded-card bg-raised px-4 text-left text-[14.5px] font-semibold text-destructive ring-1 ring-inset ring-border">
              <FaBan size={15} aria-hidden />
              {blockedByYou(chat) ? `Unblock ${character.name}` : `Block ${character.name}`}
            </button>
          )}
        </div>
      </div>
    </ChatSidePanelShell>
  );
};

export default ContactInfoPanel;
