import React from "react";
import Modal from "src/components/molecules/Modal";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";

interface PortraitPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterName?: string;
  accent?: [string, string];
  emotion?: string;
  imageSrc?: string;
}

// The header avatar's "view current portrait" popup - split out of
// ChatPage.tsx (which had this, the auto-reply modal, and the persona
// modal all inlined) purely for that file's readability; none of these are
// large or pull in heavy dependencies, so unlike the wizard steps in
// CharacterEditorPage there's no lazy-loading payoff worth chasing here.
const PortraitPreviewModal: React.FC<PortraitPreviewModalProps> = ({ isOpen, onClose, characterName, accent, emotion, imageSrc }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={characterName || "Portrait"}
    subtitle={emotion ? `Current mood: ${emotion}` : undefined}
  >
    <div className="w-full max-w-[280px] mx-auto aspect-[3/4] rounded-xl overflow-hidden bg-muted">
      {imageSrc ? (
        <DisplayImage
          srcContext={imageSrc}
          alt={`${characterName || "Character"} portrait`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <CharacterAvatar name={characterName} accent={accent} size={120} />
        </div>
      )}
    </div>
  </Modal>
);

export default PortraitPreviewModal;
