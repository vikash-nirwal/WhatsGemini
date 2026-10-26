import React from "react";
import { cn } from "src/utils/cn";
import { FaTimes } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { TermLink } from "src/components/atoms/TermLink";
import { useColorTheme } from "src/hooks/useColorTheme";

interface ChatSidePanelShellProps {
  title: React.ReactNode;
  // A quiet line under the title, like the panel's scope ("This chat only").
  subtitle?: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
}

// Shared slide-in drawer shell for ChatPage's two side panels (Scene,
// Participants) - was a byte-identical <aside> + header duplicated in both
// ScenePanel and ParticipantsPanel; extracted here so the shape only exists
// once.
export const ChatSidePanelShell: React.FC<ChatSidePanelShellProps> = ({ title, subtitle, onClose, closeLabel, children }) => {
  const { is } = useColorTheme();
  const terminal = is("terminal");
  return (
    // #151, as on the canvas: phones get a full-screen push; up to 1360px a
    // 392px panel over the right of the chat, below the header so its
    // buttons stay reachable; from 1360px a column beside it.
    <aside
      data-slot="side-panel"
      className={cn(
        "fixed inset-y-0 md:top-16 right-0 z-40 w-full md:w-[392px] md:shadow-sheet bg-surface min-[1360px]:static min-[1360px]:z-auto min-[1360px]:h-full min-[1360px]:shadow-none flex-none md:border-l border-border flex flex-col overflow-hidden [&>*:last-child]:min-h-0",
        terminal && "bg-background min-[1360px]:bg-background border-border"
      )}
    >
      <div className={cn("h-16 flex-shrink-0 flex items-center justify-between gap-3 px-[18px] border-b border-border", terminal && "h-[52px]")}>
        {terminal ? (
          <span className="text-[11px] text-muted-foreground lowercase"># {title}</span>
        ) : (
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-semibold leading-[22px]">{title}</span>
            {subtitle && <span className="block truncate text-[12.5px] text-subtle">{subtitle}</span>}
          </span>
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
