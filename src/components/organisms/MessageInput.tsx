import React, { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from "react";
import { FaPaperPlane, FaStop, FaCog, FaImage, FaVideo, FaTimes, FaMask, FaUserFriends, FaCommentSlash, FaPlus, FaMagic, FaMicrophone, FaMicrophoneAlt, FaPaperclip } from "react-icons/fa";
import { cn } from "../../utils/cn";
import { Button } from "src/components/atoms/button";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { useColorTheme } from "../../hooks/useColorTheme";
import { TermLink } from "src/components/atoms/TermLink";
import { estimateTokens } from "../../features/ai/utils/tokenEstimator";
import { VIDEO_PROVIDERS } from "../../features/ai/providers/registry";
import { getProviderApiKey, getWanBaseUrl } from "../../features/ai/utils/settings";
import { Character } from "../../types";
import { matchSlashCommands, parseSlashCommand } from "../../features/chat/slashCommands";
import { isRecognitionSupported, RecognitionSession, startRecognition } from "../../features/voice/recognition";
import { formatDuration, stopSpeaking } from "../../features/voice/speech";
import { MAX_PHOTOS, readPhoto } from "../../features/chat/photoAttachments";

// Deferred to its own chunk - only fetched once the user actually opens the
// image settings modal, instead of loading with the rest of the chat page.
const ImageSettingsModal = lazy(() => import("./ImageSettingsModal"));

interface MessageInputProps {
  // "Write my reply" (#15): asks the AI for a draft of your next message and
  // puts it in the box to edit; resolves to null when it couldn't.
  onDraftReply?: () => Promise<string | null>;
  // Replaces the usual "Message ..." placeholder (co-writing mode, #68).
  placeholderText?: string;
  // Text pushed into the box from outside (a tapped reply suggestion); a new
  // nonce replaces the draft even when the text repeats.
  draftInjection?: { text: string; nonce: number };
  // Quoted replies (#119): the message your next one answers, shown above
  // the box with a way to drop it.
  replyPreview?: { name: string; text: string };
  onCancelReply?: () => void;
  // `forcedSpeakerId` is set when the user picked a specific participant
  // (via the room picker below) while a draft was in the box - only that
  // character should reply to this particular message, bypassing the usual
  // @mention/round-robin pick.
  // `isVoiceNote` marks a message recorded with hold-to-talk (#44).
  onSend: (text: string, isImageRequest?: boolean, isVideoRequest?: boolean, isImpersonated?: boolean, forcedSpeakerId?: number, silentSend?: boolean, isVoiceNote?: boolean, photos?: string[]) => void;
  disabled?: boolean;
  onStop?: () => void;
  // Fires while the user is actively typing a non-empty draft - lets a
  // parent treat that as "activity" (e.g. to push out a pending autonomous
  // follow-up) without needing the draft text itself.
  onDraftActivity?: () => void;
  tokenCount?: number;
  costEstimate?: number;
  characterName?: string;
  userName?: string;
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
  // Room-only (Phase 12+): every member, for the "reply as" picker. Omitted
  // (or a single-character list) for a plain 1:1 chat, which hides it entirely.
  roomCharacters?: Character[];
  mutedParticipantIds?: number[];
  // Picking a participant while the draft is EMPTY skips composing
  // altogether and asks that character to speak up now, same as before -
  // this is that existing force-reply/follow-up action, not a new one.
  onForceReply?: (characterId: number) => void;
}

const MAX_TEXTAREA_HEIGHT = 120;
// Releasing the record button further than this (px) from it cancels the
// voice note instead of sending it.
const RECORD_CANCEL_SLOP = 60;
// A press shorter than this was a tap: say how the button works.
const RECORD_MIN_MS = 600;
const ASCII_BAR_CELLS = 40;
// The terminal theme's short bracketed names for the composer tools.
const TERMINAL_TOOL_LABELS: Record<string, string> = { image: "img", photo: "photo", video: "vid", impersonate: "mask", silent: "silent", draft: "draft", dictate: "mic", settings: "cfg" };

const formatTokenCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
};

