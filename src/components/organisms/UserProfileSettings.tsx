import React, { useRef, useState } from 'react';
import { FaUser, FaPlus, FaTrash, FaCheckCircle, FaCamera } from 'react-icons/fa';
import { UserProfile } from '../../types';
import { TextInput, TextArea } from "src/components/molecules/form-controls";
import { Button } from 'src/components/atoms/button';
import { SettingsCard } from 'src/components/molecules/settings-card';
import { CharacterAvatar } from 'src/components/molecules/CharacterAvatar';
import AvatarCropDialog from './AvatarCropDialog';
import { cn } from '../../utils/cn';
import { useColorTheme } from '../../hooks/useColorTheme';

interface UserProfileSettingsProps {
  personas: UserProfile[];
  activePersonaId: string;
  onAddPersona: () => void;
  onUpdatePersona: (persona: UserProfile) => void;
  onDeletePersona: (id: string) => void;
  onSetActivePersonaId: (id: string) => void;
}

// Persona manager: lists every saved persona ("Myself", "Elven Mage", ...),
// lets you edit each one's fields directly (no separate edit mode - these are
// lightweight objects), mark one as the global active persona, add new ones,
// and delete ones you no longer need. The active persona is what characters
// see by default; a chat can still override it (see the chat header's
// Persona action) via Chat.personaId.
const UserProfileSettings: React.FC<UserProfileSettingsProps> = ({
  personas,
  activePersonaId,
  onAddPersona,
  onUpdatePersona,
  onDeletePersona,
  onSetActivePersonaId,
}) => {
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");

  // Single shared file input + crop dialog for every persona card, rather
  // than one of each per card - `pendingPersonaId` tracks which persona a
  // pick/crop in flight is actually for, same one-hidden-input pattern
  // MessageInput's file import button already uses.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPersonaId, setPendingPersonaId] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const handlePickPhoto = (personaId: string) => {
    setPendingPersonaId(personaId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCropImageSrc(URL.createObjectURL(file));
  };

  const handleCropped = (localRef: string) => {
    const persona = personas.find((p) => p.id === pendingPersonaId);
    if (persona) onUpdatePersona({ ...persona, avatar: localRef });
    setCropImageSrc(null);
    setPendingPersonaId(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard className="p-5">
        <div className="flex gap-5 items-center">
          <div className="w-[72px] h-[72px] rounded-full bg-muted grid place-items-center text-muted-foreground flex-none">
            <FaUser size={26} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px] text-foreground">Your personas</div>
            <div className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
              How characters see and address you. The active persona is shared with every character by default -
              switch personas here, or override one just for a specific chat from that chat's header.
            </div>
          </div>
        </div>
      </SettingsCard>

      {personas.length === 0 && (
        <div
          className={cn(
            "rounded-xl p-6 text-center text-sm text-muted-foreground",
            neumorphic ? "surface-sunken" : "border border-dashed border-border/60"
          )}
        >
          No personas yet. Add one so characters know who they're talking to.
        </div>
      )}

      {personas.map((persona) => {
        const isActive = persona.id === activePersonaId;
        return (
          <SettingsCard key={persona.id} className="p-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onSetActivePersonaId(persona.id)}
                  disabled={isActive}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition",
                    isActive
                      ? is("aurora")
                        ? "cta-surface text-primary-foreground cursor-default"
                        : "bg-primary/15 text-primary cursor-default"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  title={isActive ? "This is your active persona" : "Make this your active persona"}
                >
                  <FaCheckCircle size={11} />
                  {isActive ? "Active" : "Set active"}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onDeletePersona(persona.id)}
                  className="h-7 w-7 text-subtle hover:bg-destructive/10 hover:text-destructive"
                  title="Delete this persona"
                  aria-label="Delete this persona"
                >
                  <FaTrash size={11} />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <CharacterAvatar name={persona.name || "?"} imageSrc={persona.avatar} size={56} />
                <div className="flex flex-col gap-1.5 items-start">
                  <Button
                    type="button"
                    variant="panel"
                    size="sm"
                    onClick={() => handlePickPhoto(persona.id)}
                    className="h-auto py-1.5 px-2.5 text-xs font-medium"
                  >
                    <FaCamera size={11} /> {persona.avatar ? "Change photo" : "Add photo"}
                  </Button>
                  {persona.avatar && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onUpdatePersona({ ...persona, avatar: undefined })}
                      className="h-auto py-1 px-2.5 text-xs text-subtle hover:text-destructive"
                    >
                      Remove photo
                    </Button>
                  )}
                </div>
              </div>

              <TextInput
                type="text"
                placeholder="Persona name (e.g. Myself, Elven Mage)"
                value={persona.name}
                onChange={(e) => onUpdatePersona({ ...persona, name: e.target.value })}
              />
              <TextArea
                placeholder="About you - hobbies, communication style, anything a character should know (Optional)"
                value={persona.bio}
                onChange={(e) => onUpdatePersona({ ...persona, bio: e.target.value })}
                className="resize-none"
              />
              <TextArea
                placeholder="Appearance - given to image-capable models to keep generated looks consistent (Optional)"
                value={persona.appearance || ''}
                onChange={(e) => onUpdatePersona({ ...persona, appearance: e.target.value })}
                className="resize-none"
              />
              <TextArea
                placeholder="Backstory - background a character might reference or ask about (Optional)"
                value={persona.backstory || ''}
                onChange={(e) => onUpdatePersona({ ...persona, backstory: e.target.value })}
                className="resize-none"
              />
            </div>
          </SettingsCard>
        );
      })}

      <Button
        type="button"
        variant="panel"
        onClick={onAddPersona}
        className="h-auto self-start px-4 py-2.5 border border-border hover:border-primary font-medium"
      >
        <FaPlus size={12} /> Add persona
      </Button>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: "none" }}
      />
      {cropImageSrc && (
        <AvatarCropDialog
          open={Boolean(cropImageSrc)}
          onClose={() => {
            setCropImageSrc(null);
            setPendingPersonaId(null);
          }}
          imageSrc={cropImageSrc}
          onCropped={handleCropped}
          exportSize={{ width: 256, height: 256 }}
        />
      )}
    </div>
  );
};

export default UserProfileSettings;
