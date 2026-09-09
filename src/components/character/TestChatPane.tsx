import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { generateAIResponse } from "../../features/aiSlice";
import { selectActivePersona } from "../../features/settingsSlice";
import { buildTurnContext } from "../../features/ai/utils/promptComposition";
import { Character, LoreEntry, Message } from "../../types";
import { YOU, AI } from "../../utils/constants";
import { CharacterAvatar } from "../ui/CharacterAvatar";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { cn } from "../../utils/cn";
import MarkdownRenderer from "../chat/MarkdownRenderer";
import { FaPaperPlane, FaTrash } from "react-icons/fa";

interface TestMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export interface TestChatPaneProps {
  name: string;
  description: string;
  prompt: string;
  scenario: string;
  firstMes: string;
  mesExample: string;
  relationship: string;
  appearance: string;
  appearanceImages: string[];
  accent: [string, string];
  memory?: string[];
  loreEntries?: LoreEntry[];
}

// Builds a transient Character object from the wizard's form state so we can
// feed it into the same buildTurnContext / generateAIResponse pipeline the real
// chat uses — without touching IndexedDB or the Redux character slice.
const buildDraftCharacter = (props: TestChatPaneProps): Character => ({
  id: -1, // sentinel — never persisted
  name: props.name,
  description: props.description,
  prompt: props.prompt,
  scenario: props.scenario || undefined,
  first_mes: props.firstMes || undefined,
  mes_example: props.mesExample || undefined,
  relationship: props.relationship || undefined,
  appearance: props.appearance || undefined,
  appearanceImages: props.appearanceImages,
  accent: props.accent,
  memory: props.memory,
  loreEntries: props.loreEntries,
});

const TestChatPane: React.FC<TestChatPaneProps> = (props) => {
  const dispatch = useAppDispatch();
  const activePersona = useAppSelector(selectActivePersona);

  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Seed with the character's first message whenever the greeting changes or
  // the component mounts.  We track the last-seeded greeting so re-renders
  // that don't actually change firstMes don't wipe an ongoing conversation.
  const lastSeededGreeting = useRef<string | null>(null);
  useEffect(() => {
    if (props.firstMes && props.firstMes !== lastSeededGreeting.current) {
      lastSeededGreeting.current = props.firstMes;
      setMessages([
        {
          id: "greeting-" + Date.now(),
          role: "assistant",
          text: props.firstMes,
          timestamp: Date.now(),
        },
      ]);
      setTestError(null);
    } else if (!props.firstMes && lastSeededGreeting.current !== "") {
      lastSeededGreeting.current = "";
      setMessages([]);
      setTestError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.firstMes]);

  // Auto-scroll to the bottom when messages change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleClearChat = useCallback(() => {
    const seed: TestMessage[] = props.firstMes
      ? [{ id: "greeting-" + Date.now(), role: "assistant", text: props.firstMes, timestamp: Date.now() }]
      : [];
    setMessages(seed);
    setTestError(null);
    lastSeededGreeting.current = props.firstMes || "";
  }, [props.firstMes]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isGenerating) return;

    setTestError(null);
    setInputText("");

    const userMsg: TestMessage = {
      id: "user-" + Date.now(),
      role: "user",
      text,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsGenerating(true);

    try {
      const draftChar = buildDraftCharacter(props);

      // Convert TestMessage[] → Message[] for buildTurnContext.
      const contextMessages: Message[] = updatedMessages.map((m) => ({
        role: m.role === "user" ? YOU : AI,
        txt: m.text,
      }));

      const { history, systemInstruction, characterImages, characterName } =
        buildTurnContext(contextMessages, draftChar, undefined, undefined, activePersona);

      const result = await dispatch(
        generateAIResponse({
          prompt: text,
          history,
          systemInstruction,
          characterImages,
          characterName,
        })
      ).unwrap();

      const assistantMsg: TestMessage = {
        id: "assistant-" + Date.now(),
        role: "assistant",
        text: result.text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errMsg = typeof err === "string" ? err : err?.message || "Failed to generate response. Check your API key in Settings.";
      setTestError(errMsg);
    } finally {
      setIsGenerating(false);
    }
  }, [inputText, isGenerating, messages, props, dispatch, activePersona]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charInitials = props.name
    ? props.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <Card className="flex flex-col h-[480px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <CharacterAvatar name={props.name || "?"} accent={props.accent} size={28} />
          <span className="text-sm font-semibold text-foreground truncate">
            Test Chat
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClearChat}
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          title="Clear test chat"
          aria-label="Clear test chat"
        >
          <FaTrash size={11} />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !isGenerating && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground text-center max-w-[240px]">
              Send a message to test how this character responds. This conversation won't be saved.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-2 max-w-[92%]",
              msg.role === "user" ? "ml-auto flex-row-reverse" : ""
            )}
          >
            {msg.role === "assistant" && (
              <CharacterAvatar name={charInitials} accent={props.accent} size={26} className="mt-0.5 flex-shrink-0" />
            )}
            <div
              className={cn(
                "rounded-2xl px-3.5 py-2 text-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted rounded-bl-md"
              )}
            >
              <div className="font-serif leading-relaxed">
                <MarkdownRenderer msgText={msg.text} isUser={msg.role === "user"} />
              </div>
            </div>
          </div>
        ))}

        {isGenerating && (
          <div className="flex gap-2 max-w-[92%]">
            <CharacterAvatar name={charInitials} accent={props.accent} size={26} className="mt-0.5 flex-shrink-0" />
            <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {testError && (
        <div className="px-3 py-2 bg-destructive/10 border-t border-destructive/30 text-destructive text-xs">
          {testError}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border p-2.5 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a test message..."
          disabled={isGenerating}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2 text-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "max-h-[80px] overflow-y-auto"
          )}
        />
        <Button
          type="button"
          variant="default"
          size="icon"
          onClick={handleSend}
          disabled={!inputText.trim() || isGenerating}
          className="h-9 w-9 rounded-xl flex-shrink-0"
          title="Send test message"
          aria-label="Send test message"
        >
          <FaPaperPlane size={12} />
        </Button>
      </div>
    </Card>
  );
};

export default TestChatPane;
