import React from "react";
import { FaCheck } from "react-icons/fa";
import Modal from "src/components/molecules/Modal";
import { cn } from "../../utils/cn";
import { UserProfile } from "../../types";

interface PersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterName?: string;
  personas: UserProfile[];
  selectedPersonaId?: string;
  globalDefaultPersonaName?: string;
  onSelectPersona: (personaId?: string) => void;
}

// The per-chat persona picker popup - see PortraitPreviewModal.tsx for why
// this is a separate file (readability, not a lazy-loading win).
const PersonaModal: React.FC<PersonaModalProps> = ({
  isOpen,
  onClose,
  characterName,
  personas,
  selectedPersonaId,
  globalDefaultPersonaName,
  onSelectPersona,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Persona for this chat">
    <p className="text-xs text-ink-faint -mt-1 mb-1">
      Choose which of your personas {characterName || "this character"} sees you as, just in this chat.
    </p>
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => onSelectPersona(undefined)}
        className={cn(
          "flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-sm transition",
          !selectedPersonaId ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-hover text-foreground"
        )}
      >
        <span>Use global default{globalDefaultPersonaName ? ` (${globalDefaultPersonaName})` : ""}</span>
        {!selectedPersonaId && <FaCheck size={12} className="text-primary flex-shrink-0" />}
      </button>
      {personas.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelectPersona(p.id)}
          className={cn(
            "flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left text-sm transition",
            selectedPersonaId === p.id ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-hover text-foreground"
          )}
        >
          <span className="truncate">{p.name || "(unnamed persona)"}</span>
          {selectedPersonaId === p.id && <FaCheck size={12} className="text-primary flex-shrink-0" />}
        </button>
      ))}
    </div>
  </Modal>
);

export default PersonaModal;
