import React, { useEffect, useState, useCallback } from "react";
import { FaPlus, FaTimes, FaPencilAlt, FaCheck } from "react-icons/fa";
import { AI, LS_INITIAL_MESSAGES, YOU } from "../../utils/constants";
import { TextArea } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { TermLink } from "src/components/atoms/TermLink";
import { useColorTheme } from "src/hooks/useColorTheme";

interface InitialMessage {
  role: string;
  message: string;
}

interface InitialMessagesProps {
  onSave?: () => void;
}

const InitialMessages: React.FC<InitialMessagesProps> = ({ onSave }) => {
  // Safely retrieve saved messages from localStorage
  const getSavedMessages = (): InitialMessage[] => {
    try {
      const saved = localStorage.getItem(LS_INITIAL_MESSAGES);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error("Error parsing initial messages from localStorage:", error);
      return [];
    }
  };

  const [initialMessages, setInitialMessages] = useState<InitialMessage[]>(getSavedMessages);
  // Which row is expanded for editing - role is implied by position (alternating
  // You/Model, see handleAddMessage) rather than user-editable, matching the
  // redesign's collapsed one-line-per-message list.
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const { is } = useColorTheme();
  const terminal = is("terminal");
  const isFirstRender = React.useRef(true);

  // Save messages to localStorage on state change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const nonEmptyMessages = initialMessages.filter((msg) => msg.message.trim() !== "");
    if (nonEmptyMessages.length && nonEmptyMessages[0].role !== YOU) {
      setInitialMessages((prevMessages) => [
        { ...prevMessages[0], role: YOU },
        ...prevMessages.slice(1),
      ]);
      return; // Re-run effect after state update
    }

    const timeoutId = setTimeout(() => {
      localStorage.setItem(LS_INITIAL_MESSAGES, JSON.stringify(nonEmptyMessages));
      if (onSave) onSave();
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [initialMessages, onSave]);

  // Handle input change
  const handleChange = useCallback((value: string, idx: number, key: keyof InitialMessage) => {
    setInitialMessages((prevMessages) =>
      prevMessages.map((msg, i) => (i === idx ? { ...msg, [key]: value } : msg))
    );
  }, []);

  // Add a new message, opened straight into edit mode
  const handleAddMessage = useCallback(() => {
    setInitialMessages((prevMessages) => [
      ...prevMessages,
      {
        role: prevMessages.length % 2 === 0 ? YOU : AI,
        message: "",
      },
    ]);
    setEditingIdx(initialMessages.length);
  }, [initialMessages.length]);

  // Delete a message
  const handleDeleteMessage = useCallback((idx: number) => {
    setInitialMessages((prevMessages) => prevMessages.filter((_, i) => i !== idx));
    setEditingIdx(null);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {initialMessages.map((msg, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-background border border-input"
        >
          {editingIdx === idx ? (
            <>
              <TextArea
                autoFocus
                value={msg.message}
                onChange={(e) => handleChange(e.target.value, idx, "message")}
                placeholder="Enter a message that will be sent as the first message in any new chat..."
                className="flex-1 font-serif min-h-[40px]"
              />
              {terminal ? (
                <TermLink label="done" onClick={() => setEditingIdx(null)} aria-label="Done editing" className="flex-none" />
              ) : (
              <Button
                onClick={() => setEditingIdx(null)}
                variant="ghost"
                size="icon"
                title="Done"
                aria-label="Done editing"
                className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground flex-none"
              >
                <FaCheck size={12} />
              </Button>
              )}
            </>
          ) : (
            <>
              <span className="flex-1 min-w-0 font-serif text-sm text-foreground truncate">
                {msg.message || <span className="text-subtle italic">Empty message</span>}
              </span>
              {terminal ? (
                <TermLink label="edit" onClick={() => setEditingIdx(idx)} aria-label="Edit message" className="flex-none" />
              ) : (
              <Button
                onClick={() => setEditingIdx(idx)}
                variant="ghost"
                size="icon"
                title="Edit"
                aria-label="Edit message"
                className="h-7 w-7 rounded-md text-subtle hover:text-foreground flex-none"
              >
                <FaPencilAlt size={12} />
              </Button>
              )}
            </>
          )}
          {initialMessages.length > 1 && terminal && (
            <TermLink label="x" onClick={() => handleDeleteMessage(idx)} aria-label="Delete message" className="flex-none text-muted-foreground" />
          )}
          {initialMessages.length > 1 && !terminal && (
            <Button
              onClick={() => handleDeleteMessage(idx)}
              variant="ghost"
              size="icon"
              title="Delete"
              aria-label="Delete message"
              className="h-7 w-7 rounded-md text-subtle hover:text-destructive hover:bg-destructive/10 flex-none"
            >
              <FaTimes size={12} />
            </Button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={handleAddMessage}
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-dashed border-border text-subtle hover:text-primary hover:border-primary transition-colors text-sm"
      >
        {terminal ? <span className="text-[11px] font-bold text-ring">[+ add message]</span> : <><FaPlus size={12} /> Add an opening line</>}
      </button>
    </div>
  );
};

export default InitialMessages;