const MessageInput: React.FC<MessageInputProps> = ({
  placeholderText,
  onSend,
  disabled = false,
  onStop,
  onDraftActivity,
  tokenCount = 0,
  costEstimate = 0,
  characterName,
  userName,
  contextTokens = 0,
  maxContextTokens = 0,
  totalChatTokens = 0,
  totalChatCost = 0,
  roomCharacters,
  mutedParticipantIds,
  onForceReply,
  onDraftReply,
  draftInjection,
  replyPreview,
  onCancelReply,
}) => {
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const terminal = is("terminal");
  const [text, setText] = useState("");
  const [isImageRequest, setIsImageRequest] = useState(false);
  const [isVideoRequest, setIsVideoRequest] = useState(false);
  // Wan is the only video provider today (hardcoded in aiSlice.ts) and needs
  // its own API key + workspace endpoint beyond whatever's already set up for
  // chat/images - hide the toggle entirely rather than let someone turn it on
  // and only find out it's unconfigured once the request fails.
  const [isVideoGenAvailable, setIsVideoGenAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const providerId = "wan";
      const caps = VIDEO_PROVIDERS[providerId]?.capabilities;
      if (!caps) return;
      const apiKey = caps.requiresApiKey ? await getProviderApiKey(providerId) : "ok";
      const baseUrl = caps.requiresBaseUrl ? getWanBaseUrl() : "ok";
      if (!cancelled) setIsVideoGenAvailable(Boolean(apiKey && baseUrl));
    })();
    return () => { cancelled = true; };
  }, []);
  const [isImpersonated, setIsImpersonated] = useState(false);
  // "Send without a reply" - adds the message as yourself but skips the
  // usual auto AI-reply, so the very next send (e.g. an impersonated one)
  // can supply the character's side of the exchange instead.
  const [isSilentSend, setIsSilentSend] = useState(false);
  // Photos attached to the next message (#48), already shrunk.
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const addPhotos = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setPhotoError(null);
    try {
      const read = await Promise.all(images.map(readPhoto));
      setPhotos((prev) => {
        const next = [...prev, ...read];
        if (next.length > MAX_PHOTOS) setPhotoError(`Up to ${MAX_PHOTOS} photos per message.`);
        return next.slice(0, MAX_PHOTOS);
      });
    } catch (err: any) {
      setPhotoError(err?.message || "Couldn't read that photo.");
    }
  }, []);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [slashError, setSlashError] = useState<string | null>(null);
  const slashHints = matchSlashCommands(text);
  // Once true, stays true - keeps the (lazy-loaded) modal mounted after its
  // first open so its own open/close transition keeps working, while still
  // not fetching its chunk before it's ever needed.
  const settingsModalEverOpenedRef = useRef(false);
  if (isSettingsModalOpen) settingsModalEverOpenedRef.current = true;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<number | null>(null);
  // Set while the caret is sitting right after an in-progress "@word" with no
  // space yet typed - `start` is where the "@" sits in `text`, `query` is
  // whatever's been typed after it so far.
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (replyPreview) inputRef.current?.focus();
  }, [replyPreview]);
  const pickerRef = useRef<HTMLDivElement>(null);

  const isRoom = Boolean(roomCharacters && roomCharacters.length > 1);
  const selectedSpeaker = selectedSpeakerId != null ? roomCharacters?.find((c) => c.id === selectedSpeakerId) : undefined;
  // Who an impersonated message is written as: the picked room speaker, if
  // any, matching what ChatPage stores as the message's speaker.
  const impersonatedName = selectedSpeaker?.name || characterName;

  // Looks backward from the caret for an "@" that starts the current word
  // (line start or preceded by whitespace, no space/newline/second "@" typed
  // since) - the same shape of mention handleSend's own parseMention already
  // understands, just detected live as a prefix instead of read back after
  // the fact.
  const detectMention = useCallback((value: string, cursorPos: number): { start: number; query: string } | null => {
    if (!isRoom) return null;
    const uptoCursor = value.slice(0, cursorPos);
    const match = uptoCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) return null;
    const query = match[1];
    return { start: cursorPos - query.length - 1, query };
  }, [isRoom]);

  const mentionSuggestions = useMemo(() => {
    if (!mention || !roomCharacters) return [];
    const q = mention.query.toLowerCase();
    return roomCharacters.filter((c) => c.name.toLowerCase().startsWith(q));
  }, [mention, roomCharacters]);

  // Reset the highlight to the top match every time the candidate list
  // changes - narrowing it by typing another letter, or starting a whole
  // new mention elsewhere - so it never points past the end or lingers on
  // an unrelated character from a previous mention.
  useEffect(() => {
    setMentionActiveIndex(0);
  }, [mentionSuggestions]);

  const updateMentionFromCaret = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    setMention(detectMention(el.value, el.selectionStart ?? el.value.length));
  }, [detectMention]);

  const applyMention = useCallback((character: Character) => {
    if (!mention) return;
    const before = text.slice(0, mention.start);
    const after = text.slice(mention.start + 1 + mention.query.length);
    const insertion = `@${character.name} `;
    const newText = `${before}${insertion}${after}`;
    setText(newText);
    setMention(null);
    const cursorPos = before.length + insertion.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(cursorPos, cursorPos);
    });
  }, [mention, text]);

  // Click-based, not hover - a hover-triggered popover this close to the
  // screen edge left no room to move the cursor from the icon into the
  // popover without it closing first. Closes on picking someone (see
  // handlePickParticipant), on Escape, or on clicking anywhere else.
  useEffect(() => {
    if (!pickerOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  // Phone-width "+" menu holding the composer's tools (image, video,
  // impersonate, silent send, image settings), so the text box gets the row's
  // width instead of being squeezed to a sliver by five icon buttons.
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toolsOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [toolsOpen]);

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
    if (!trimmedText && photos.length === 0) return;
    // A mistyped slash command stays in the box with a hint, instead of
    // being sent or lost.
    const command = parseSlashCommand(trimmedText);
    if (command?.kind === "error") {
      setSlashError(command.message);
      return;
    }
    setSlashError(null);

    onSend(trimmedText, isImageRequest, isVideoRequest, isImpersonated, selectedSpeakerId ?? undefined, isSilentSend, false, photos.length > 0 ? photos : undefined);
    setText("");
    setPhotos([]);
    setPhotoError(null);
    setIsImageRequest(false); // Disable/uncheck it afterward
    setIsVideoRequest(false);
    setIsImpersonated(false);
    setIsSilentSend(false);
    setSelectedSpeakerId(null);
    setMention(null);
  }, [text, photos, isImageRequest, isVideoRequest, isImpersonated, isSilentSend, selectedSpeakerId, onSend, disabled]);

  // ---- Voice (#12, #44) ----
  // Dictation types what you say into the box; holding the record button
  // sends what you say as a voice note. Both use the browser's speech
  // recognition, so neither shows where it's missing (Firefox).
  const recognitionSupported = useMemo(() => isRecognitionSupported(), []);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const dictationRef = useRef<RecognitionSession | null>(null);
  const [dictating, setDictating] = useState(false);
  const toggleDictation = useCallback(() => {
    if (dictationRef.current) {
      dictationRef.current.stop();
      return;
    }
    // A character reading aloud would be typed in too.
    stopSpeaking();
    setVoiceError(null);
    const base = text.trim() ? `${text.trimEnd()} ` : "";
    const session = startRecognition({
      onUpdate: (final, interim) => {
        setText(base + [final, interim].filter(Boolean).join(" "));
        onDraftActivity?.();
      },
      onEnd: (heard, error) => {
        dictationRef.current = null;
        setDictating(false);
        if (heard) setText(base + heard);
        if (error) setVoiceError(error);
        requestAnimationFrame(() => inputRef.current?.focus());
      },
    });
    if (!session) {
      setVoiceError("Couldn't start speech recognition in this browser.");
      return;
    }
    dictationRef.current = session;
    setDictating(true);
  }, [text, onDraftActivity]);

  const recordRef = useRef<{ session: RecognitionSession; startedAt: number; cancelled: boolean } | null>(null);
  const [recording, setRecording] = useState<{ startedAt: number; heard: string } | null>(null);
  const [recordNow, setRecordNow] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [recording]);
  // Sends with whatever the toggles are when the note ends, through a ref
  // since recognition reports back after the press that started it.
  const sendVoiceNoteRef = useRef<(heard: string) => void>(() => {});
  sendVoiceNoteRef.current = (heard: string) => {
    onSend(heard, false, false, false, selectedSpeakerId ?? undefined, isSilentSend, true);
    setIsImageRequest(false);
    setIsVideoRequest(false);
    setIsSilentSend(false);
    setSelectedSpeakerId(null);
  };
  const startRecording = useCallback(() => {
    if (recordRef.current || disabled) return;
    stopSpeaking();
    dictationRef.current?.abort();
    setVoiceError(null);
    const startedAt = Date.now();
    const session = startRecognition({
      onUpdate: (final, interim) => setRecording((r) => (r ? { ...r, heard: [final, interim].filter(Boolean).join(" ") } : r)),
      onEnd: (heard, error) => {
        const rec = recordRef.current;
        recordRef.current = null;
        setRecording(null);
        if (!rec || rec.cancelled) return;
        if (heard.trim()) sendVoiceNoteRef.current(heard.trim());
        else if (error) setVoiceError(error);
        else setVoiceError(Date.now() - rec.startedAt < RECORD_MIN_MS ? "Hold the button while you speak, then let go to send." : "Didn't catch anything, so nothing was sent.");
      },
    });
    if (!session) {
      setVoiceError("Couldn't start speech recognition in this browser.");
      return;
    }
    recordRef.current = { session, startedAt, cancelled: false };
    setRecording({ startedAt, heard: "" });
    setRecordNow(startedAt);
  }, [disabled]);
  const finishRecording = useCallback((cancel = false) => {
    const rec = recordRef.current;
    if (!rec) return;
    if (cancel) {
      rec.cancelled = true;
      rec.session.abort();
    } else {
      rec.session.stop();
    }
  }, []);
  // Leaving the chat mid-sentence throws it away.
  useEffect(() => () => {
    dictationRef.current?.abort();
    if (recordRef.current) recordRef.current.cancelled = true;
    recordRef.current?.session.abort();
  }, []);
  const showRecordButton = recognitionSupported && !text.trim() && photos.length === 0 && !disabled && !isImpersonated && !dictating;
  // Press and hold (mouse, touch or pen), or hold Space/Enter on the
  // keyboard. Letting go far from the button cancels.
  const recordButtonHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      // Only the main button: a right-click shouldn't start recording.
      if (e.button > 0) return;
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Not every browser can capture a synthetic pointer.
      }
      startRecording();
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const away = e.clientX < r.left - RECORD_CANCEL_SLOP || e.clientX > r.right + RECORD_CANCEL_SLOP || e.clientY < r.top - RECORD_CANCEL_SLOP || e.clientY > r.bottom + RECORD_CANCEL_SLOP;
      finishRecording(away);
    },
    onPointerCancel: () => finishRecording(true),
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) startRecording();
      } else if (e.key === "Escape") {
        finishRecording(true);
      }
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        finishRecording();
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  const recordLabel = recording ? "Recording voice note, let go to send" : "Hold to record a voice note";
  const recordSeconds = recording ? Math.max(0, (recordNow - recording.startedAt) / 1000) : 0;

  // Mutually exclusive - toggling one clears the other, since a single reply
  // only ever generates one kind of media.
  // "Write my reply": fills the box with an AI draft of your next message.
  const handleDraftReply = useCallback(async () => {
    if (!onDraftReply || drafting) return;
    setDrafting(true);
    try {
      const draft = await onDraftReply();
      if (draft) {
        setText(draft);
        onDraftActivity?.();
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    } finally {
      setDrafting(false);
    }
  }, [onDraftReply, drafting, onDraftActivity]);

  // A reply suggestion tapped elsewhere replaces the draft.
  useEffect(() => {
    if (!draftInjection) return;
    setText(draftInjection.text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [draftInjection]);

  const toggleImageRequest = useCallback(() => {
    setIsImageRequest((v) => {
      const next = !v;
      if (next) setIsVideoRequest(false);
      return next;
    });
  }, []);
  const toggleVideoRequest = useCallback(() => {
    setIsVideoRequest((v) => {
      const next = !v;
      if (next) setIsImageRequest(false);
      return next;
    });
  }, []);

  // Picking a participant means something different depending on whether
  // there's already a draft: with text in the box, it targets THIS message
  // (cleared once sent, like the image/impersonate toggles above); with an
  // empty box, there's nothing to target, so it goes straight to the
  // existing "make them speak up now" action instead.
  const handlePickParticipant = useCallback((character: Character) => {
    if (disabled) return;
    setPickerOpen(false);
    if (text.trim()) {
      setSelectedSpeakerId(character.id);
      inputRef.current?.focus();
    } else {
      onForceReply?.(character.id);
    }
  }, [disabled, text, onForceReply]);

  // Scroll input into view when focused (helps with mobile keyboards)
  const handleFocus = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }, []);

  const canSend = Boolean((text.trim() || photos.length > 0) && !disabled);

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
  const filledCells = Math.round(Math.min(contextUtilization, 1) * ASCII_BAR_CELLS);
  const promptName = isImpersonated
    ? `${(impersonatedName || "character").toLowerCase()}@session`
    : `you@${(userName?.trim() || "you").toLowerCase()}`;

  // Banner row for the image/impersonation/forced-speaker toggles - terminal
  // renders it as a plain bordered `# note [x]` line.
  const terminalBanner = (note: React.ReactNode, onClear: () => void, clearLabel: string) => (
    <div className="flex items-center gap-2.5 px-3 py-2 border border-border-bright text-[12px] text-foreground">
      <span className="flex-1"># {note}</span>
      <TermLink label="x" onClick={onClear} aria-label={clearLabel} />
    </div>
  );

  const participantPicker = roomCharacters && (
    <div className="absolute bottom-full left-0 mb-2 flex items-center gap-1.5 p-1.5 rounded-full bg-card border border-border shadow-soft z-30">
      {roomCharacters.map((char) => {
        const isMuted = mutedParticipantIds?.includes(char.id);
        return (
          <button
            key={char.id}
            type="button"
            onClick={() => handlePickParticipant(char)}
            disabled={disabled || isMuted}
            title={isMuted ? `${char.name} is muted` : text.trim() ? `Only ${char.name} replies to this message` : `Make ${char.name} reply now`}
            aria-label={isMuted ? `${char.name} is muted` : `Reply as ${char.name}`}
            className={cn(
              "flex-shrink-0 rounded-full transition disabled:cursor-not-allowed",
              isMuted ? "opacity-30" : "hover:scale-110 hover:ring-2 hover:ring-primary/50",
              selectedSpeakerId === char.id && "ring-2 ring-primary"
            )}
          >
            <CharacterAvatar name={char.name} accent={char.accent} imageSrc={char.appearanceImages?.[0]} size={32} />
          </button>
        );
      })}
    </div>
  );

  // The composer's tools, described once and rendered two ways: inline icon
  // buttons from sm up, and a labeled "+" menu on phones.
  const composerTools: {
    key: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    title: string;
    ariaLabel: string;
    active: boolean;
    toggle: boolean;
    disabled?: boolean;
    onClick: () => void;
    activeClass: string; // menu row when on
    activeButtonClass: string; // icon button when on
  }[] = [
    {
      key: "image", icon: FaImage, label: "Request an image", title: "Request an image with this message",
      ariaLabel: "Request an image with this message", active: isImageRequest, toggle: true, disabled,
      onClick: toggleImageRequest,
      activeClass: "bg-primary/[0.12] text-primary", activeButtonClass: "bg-primary/[0.14] text-primary hover:bg-primary/[0.2]",
    },
    ...(isVideoGenAvailable ? [{
      key: "video", icon: FaVideo, label: "Request a video", title: "Request a video with this message",
      ariaLabel: "Request a video with this message", active: isVideoRequest, toggle: true, disabled,
      onClick: toggleVideoRequest,
      activeClass: "bg-primary/[0.12] text-primary", activeButtonClass: "bg-primary/[0.14] text-primary hover:bg-primary/[0.2]",
    }] : []),
    {
      key: "photo", icon: FaPaperclip, label: "Send a photo", title: "Attach a photo for the character to see",
      ariaLabel: "Send a photo", active: photos.length > 0, toggle: false, disabled: disabled || isImpersonated || photos.length >= MAX_PHOTOS,
      onClick: () => photoInputRef.current?.click(),
      activeClass: "bg-primary/[0.12] text-primary", activeButtonClass: "bg-primary/[0.14] text-primary hover:bg-primary/[0.2]",
    },
    {
      key: "impersonate", icon: FaMask, label: `Write as ${impersonatedName || "the character"}`, title: `Write as ${impersonatedName || "the character"} instead of yourself`,
      ariaLabel: "Toggle impersonation mode", active: isImpersonated, toggle: true, disabled,
      onClick: () => setIsImpersonated((v) => { if (!v) setIsSilentSend(false); return !v; }),
      activeClass: "bg-violet-500/[0.12] text-violet-500", activeButtonClass: "bg-violet-500/[0.14] text-violet-500 hover:bg-violet-500/[0.2]",
    },
    {
      key: "silent", icon: FaCommentSlash, label: "Send without a reply", title: "Send without triggering an AI reply",
      ariaLabel: "Toggle silent send", active: isSilentSend, toggle: true, disabled,
      onClick: () => setIsSilentSend((v) => { if (!v) setIsImpersonated(false); return !v; }),
      activeClass: "bg-amber-500/[0.12] text-amber-500", activeButtonClass: "bg-amber-500/[0.14] text-amber-500 hover:bg-amber-500/[0.2]",
    },
    ...(onDraftReply ? [{
      key: "draft", icon: FaMagic, label: drafting ? "Writing your reply..." : "Write my reply", title: "Let the AI draft your next message for you to edit",
      ariaLabel: "Write my reply", active: drafting, toggle: false, disabled: disabled || drafting,
      onClick: handleDraftReply,
      activeClass: "bg-primary/[0.12] text-primary", activeButtonClass: "bg-primary/[0.14] text-primary hover:bg-primary/[0.2] animate-pulse",
    }] : []),
    ...(recognitionSupported ? [{
      key: "dictate", icon: FaMicrophoneAlt, label: dictating ? "Stop dictating" : "Dictate", title: "Dictate: speak and your words appear in the box",
      ariaLabel: "Dictate", active: dictating, toggle: true, disabled,
      onClick: toggleDictation,
      activeClass: "bg-destructive/[0.12] text-destructive", activeButtonClass: "bg-destructive/[0.14] text-destructive hover:bg-destructive/[0.2]",
    }] : []),
    {
      key: "settings", icon: FaCog, label: "Image settings", title: "Image Generation Settings",
      ariaLabel: "Image Generation Settings", active: false, toggle: false,
      onClick: () => setIsSettingsModalOpen(true),
      activeClass: "", activeButtonClass: "",
    },
  ];

  // Only the two everyday tools sit next to the box; the rest live in the
  // "+" menu, so the text box keeps most of the row. When the composer is
  // too narrow even for those two and a usable text box (phones, or next to
  // an open side panel), everything folds into "+".
  const INLINE_TOOLS = ["image", "photo"];
  const inlineCount = composerTools.filter((t) => INLINE_TOOLS.includes(t.key)).length;
  const toolCountRef = useRef(inlineCount);
  toolCountRef.current = inlineCount;
  const [collapseTools, setCollapseTools] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const row = toolsRef.current?.parentElement;
    if (!row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      // Measured: inline, each tool takes ~44px, and "+", Send, padding and
      // gaps ~200px; the rest, at least ~220px, is the text box.
      setCollapseTools(entry.contentRect.width < toolCountRef.current * 44 + 420);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [terminal]);
  const menuTools = collapseTools ? composerTools : composerTools.filter((t) => !INLINE_TOOLS.includes(t.key));
  const inlineTools = collapseTools ? [] : composerTools.filter((t) => INLINE_TOOLS.includes(t.key));

  const composerTextarea = (
  <textarea
    ref={inputRef}
    value={text}
    onChange={(e) => {
      const value = e.target.value;
      setText(value);
      if (slashError) setSlashError(null);
      if (voiceError) setVoiceError(null);
      if (value.trim()) onDraftActivity?.();
      // A forced-speaker selection only makes sense for a message
      // that's actually being composed - clearing the draft back to
      // empty drops it too, instead of leaving a stale banner around.
      if (!value.trim() && selectedSpeakerId != null) setSelectedSpeakerId(null);
      setMention(detectMention(value, e.target.selectionStart ?? value.length));
    }}
    onClick={updateMentionFromCaret}
    // A pasted image is attached as a photo (#48); pasted text works as usual.
    onPaste={(e) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0 || isImpersonated) return;
      e.preventDefault();
      void addPhotos(files);
    }}
    rows={1}
    placeholder={
      disabled
        ? "Waiting for response..."
        : placeholderText && !isImpersonated
        ? placeholderText
        : isImpersonated
        ? `Write as ${impersonatedName || "the character"}…`
        : selectedSpeaker
        ? `Message ${selectedSpeaker.name}…`
        : characterName
        ? `Message ${characterName}…`
        : "Type a message..."
    }
    className={cn(
      "flex-1 min-w-0 px-2.5 py-[9px] leading-[22px] bg-transparent text-foreground placeholder-subtle outline-none transition-colors resize-none disabled:opacity-50",
      terminal && "block w-full px-1 py-1.5"
    )}
    style={{ fontSize: 'var(--chat-font-size, 16px)', maxHeight: MAX_TEXTAREA_HEIGHT }}
    disabled={disabled}
    onFocus={handleFocus}
    onBlur={() => setMention(null)}
    onKeyUp={(e) => {
      // Arrow keys are already claimed below for navigating an open
      // mention list - only re-derive from the caret here once it's
      // actually moved the cursor (i.e. the list is closed).
      if (!mention && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
        updateMentionFromCaret();
      }
    }}
    onKeyDown={(e) => {
      if (mention && mentionSuggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionActiveIndex((i) => (i + 1) % mentionSuggestions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionActiveIndex((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          applyMention(mentionSuggestions[mentionActiveIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMention(null);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }}
    aria-label="Message input"
    aria-busy={disabled}
  />
  );


  return (
    // `relative` lives here (not on the picker's own small button wrapper
    // below) so the "reply as..." popover's `absolute bottom-full` anchors
    // above the WHOLE composer - context meter and token-cost line included -
    // instead of just above the toggle button, which used to make it overlap
    // and obscure those rows whenever they were tall enough to not fit the
    // 8px gap between rows.
    <div className="relative flex flex-col gap-2">
      {maxContextTokens > 0 && terminal && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span># context</span>
            <span className={cn("tabular-nums", contextUtilization >= 0.6 && budgetColorClass)}>
              {formatTokenCount(estimatedTotalTokens)} / {formatTokenCount(maxContextTokens)} tokens
            </span>
          </div>
          <div
            className={cn("text-[11px] tracking-[-1px] whitespace-nowrap overflow-hidden", contextUtilization >= 0.6 ? budgetColorClass : "text-foreground")}
            aria-hidden="true"
          >
            [{"█".repeat(filledCells)}{"░".repeat(ASCII_BAR_CELLS - filledCells)}]
          </div>
        </div>
      )}

      {maxContextTokens > 0 && !terminal && (
        <div className="flex flex-col gap-1 px-1">
          <div className={cn("flex justify-between text-[11px] font-mono", budgetColorClass)}>
            <span>Context</span>
            <span className="tabular-nums">
              {formatTokenCount(estimatedTotalTokens)} / {formatTokenCount(maxContextTokens)} tokens
            </span>
          </div>
          <div className={cn("h-1.5 rounded-full bg-accent/40 overflow-hidden", neumorphic && "surface-sunken")}>
            <div
              className={cn("h-full rounded-full transition-all", budgetBarColorClass)}
              style={{ width: `${Math.min(contextUtilization * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {(tokenCount > 0 || totalChatTokens > 0) && (
        <div className={cn("flex justify-center text-xs text-ink-faint font-mono", terminal && "justify-start text-[10px]")}>
          <span>
            {terminal && "# "}
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

      {isImageRequest && terminal && terminalBanner("image generation on - a picture will be created alongside the reply.", () => setIsImageRequest(false), "Turn off image generation")}
      {isImageRequest && !terminal && (
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

      {isVideoRequest && terminal && terminalBanner("video generation on - a video will be created alongside the reply (this takes 1-5+ minutes).", () => setIsVideoRequest(false), "Turn off video generation")}
      {isVideoRequest && !terminal && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-primary/10 border border-primary rounded-lg">
          <span className="text-primary flex-shrink-0 flex"><FaVideo size={13} /></span>
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Video generation on — a video will be created alongside the reply (this takes 1-5+ minutes).
          </span>
          <Button
            onClick={() => setIsVideoRequest(false)}
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
            aria-label="Turn off video generation"
          >
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      {isImpersonated && terminal && terminalBanner(`impersonation on - this message is sent as ${impersonatedName || "the character"}, not you.`, () => setIsImpersonated(false), "Turn off impersonation")}
      {isImpersonated && !terminal && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-violet-500/10 border border-violet-500/50 rounded-lg">
          <span className="text-violet-500 flex-shrink-0 flex"><FaMask size={13} /></span>
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Impersonation on — this message is sent as {impersonatedName || "the character"}, not you.
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

      {isSilentSend && terminal && terminalBanner("silent send on - this message won't trigger an AI reply.", () => setIsSilentSend(false), "Turn off silent send")}
      {isSilentSend && !terminal && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-amber-500/10 border border-amber-500/50 rounded-lg">
          <span className="text-amber-500 flex-shrink-0 flex"><FaCommentSlash size={13} /></span>
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Silent send on — this message won't trigger an AI reply.
          </span>
          <Button
            onClick={() => setIsSilentSend(false)}
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
            aria-label="Turn off silent send"
          >
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      {selectedSpeaker && !isImpersonated && terminal && terminalBanner(`only ${selectedSpeaker.name} will reply to this message.`, () => setSelectedSpeakerId(null), "Clear selected replier")}
      {selectedSpeaker && !isImpersonated && !terminal && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-primary/10 border border-primary rounded-lg">
          <CharacterAvatar name={selectedSpeaker.name} accent={selectedSpeaker.accent} imageSrc={selectedSpeaker.appearanceImages?.[0]} size={18} className="flex-shrink-0" />
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Only {selectedSpeaker.name} will reply to this message.
          </span>
          <Button
            onClick={() => setSelectedSpeakerId(null)}
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
            aria-label="Clear selected replier"
          >
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      {replyPreview && (
        <div data-slot="reply-preview" className="flex items-center gap-2.5 px-3 py-2 rounded-lg border-l-4 border-primary bg-primary/[0.08]" role="group" aria-label={`Replying to ${replyPreview.name}`}>
          <div className="min-w-0 flex-1 font-sans">
            <div className="text-[11.5px] font-semibold text-primary">{replyPreview.name}</div>
            <div className="truncate text-[12.5px] text-muted-foreground">{replyPreview.text}</div>
          </div>
          <Button onClick={onCancelReply} variant="ghost" size="icon" className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0" aria-label="Cancel reply">
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      {slashError && (
        <div role="alert" className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/40 text-[12.5px] text-foreground">
          {slashError}
        </div>
      )}

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-hidden
        tabIndex={-1}
        data-testid="photo-input"
        onChange={(e) => {
          void addPhotos(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      {(photos.length > 0 || photoError) && (
        <div role="group" aria-label="Attached photos" className="flex flex-wrap items-center gap-2">
          {photos.map((src, i) => (
            <div key={i} className={cn("relative h-16 w-16 overflow-hidden flex-shrink-0", terminal ? "border border-border-bright" : "rounded-lg border border-border")}>
              <img src={src} alt={`Attachment ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/85 text-foreground hover:bg-background"
              >
                <FaTimes size={10} />
              </button>
            </div>
          ))}
          {photoError && <span role="alert" className="text-[12.5px] text-destructive">{photoError}</span>}
        </div>
      )}

      {voiceError && (
        <div role="alert" className={cn("flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-foreground", terminal ? "border border-border-bright" : "rounded-lg bg-destructive/10 border border-destructive/40")}>
          <span className="flex-1">{terminal && "# "}{voiceError}</span>
          {terminal ? (
            <TermLink label="x" onClick={() => setVoiceError(null)} aria-label="Dismiss" />
          ) : (
            <Button onClick={() => setVoiceError(null)} variant="ghost" size="icon" className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0" aria-label="Dismiss">
              <FaTimes size={11} />
            </Button>
          )}
        </div>
      )}

      {dictating && terminal && terminalBanner("listening - speak and your words appear in the box.", () => dictationRef.current?.stop(), "Stop dictating")}
      {dictating && !terminal && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-destructive/10 border border-destructive/40 rounded-lg">
          <span className="text-destructive flex-shrink-0 flex animate-pulse"><FaMicrophoneAlt size={13} /></span>
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Listening — speak and your words appear in the box.
          </span>
          <Button
            onClick={() => dictationRef.current?.stop()}
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
            aria-label="Stop dictating"
          >
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      {recording && (
        <div
          role="status"
          className={cn("flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-foreground", terminal ? "border border-border-bright" : "rounded-lg bg-destructive/10 border border-destructive/40")}
        >
          {terminal ? <span className="text-destructive">#</span> : <span aria-hidden className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-destructive animate-pulse" />}
          <span className="tabular-nums font-medium">{formatDuration(recordSeconds)}</span>
          <span className="flex-1 min-w-0 truncate">
            {recording.heard || "Recording a voice note. Let go to send, slide away to cancel."}
          </span>
        </div>
      )}

      {/* Slash command hints (#14), while the command word is being typed */}
      {slashHints.length > 0 && (
        <div role="listbox" aria-label="Commands" className="flex flex-col gap-0.5 p-1.5 rounded-lg bg-card border border-border shadow-soft max-h-56 overflow-y-auto">
          {slashHints.map((command) => (
            <button
              key={command.name}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                setText(command.name === "help" || command.name === "summarize" ? `/${command.name}` : `/${command.name} `);
                inputRef.current?.focus();
              }}
              className="flex flex-col items-start px-2 py-1.5 rounded-md text-left hover:bg-secondary"
            >
              <span className="font-mono text-[12.5px] text-primary">{command.usage}</span>
              <span className="text-[12px] text-subtle">{command.description}</span>
            </button>
          ))}
        </div>
      )}

      {mention && mentionSuggestions.length > 0 && (
        <div className="flex flex-col gap-0.5 p-1.5 rounded-lg bg-card border border-border shadow-soft max-h-48 overflow-y-auto">
          {mentionSuggestions.map((char, i) => (
            <button
              key={char.id}
              type="button"
              // mousedown (not click) fires before the textarea would blur,
              // so preventing default here keeps focus/caret in the input
              // instead of losing it to this button first.
              onMouseDown={(e) => {
                e.preventDefault();
                applyMention(char);
              }}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13px] transition-colors",
                i === mentionActiveIndex ? "bg-primary/[0.14] text-primary" : "text-foreground hover:bg-secondary"
              )}
            >
              <CharacterAvatar name={char.name} accent={char.accent} imageSrc={char.appearanceImages?.[0]} size={22} />
              <span className="font-medium">{char.name}</span>
            </button>
          ))}
        </div>
      )}

      {terminal ? (
        <div data-slot="terminal-composer" className="flex items-center gap-2.5 mt-1">
          {isRoom && roomCharacters && (
            <div className="flex-shrink-0" ref={pickerRef}>
              <TermLink
                label={selectedSpeaker ? selectedSpeaker.name : "cast"}
                onClick={() => setPickerOpen((v) => !v)}
                disabled={disabled}
                active={Boolean(selectedSpeaker)}
                title="Reply as..."
                aria-label="Choose who replies"
                aria-expanded={pickerOpen}
              />
              {pickerOpen && participantPicker}
            </div>
          )}
          {/* One [+] opens the tools as a labeled menu (U3's list), so the
              text box isn't squeezed by a row of bracketed links. */}
          <div className="relative flex-shrink-0" ref={toolsRef}>
            <TermLink
              label="+"
              onClick={() => setToolsOpen((v) => !v)}
              active={menuTools.some((t) => t.active)}
              title="More options"
              aria-label="Composer options"
              aria-expanded={toolsOpen}
              className="min-h-6 min-w-6 justify-center"
            />
            {toolsOpen && (
              <div role="menu" className="absolute bottom-full left-0 mb-2 w-60 p-1 bg-card border border-border-bright z-30 flex flex-col">
                {menuTools.map((tool) => (
                  <button
                    key={tool.key}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={tool.toggle ? tool.active : undefined}
                    aria-label={tool.ariaLabel}
                    disabled={tool.disabled}
                    onClick={() => { tool.onClick(); setToolsOpen(false); }}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-2 text-left text-[12px] lowercase disabled:opacity-40",
                      tool.active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
                    )}
                  >
                    <span className="flex-1">&gt; {tool.label}</span>
                    {tool.toggle && tool.active && <span className="font-bold">[on]</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Wider screens: the everyday tools as inline bracketed links. */}
          {inlineTools.map((tool) => (
            <TermLink
              key={tool.key}
              label={TERMINAL_TOOL_LABELS[tool.key] ?? tool.key}
              onClick={tool.onClick}
              disabled={tool.disabled}
              aria-pressed={tool.toggle ? tool.active : undefined}
              title={tool.title}
              aria-label={tool.ariaLabel}
              className={cn("inline-flex", tool.active && "bg-primary text-primary-foreground no-underline")}
            />
          ))}
          <span className="hidden sm:inline flex-none font-bold text-[13px] text-ring">{promptName}:~$</span>
          {/* Underline on a wrapper: a border on the auto-sized textarea itself
              would overflow it by 1px and show a scrollbar. */}
          <div className="flex-1 min-w-0 border-b border-border focus-within:border-ring">{composerTextarea}</div>
          {showRecordButton && (
            // A dot, not "rec": on a phone the text box needs the room.
            <TermLink
              label="●"
              danger={Boolean(recording)}
              title="Hold to record a voice note"
              aria-label={recordLabel}
              className="min-h-6 touch-none select-none flex-shrink-0"
              {...recordButtonHandlers}
            />
          )}
          {disabled && onStop ? (
            <Button onClick={onStop} variant="destructive" className="h-auto py-2 px-3.5 text-[11px] flex-shrink-0" title="Stop Generating" aria-label="Stop Generating">
              stop
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              variant="outline"
              disabled={!canSend}
              className="h-auto py-2 px-3.5 text-[11px] border-border-bright text-foreground flex-shrink-0"
              title="Send Message"
              aria-label="Send Message"
            >
              enter
            </Button>
          )}
        </div>
      ) : (
      <div
        // Theme hook (Material restyles the idle composer); left off in the
        // impersonate/silent modes so their warning tints still show.
        data-slot={isImpersonated || isSilentSend ? undefined : "composer"}
        className={cn(
          // min-h, not h: the row grows with a multi-line draft (the text
          // used to spill out of a fixed 56px pill), and items-end keeps the
          // buttons on the bottom line beside the caret.
          "flex items-end gap-1 min-h-14 px-2 py-2 rounded-[28px] backdrop-blur-md transition-colors",
          neumorphic && !isImpersonated && !isSilentSend ? "surface-sunken" : "shadow-soft",
          isImpersonated
            ? "bg-violet-500/[0.06] border border-violet-500/40"
            : isSilentSend
            ? "bg-amber-500/[0.06] border border-amber-500/40"
            : "bg-card/[0.85] border border-border/10"
        )}
      >
        {isRoom && roomCharacters && (
          <div className="flex-shrink-0" ref={pickerRef}>
            <Button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={disabled}
              variant="ghost"
              title="Reply as..."
              aria-label="Choose who replies"
              aria-expanded={pickerOpen}
              className={cn(
                "h-10 w-10 flex-shrink-0 rounded-lg",
                selectedSpeaker
                  ? "bg-primary/[0.14] text-primary hover:bg-primary/[0.2]"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {selectedSpeaker ? (
                <CharacterAvatar name={selectedSpeaker.name} accent={selectedSpeaker.accent} imageSrc={selectedSpeaker.appearanceImages?.[0]} size={22} />
              ) : (
                <FaUserFriends size={16} />
              )}
            </Button>

            {pickerOpen && participantPicker}
          </div>
        )}

        {/* One "+" button opens the rest of the tools as a labeled menu. */}
        <div className="relative flex-shrink-0" ref={toolsRef}>
          <Button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            variant="ghost"
            title="More options"
            aria-label="Composer options"
            aria-expanded={toolsOpen}
            className={cn(
              "h-10 w-10 flex-shrink-0 rounded-lg",
              menuTools.some((t) => t.active)
                ? "bg-primary/[0.14] text-primary hover:bg-primary/[0.2]"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <FaPlus size={15} />
          </Button>
          {toolsOpen && (
            <div role="menu" className="absolute bottom-full left-0 mb-2 w-60 p-1.5 rounded-xl bg-card border border-border shadow-soft z-30 flex flex-col">
              {menuTools.map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={tool.toggle ? tool.active : undefined}
                  aria-label={tool.ariaLabel}
                  disabled={tool.disabled}
                  onClick={() => { tool.onClick(); setToolsOpen(false); }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[14px] disabled:opacity-50",
                    tool.active ? tool.activeClass : "text-foreground hover:bg-secondary"
                  )}
                >
                  <tool.icon size={15} className="flex-shrink-0" />
                  <span className="flex-1">{tool.label}</span>
                  {tool.toggle && tool.active && <span className="text-[11px] font-semibold">On</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Wider screens: the everyday tools as inline icon buttons. */}
        {inlineTools.map((tool) => (
          <Button
            key={tool.key}
            onClick={tool.onClick}
            disabled={tool.disabled}
            variant="ghost"
            title={tool.title}
            aria-label={tool.ariaLabel}
            aria-pressed={tool.toggle ? tool.active : undefined}
            className={cn(
              "inline-flex h-10 w-10 flex-shrink-0 rounded-lg",
              tool.active ? tool.activeButtonClass : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <tool.icon size={16} />
          </Button>
        ))}

        {composerTextarea}

        {showRecordButton && (
          <Button
            type="button"
            variant="ghost"
            title="Hold to record a voice note"
            aria-label={recordLabel}
            className={cn(
              "h-10 w-10 flex-shrink-0 rounded-lg touch-none select-none [-webkit-touch-callout:none]",
              recording ? "bg-destructive text-destructive-foreground hover:bg-destructive scale-110" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
            {...recordButtonHandlers}
          >
            <FaMicrophone size={16} />
          </Button>
        )}

        {disabled && onStop ? (
          <Button
            onClick={onStop}
            variant="destructive"
            className="h-10 flex-shrink-0 rounded-lg font-semibold"
            title="Stop Generating"
            aria-label="Stop Generating"
          >
            <FaStop size={13} /> <span className="hidden sm:inline">Stop</span>
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            data-slot="send-button"
            className={cn(
              "h-10 flex-shrink-0 rounded-lg font-semibold shadow-none",
              !canSend && "bg-accent text-muted-foreground cursor-not-allowed hover:bg-accent"
            )}
            disabled={!canSend}
            title="Send Message"
            aria-label="Send Message"
          >
            <span className="hidden sm:inline">Send</span> <FaPaperPlane size={14} />
          </Button>
        )}
      </div>
      )}

      {settingsModalEverOpenedRef.current && (
        <Suspense fallback={null}>
          <ImageSettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default MessageInput;
