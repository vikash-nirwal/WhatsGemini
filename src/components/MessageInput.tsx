import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { FaPaperPlane, FaStop, FaCog, FaImage, FaTimes, FaMicrophone, FaMask } from "react-icons/fa";
import { cn } from "../utils/cn";
import { Button } from "./ui/button";
import ImageSettingsModal from "./ImageSettingsModal";
import { isSpeechRecognitionSupported, createSpeechRecognition } from "../utils/speech";
import { estimateTokens } from "../features/ai/utils/tokenEstimator";

interface MessageInputProps {
  onSend: (text: string, isImageRequest?: boolean, isImpersonated?: boolean) => void;
  disabled?: boolean;
  onStop?: () => void;
  // Fires while the user is actively typing a non-empty draft - lets a
  // parent treat that as "activity" (e.g. to push out a pending autonomous
  // follow-up) without needing the draft text itself.
  onDraftActivity?: () => void;
  tokenCount?: number;
  costEstimate?: number;
  characterName?: string;
  // Estimated tokens already committed to this chat's context (system prompt +
  // history), and the selected model's max context window - together these
  // drive the live pre-send budget bar below, updated as the draft grows.
  contextTokens?: number;
  maxContextTokens?: number;
  // Running real-usage totals for this chat's whole lifetime (persisted on
  // the Chat record) - keeps growing across turns and compressions, unlike
  // tokenCount/costEstimate above which reset to just the latest turn.
  totalChatTokens?: number;
  totalChatCost?: number;
}

const MAX_TEXTAREA_HEIGHT = 120;

const formatTokenCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
};

