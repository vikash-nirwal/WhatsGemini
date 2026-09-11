import React from "react";
import { cn } from "src/utils/cn";
import { FaTimes } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { TermLink } from "src/components/atoms/TermLink";
import { useColorTheme } from "src/hooks/useColorTheme";

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
export const ChatSidePanelShell: React.FC<ChatSidePanelShellProps> = ({ title, onClose, closeLabel, children }) => {
  const { is } = useColorTheme();
  const terminal = is("terminal");
  return (
    <aside className={cn("w-[300px] flex-none border-l border-border/40 bg-card/70 backdrop-blur-md flex flex-col overflow-hidden", terminal && "bg-background border-border")}>
      <div className={cn("h-[52px] flex-shrink-0 flex items-center justify-between px-[18px] border-b border-border/40", terminal && "border-border")}>
        {terminal ? (
          <span className="text-[11px] text-muted-foreground lowercase"># {title}</span>
        ) : (
          <span className="font-semibold text-sm">{title}</span>
        )}
        {terminal ? (
          <TermLink label="x" onClick={onClose} title={closeLabel} aria-label={closeLabel} />
        ) : (
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
        )}
      </div>
      {children}
    </aside>
  );
};
