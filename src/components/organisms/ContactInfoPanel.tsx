import React from "react";
import { useNavigate } from "react-router-dom";
import { FaEdit, FaImages, FaStar } from "react-icons/fa";
import { ChatSidePanelShell } from "src/components/molecules/ChatSidePanelShell";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { avatarOf } from "src/features/character/profileChanges";
import { liveStatuses } from "src/features/character/statusUpdates";
import { formatRelativeTime } from "src/utils/formatRelativeTime";
import { ScenePanelTabProps } from "./scene-panel/types";
import ChatTab from "./scene-panel/ChatTab";
import MemoryTab from "./scene-panel/MemoryTab";

// Contact info (#151), as on the revamp canvas: the character everywhere,
// not just this chat - who they are at the top, then their life between
// messages, their inner life, how you two are, their memory and their look.
// Opened from the chat header's avatar and name.
const ContactInfoPanel: React.FC<ScenePanelTabProps> = (props) => {
  const { character } = props;
  const navigate = useNavigate();
  if (!character) return null;
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
        </section>
        <div className="flex flex-col gap-[22px] border-t border-border px-[18px] py-[18px]">
          <ChatTab {...props} groups={["alive", "inner", "texting", "relationship", "look"]} />
          <MemoryTab {...props} />
        </div>
      </div>
    </ChatSidePanelShell>
  );
};

export default ContactInfoPanel;
