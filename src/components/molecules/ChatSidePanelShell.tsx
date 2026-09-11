import React from "react";
import { FaTimes } from "react-icons/fa";
import { Button } from "src/components/atoms/button";

interface ChatSidePanelShellProps {
  title: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
}

// Shared slide-in drawer shell for ChatPage's two side panels (Scene,
// Participants) - was a byte-identical <aside> + header duplicated in both
// ScenePanel and ParticipantsPanel; extracted here so the shape only exists
// once.
export const ChatSidePanelShell: React.FC<ChatSidePanelShellProps> = ({ title, onClose, closeLabel, children }) => (
  <aside className="w-[300px] flex-none border-l border-border/40 bg-card/70 backdrop-blur-md flex flex-col overflow-hidden">
    <div className="h-[52px] flex-shrink-0 flex items-center justify-between px-[18px] border-b border-border/40">
      <span className="font-semibold text-sm">{title}</span>
      <Button
        onClick={onClose}
        variant="ghost"
        size="icon"
        className="h-auto w-auto p-1 text-subtle hover:text-foreground hover:bg-transparent"
        title={closeLabel}
        aria-label={closeLabel}
      >
        <FaTimes size={14} />
      </Button>
    </div>
    {children}
  </aside>
);