const MessageInput: React.FC<MessageInputProps> = ({ onSend, disabled = false, onStop, onDraftActivity, tokenCount = 0, costEstimate = 0, characterName, contextTokens = 0, maxContextTokens = 0, totalChatTokens = 0, totalChatCost = 0 }) => {
  const [text, setText] = useState("");
  const [isImageRequest, setIsImageRequest] = useState(false);
  const [isImpersonated, setIsImpersonated] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Text already in the box before this dictation session started, and the
  // finalized (non-interim) speech recognized so far in it - rebuilt into
  // `text` on every result event so live partial transcripts just update in
  // place instead of needing a separate ghost-text overlay.
  const baseTextRef = useRef("");
  const finalTranscriptRef = useRef("");
  const micSupported = useMemo(() => isSpeechRecognitionSupported(), []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(() => {
    const recognition = createSpeechRecognition();
    if (!recognition) return;

    baseTextRef.current = text;
    finalTranscriptRef.current = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += transcript + " ";
        } else {
          interim += transcript;
        }
      }
      const base = baseTextRef.current;
      const joinedBase = base && !base.endsWith(" ") ? base + " " : base;
      setText((joinedBase + finalTranscriptRef.current + interim).trimStart());
    };
    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [text]);

  const toggleListening = useCallback(() => {
    if (disabled) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [disabled, isListening, startListening, stopListening]);

  // Stop dictation if the composer unmounts mid-session (e.g. navigating away).
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const resize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [text, resize]);

  // Memoized function to handle message sending
  const handleSend = useCallback(() => {
    if (disabled) return;
    const trimmedText = text.trim();
    if (!trimmedText) return;

    if (isListening) stopListening();
    onSend(trimmedText, isImageRequest, isImpersonated);
    setText("");
    setIsImageRequest(false); // Disable/uncheck it afterward
    setIsImpersonated(false);
  }, [text, isImageRequest, isImpersonated, onSend, disabled, isListening, stopListening]);

  // Scroll input into view when focused (helps with mobile keyboards)
  const handleFocus = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }, []);

  const canSend = Boolean(text.trim() && !disabled);

  // Live pre-send estimate: context already committed to this chat, plus
  // whatever's currently typed but not sent yet - recomputed on every
  // keystroke, purely client-side (no API round-trip).
  const draftTokens = useMemo(() => estimateTokens(text), [text]);
  const estimatedTotalTokens = contextTokens + draftTokens;
  const contextUtilization = maxContextTokens > 0 ? estimatedTotalTokens / maxContextTokens : 0;
  const budgetColorClass =
    contextUtilization >= 0.85 ? "text-destructive" : contextUtilization >= 0.6 ? "text-amber-500" : "text-ink-faint";
  const budgetBarColorClass =
    contextUtilization >= 0.85 ? "bg-destructive" : contextUtilization >= 0.6 ? "bg-amber-500" : "bg-primary/60";

  return (
    <div className="flex flex-col gap-2">
      {maxContextTokens > 0 && (
        <div className="flex flex-col gap-1 px-1">
          <div className={cn("flex justify-between text-[11px] font-mono", budgetColorClass)}>
            <span>Context</span>
            <span className="tabular-nums">
              {formatTokenCount(estimatedTotalTokens)} / {formatTokenCount(maxContextTokens)} tokens
            </span>
          </div>
          <div className="h-1 rounded-full bg-accent/40 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", budgetBarColorClass)}
              style={{ width: `${Math.min(contextUtilization * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {(tokenCount > 0 || totalChatTokens > 0) && (
        <div className="flex justify-center text-xs text-ink-faint font-mono">
          <span>
            {tokenCount > 0 && (
              <>~ {tokenCount.toLocaleString()} tokens last turn ({costEstimate > 0.0001 ? `$${costEstimate.toFixed(4)}` : '< $0.0001'} est.)</>
            )}
            {tokenCount > 0 && totalChatTokens > 0 && "  ·  "}
            {totalChatTokens > 0 && (
              <>{formatTokenCount(totalChatTokens)} tokens total this chat (~{totalChatCost > 0.0001 ? `$${totalChatCost.toFixed(4)}` : '< $0.0001'})</>
            )}
          </span>
        </div>
      )}

      {isImageRequest && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-primary/10 border border-primary rounded-lg">
          <span className="text-primary flex-shrink-0 flex"><FaImage size={13} /></span>
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Image generation on — a picture will be created alongside the reply.
          </span>
          <Button
            onClick={() => setIsImageRequest(false)}
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
            aria-label="Turn off image generation"
          >
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      {isImpersonated && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-violet-500/10 border border-violet-500/50 rounded-lg">
          <span className="text-violet-500 flex-shrink-0 flex"><FaMask size={13} /></span>
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Impersonation on — this message is sent as {characterName || "the character"}, not you.
          </span>
          <Button
            onClick={() => setIsImpersonated(false)}
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
            aria-label="Turn off impersonation"
          >
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      {isListening && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-destructive/10 border border-destructive/50 rounded-lg">
          <span className="relative flex-shrink-0 w-2.5 h-2.5">
            <span className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-75" />
            <span className="absolute inset-0 rounded-full bg-destructive" />
          </span>
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Listening… speak, then tap the mic to stop.
          </span>
          <Button
            onClick={stopListening}
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
            aria-label="Stop listening"
          >
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      <div
        className={cn(
          "flex items-center gap-1 h-14 px-2 rounded-xl backdrop-blur-md shadow-soft transition-colors",
          isImpersonated
            ? "bg-violet-500/[0.06] border border-violet-500/40"
            : "bg-card/[0.85] border border-border/10"
        )}
      >
        <Button
          onClick={() => setIsImageRequest((v) => !v)}
          disabled={disabled}
          variant="ghost"
          title="Request an image with this message"
          aria-label="Request an image with this message"
          aria-pressed={isImageRequest}
          className={cn(
            "h-10 w-10 flex-shrink-0 rounded-lg",
            isImageRequest
              ? "bg-primary/[0.14] text-primary hover:bg-primary/[0.2]"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <FaImage size={16} />
        </Button>

        <Button
          onClick={() => setIsImpersonated((v) => !v)}
          disabled={disabled}
          variant="ghost"
          title={`Write as ${characterName || "the character"} instead of yourself`}
          aria-label="Toggle impersonation mode"
          aria-pressed={isImpersonated}
          className={cn(
            "h-10 w-10 flex-shrink-0 rounded-lg",
            isImpersonated
              ? "bg-violet-500/[0.14] text-violet-500 hover:bg-violet-500/[0.2]"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <FaMask size={16} />
        </Button>

        {micSupported && (
          <Button
            onClick={toggleListening}
            disabled={disabled}
            variant="ghost"
            title={isListening ? "Stop dictation" : "Dictate a message"}
            aria-label={isListening ? "Stop dictation" : "Dictate a message"}
            aria-pressed={isListening}
            className={cn(
              "h-10 w-10 flex-shrink-0 rounded-lg",
              isListening
                ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <FaMicrophone size={16} />
          </Button>
        )}

        <Button
          onClick={() => setIsSettingsModalOpen(true)}
          variant="ghost"
          title="Image Generation Settings"
          aria-label="Image Generation Settings"
          className="h-10 w-10 flex-shrink-0 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <FaCog size={16} />
        </Button>

        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            const value = e.target.value;
            setText(value);
            if (value.trim()) onDraftActivity?.();
          }}
          rows={1}
          placeholder={
            disabled
              ? "Waiting for response..."
              : isImpersonated
              ? `Write as ${characterName || "the character"}…`
              : characterName
              ? `Message ${characterName}…`
              : "Type a message..."
          }
          className="flex-1 min-w-0 px-2.5 py-1 leading-[22px] bg-transparent text-foreground placeholder-subtle outline-none transition-colors resize-none disabled:opacity-50"
          style={{ fontSize: 'var(--chat-font-size, 16px)', maxHeight: MAX_TEXTAREA_HEIGHT }}
          disabled={disabled}
          onFocus={handleFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          aria-label="Message input"
          aria-busy={disabled}
        />

        {disabled && onStop ? (
          <Button
            onClick={onStop}
            variant="destructive"
            className="h-10 flex-shrink-0 rounded-lg font-semibold"
            title="Stop Generating"
            aria-label="Stop Generating"
          >
            <FaStop size={13} /> Stop
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            className={cn(
              "h-10 flex-shrink-0 rounded-lg font-semibold shadow-none",
              !canSend && "bg-accent text-muted-foreground cursor-not-allowed hover:bg-accent"
            )}
            disabled={!canSend}
            title="Send Message"
            aria-label="Send Message"
          >
            Send <FaPaperPlane size={14} />
          </Button>
        )}
      </div>

      <ImageSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </div>
  );
};

export default MessageInput;
