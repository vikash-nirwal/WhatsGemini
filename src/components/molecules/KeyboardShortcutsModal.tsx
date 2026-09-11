import React from "react";
import Modal from "./Modal";

interface ShortcutEntry {
  keys: string[];
  description: string;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? "⌘" : "Ctrl";

const SHORTCUTS: ShortcutEntry[] = [
  { keys: [modKey, "Shift", "O"], description: "Start a new chat" },
  { keys: ["?"], description: "Show this shortcuts list" },
  { keys: ["Enter"], description: "Send message (in the composer)" },
  { keys: ["Shift", "Enter"], description: "New line (in the composer)" },
  { keys: ["Esc"], description: "Close the open dialog" },
];

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="px-2.5 py-1 rounded-md bg-background border border-border/50 border-b-2 text-xs font-mono text-foreground font-medium min-w-[28px] text-center inline-block">
    {children}
  </kbd>
);

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts">
    <div className="flex flex-col">
      {SHORTCUTS.map((shortcut, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 py-2.5 border-b border-border last:border-none"
        >
          <span className="text-sm text-muted-foreground">{shortcut.description}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {shortcut.keys.map((key, ki) => (
              <React.Fragment key={ki}>
                {ki > 0 && <span className="text-ink-faint text-xs">+</span>}
                <Kbd>{key}</Kbd>
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Modal>
);

export default KeyboardShortcutsModal;
