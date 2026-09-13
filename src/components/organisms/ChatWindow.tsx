import React, { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { FaCheck, FaTimes, FaArrowDown, FaClock } from "react-icons/fa";
import { motion } from "framer-motion";
import { YOU, LS_INITIAL_MESSAGES } from "../../utils/constants";
import { Message, Character, ConversationTree } from "../../types";
import { getSiblingInfo } from "../../features/chat/messageTree";
import { resolveEmotionPortrait } from "../../features/ai/utils/emotionUtils";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import ChatMessage from "./ChatMessage";
import ScenePanel from "./ScenePanel";
import ParticipantsPanel from "src/components/molecules/ParticipantsPanel";
import EmotionSpritePanel from "src/components/molecules/EmotionSpritePanel";
import EmotionPopup, { EmotionPopupTrigger } from "src/components/molecules/EmotionPopup";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { setEmotionPanelEnabled } from "../../features/settingsSlice";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "src/components/molecules/dialog";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { Badge } from "src/components/atoms/badge";
import { useColorTheme } from "../../hooks/useColorTheme";

interface ChatWindowProps {
  messages: Message[];
  tree?: ConversationTree;
  onSwitchBranch?: (nodeId: string) => void;
  onDeleteBranch?: (nodeId: string) => void;
  onRegenerate?: (index: number) => void;
  onContinue?: (index: number) => void;
  onEdit?: (index: number, text: string, isImageRequest?: boolean) => void;
  onSend?: (text: string, isImageRequest?: boolean) => void;
  aiLoading?: boolean;
  isFollowupPending?: boolean;
  characterName?: string;
  userName?: string;
  character?: Character; // the chat's primary character - header, empty state, and the fallback for any message with no resolvable speaker
  characters?: Character[]; // every character in the chat/room (Phase 12); per-message avatar/emotion resolve against this via Message.speakerId, falling back to `character` above
  allCharacters?: Character[]; // the full app-wide character roster, only needed by the Participants panel's invite picker
  chatId?: number;
  sceneOpen?: boolean;
  onCloseScene?: () => void;
  authorNote?: string;
  worldTags?: string[];
  isRoom?: boolean; // whether this chat currently has 2+ characters - see ScenePanel's group-scoped memory/scenario
  chatMemory?: string[]; // Chat.memory - only meaningful/shown when isRoom
  chatScenario?: string; // Chat.scenario - only meaningful/shown when isRoom
  participantsOpen?: boolean;
  onCloseParticipants?: () => void;
  mutedParticipantIds?: number[];
}

const TerminalCursorLine = ({ name, note }: { name?: string; note?: string }) => (
  <div className="flex items-center gap-1.5 mb-5 text-[12px] text-muted-foreground">
    <span>{name || "session"}@session:~$</span>
    {note ? <span># {note}</span> : <span className="term-cursor" />}
  </div>
);

const TypingIndicator = ({ charInitials, accent, imageSrc }: { charInitials: string; accent?: [string, string]; imageSrc?: string }) => (
  <div className="flex items-end gap-3 mb-6">
    <CharacterAvatar name={charInitials} accent={accent} imageSrc={imageSrc} size={32} className="mt-1" />
    <div className="flex items-center gap-1 px-4 py-3.5 bg-card/[0.88] border border-border/40 shadow-soft rounded-2xl rounded-tl-[5px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-subtle"
          animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  </div>
);

// Shown while an autonomous follow-up's random delay is still counting down
// - distinct from TypingIndicator (which means a reply is actually
// generating) so the two are never shown at once.
const FollowupIndicator = ({ charInitials, accent, imageSrc }: { charInitials: string; accent?: [string, string]; imageSrc?: string }) => (
  <div className="flex items-end gap-3 mb-6">
    <CharacterAvatar name={charInitials} accent={accent} imageSrc={imageSrc} size={32} className="mt-1" />
    <div className="flex items-center gap-1.5 px-4 py-3.5 bg-card/[0.88] border border-border/40 shadow-soft rounded-2xl rounded-tl-[5px]">
      <motion.span
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        className="text-subtle"
      >
        <FaClock size={11} />
      </motion.span>
      <span className="text-xs text-subtle">thinking of reaching out...</span>
    </div>
  </div>
);

const ChatWindow: React.FC<ChatWindowProps> = ({ messages = [], tree, onSwitchBranch, onDeleteBranch, onRegenerate, onContinue, onEdit, onSend, aiLoading, isFollowupPending, characterName, userName, character, characters, allCharacters, chatId, sceneOpen, onCloseScene, authorNote, worldTags, isRoom, chatMemory, chatScenario, participantsOpen, onCloseParticipants, mutedParticipantIds }) => {
  const { is } = useColorTheme();
  const terminal = is("terminal");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editIsImageRequest, setEditIsImageRequest] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      setIsScrolledUp(scrollHeight - scrollTop - clientHeight > 100);
    }
  }, []);

  // scrollTop isn't re-clamped when the container shrinks (mobile keyboard
  // opening, browser chrome show/hide, orientation change) - it silently
  // falls short of the new bottom, letting old messages peek out from under
  // the floating composer. Snap back to bottom whenever that happens, but
  // only if the user hadn't deliberately scrolled up to read history.
  const isScrolledUpRef = useRef(isScrolledUp);
  isScrolledUpRef.current = isScrolledUp;

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!isScrolledUpRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const startIndex = useMemo(() => {
    let index = 0;

    const charPromptIndex = messages.findIndex(
      (m) =>
        m.role === YOU &&
        m.txt &&
        m.txt.startsWith("Role play as, Character Name:")
    );
    if (charPromptIndex !== -1) {
      index = Math.max(index, charPromptIndex + 2);
    }

    // Hide the [SYSTEM DIRECTIVE] summary message added during compression
    const sysDirIndex = messages.findIndex(
      (m) =>
        m.role === YOU &&
        m.txt &&
        m.txt.startsWith("[SYSTEM DIRECTIVE]:")
    );
    if (sysDirIndex !== -1) {
      index = Math.max(index, sysDirIndex + 2);
    }

    return index;
  }, [messages]);

  const filteredMessages = useMemo(() => {
    let sliced = messages.slice(startIndex) || [];

    // Hide explicitly flagged system setup messages
    sliced = sliced.filter(m => !m.isSystem);

    // Additionally hide backward compatibility pre-populated InitialMessages
    // if they weren't explicitly flagged (e.g. from an older app state)
    try {
      const savedMessages = JSON.parse(localStorage.getItem(LS_INITIAL_MESSAGES) || "[]") as any[];
      let hiddenCount = 0;
      for (let i = 0; i < savedMessages.length && i < sliced.length; i++) {
        if (sliced[i].role === savedMessages[i].role && sliced[i].txt?.trim() === savedMessages[i].message?.trim()) {
          hiddenCount++;
        } else {
          break;
        }
      }
      if (hiddenCount > 0) {
        sliced = sliced.slice(hiddenCount);
      }
    } catch (err) {
      console.warn("Failed to parse initial messages for filtering", err);
    }

    return sliced;
  }, [messages, startIndex]);

  useEffect(() => {
    setEditingIndex(null);
    setEditText("");
  }, [messages]);

  const prevMessagesLengthRef = useRef(messages.length);

  useEffect(() => {
    if (!isScrolledUp) {
      // Determine if we should smooth scroll or jump instantly
      // Jump instantly if loading a new chat (length jumps significantly or goes from 0 to N)
      const diff = Math.abs(messages.length - prevMessagesLengthRef.current);
      const isInstant = prevMessagesLengthRef.current === 0 || diff > 1;

      chatEndRef.current?.scrollIntoView({ behavior: isInstant ? "auto" : "smooth" });
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, aiLoading, isScrolledUp]);

  const handleRegenerate = useCallback(
    (msg: Message) => {
      if (onRegenerate) {
        const originalIndex = messages.indexOf(msg);
        if (originalIndex !== -1) {
          onRegenerate(originalIndex);
        }
      }
    },
    [onRegenerate, messages]
  );

  const handleContinue = useCallback(
    (msg: Message) => {
      if (onContinue) {
        const originalIndex = messages.indexOf(msg);
        if (originalIndex !== -1) {
          onContinue(originalIndex);
        }
      }
    },
    [onContinue, messages]
  );

  const startEdit = useCallback((msg: Message) => {
    const originalIndex = messages.indexOf(msg);
    if (originalIndex !== -1) {
      setEditingIndex(originalIndex);
      setEditText(msg.txt || "");
      setEditIsImageRequest(msg.isImageRequest || false);
    }
  }, [messages]);

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditText("");
    setEditIsImageRequest(false);
  }, []);

  const saveEdit = useCallback(() => {
    if (editText.trim() && onEdit && editingIndex !== null) {
      onEdit(editingIndex, editText.trim(), editIsImageRequest);
      setEditingIndex(null);
      setEditText("");
      setEditIsImageRequest(false);
    }
  }, [editText, editIsImageRequest, editingIndex, onEdit]);

  const handleCopyMessage = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  // Resolves the character who actually said a given message - its
  // speakerId within `characters` (the room's full participant list) when
  // set, otherwise the chat's primary `character` (every message predating
  // this field, and every message in a plain 1:1 chat where speakerId always
  // just echoes the sole character anyway).
  const resolveSpeaker = useCallback(
    (msg: Message): Character | undefined => (msg.speakerId != null && characters?.find((c) => c.id === msg.speakerId)) || character,
    [characters, character]
  );

  const getInitials = (name?: string) => {
    if (!name || name === "New Chat" || name.trim() === "Chat") return "G";
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return "G";
  };
  const charInitials = getInitials(characterName);

  // Most recent AI message that reported an emotion - drives the "current
  // mood" portrait shown while a reply/follow-up is pending, distinct from
  // each individual message's own (historical) emotion below.
  const latestEmotionMessage = useMemo(() => {
    for (let i = filteredMessages.length - 1; i >= 0; i--) {
      if (filteredMessages[i].role !== YOU && filteredMessages[i].emotion) return filteredMessages[i];
    }
    return undefined;
  }, [filteredMessages]);
  const latestEmotion = latestEmotionMessage?.emotion;
  const currentEmotionImageSrc = resolveEmotionPortrait(character, latestEmotion);

  // Group-chat presence: dock every participant's current-mood portrait, not
  // just whoever spoke most recently - a multi-character room's whole mood
  // should be visible at a glance. Each character's own most recent
  // emotion-bearing message (resolveSpeaker follows the message's own
  // speakerId, same as roomRouting.ts uses to decide whose turn is next)
  // drives their own sprite.
  //
  // Unlike currentEmotionImageSrc above (which falls back to the character's
  // ordinary main avatar for the small typing/follow-up indicator, where an
  // opaque image is perfectly fine), the docked sprite panel must only ever
  // show a real, specifically-generated emotion portrait - those alone are
  // chroma-keyed to real transparency (portraitUtils.ts's
  // removeChromaKeyBackground). The main avatar is a normal opaque photo
  // with its own plain background baked into the pixels, which looked like
  // a boxed panel instead of blending with the page when it showed here.
  // "neutral" can have its own generated slot like any other mood
  // (emotionUtils.ts) - reading straight off images[emo] here (no
  // special-casing "neutral") means a character's sprite shows when one
  // exists and that character is simply skipped otherwise, same as any
  // other ungenerated mood.
  const dockedSprites = useMemo(() => {
    const roster = characters && characters.length > 0 ? characters : character ? [character] : [];
    const sprites: { imageSrc: string; characterName?: string; emotion?: string; characterId?: number }[] = [];
    for (const c of roster) {
      let emo: string | undefined;
      for (let i = filteredMessages.length - 1; i >= 0; i--) {
        const msg = filteredMessages[i];
        if (msg.role !== YOU && msg.emotion && resolveSpeaker(msg)?.id === c.id) {
          emo = msg.emotion;
          break;
        }
      }
      const imageSrc = c.emotionPortraits?.enabled && emo ? c.emotionPortraits.images[emo] : undefined;
      if (imageSrc) sprites.push({ imageSrc, characterName: c.name, emotion: emo, characterId: c.id });
    }
    return sprites;
  }, [characters, character, filteredMessages, resolveSpeaker]);

  const dispatch = useAppDispatch();
  const emotionPanelEnabled = useAppSelector((state) => state.settings.emotionPanelEnabled);
  const emotionPopupEnabled = useAppSelector((state) => state.settings.emotionPopupEnabled);
  const emotionPopupDuration = useAppSelector((state) => state.settings.emotionPopupDuration);

  // Pops a character's portrait up center-screen for a moment whenever their
  // mood actually changes mid-conversation - distinct from dockedSprites
  // above (the at-rest "current mood" state). prevEmotionsRef's first pass
  // over a freshly-opened chat only *records* each character's starting
  // mood (the `prev !== undefined` check) so opening a chat doesn't fire a
  // popup burst for moods that were already set before this render.
  const prevEmotionsRef = useRef<Map<number, string>>(new Map());
  const popupSeqRef = useRef(0);
  const [popupTrigger, setPopupTrigger] = useState<EmotionPopupTrigger | null>(null);
  useEffect(() => {
    for (const sprite of dockedSprites) {
      if (sprite.characterId == null || !sprite.emotion) continue;
      const prevEmotion = prevEmotionsRef.current.get(sprite.characterId);
      if (emotionPopupEnabled && prevEmotion !== undefined && prevEmotion !== sprite.emotion) {
        popupSeqRef.current += 1;
        setPopupTrigger({ ...sprite, key: popupSeqRef.current });
      }
      prevEmotionsRef.current.set(sprite.characterId, sprite.emotion);
    }
  }, [dockedSprites, emotionPopupEnabled]);

  return (
    <>
    <div className="relative h-full w-full flex overflow-hidden">
      <div className="flex-1 min-w-0 relative flex flex-col overflow-hidden">
        {character?.appearanceImages?.[0] && !terminal && (
          <>
            <div className="absolute inset-0 opacity-25 pointer-events-none overflow-hidden">
              <DisplayImage srcContext={character.appearanceImages[0]} alt="" aria-hidden="true" className="w-full h-full object-cover" />
            </div>
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-background/60 via-background/80 to-background" />
          </>
        )}
        <div
          className="relative z-[1] flex-1 overflow-auto"
          ref={scrollContainerRef}
          onScroll={handleScroll}
        >
          <div className={terminal ? "max-w-[760px] px-4 md:px-[26px] py-5" : "max-w-4xl mx-auto p-4 pb-32"}>
            {filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center h-full w-full px-4 pt-10">
                <Card className="flex flex-col items-center text-center gap-3 w-full max-w-[440px] px-5 py-8">
                  <CharacterAvatar name={charInitials} accent={character?.accent} imageSrc={character?.appearanceImages?.[0]} size={64} className="text-2xl" />
                  <div>
                    <div className="text-[19px] font-bold tracking-tight text-foreground">{characterName || "New Conversation"}</div>
                    {character?.relationship && (
                      <Badge variant="outline" className="mt-1 max-w-full truncate border-primary/20 bg-primary/10 font-medium text-primary">
                        {character.relationship}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                    {character?.description || "Send a message to get started."}
                  </p>
                </Card>
              </div>
            ) : (
              filteredMessages.map((msg, i) => {
                const siblingInfo = tree && msg.id ? getSiblingInfo(tree, msg.id) : undefined;
                const speaker = resolveSpeaker(msg);
                return (
                  <ChatMessage
                    key={msg.id || i}
                    msg={msg}
                    charInitials={speaker === character ? charInitials : getInitials(speaker?.name)}
                    speakerName={speaker?.name || characterName}
                    userName={userName}
                    accent={speaker?.accent}
                    avatarImageSrc={resolveEmotionPortrait(speaker, msg.emotion)}
                    aiLoading={aiLoading || false}
                    onCopy={handleCopyMessage}
                    onRegenerate={handleRegenerate}
                    onContinue={handleContinue}
                    isLastMessage={i === filteredMessages.length - 1}
                    onStartEdit={startEdit}
                    setFullscreenImage={setFullscreenImage}
                    siblingInfo={siblingInfo && siblingInfo.total > 1 ? siblingInfo : undefined}
                    onSwitchBranch={onSwitchBranch}
                    onDeleteBranch={onDeleteBranch}
                  />
                );
              })
            )}
            {terminal ? (
              aiLoading ? (
                <TerminalCursorLine name={characterName} />
              ) : isFollowupPending ? (
                <TerminalCursorLine name={characterName} note="thinking of reaching out..." />
              ) : null
            ) : aiLoading ? (
              <TypingIndicator charInitials={charInitials} accent={character?.accent} imageSrc={currentEmotionImageSrc} />
            ) : isFollowupPending ? (
              <FollowupIndicator charInitials={charInitials} accent={character?.accent} imageSrc={currentEmotionImageSrc} />
            ) : null}
            <div ref={chatEndRef} />
          </div>
        </div>
        {isScrolledUp && (
          <Button
            onClick={() => {
              setIsScrolledUp(false);
              chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
            size="icon"
            className="fixed bottom-24 right-6 z-50 h-11 w-11 rounded-full shadow-lg hover:scale-105 opacity-80 hover:opacity-100"
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
          >
            <FaArrowDown size={16} />
          </Button>
        )}
      </div>

      {emotionPanelEnabled && dockedSprites.length > 0 && (
        <EmotionSpritePanel sprites={dockedSprites} onClose={() => dispatch(setEmotionPanelEnabled(false))} />
      )}
      <EmotionPopup trigger={popupTrigger} durationMs={emotionPopupDuration} />

      {sceneOpen && chatId != null && (
        <ScenePanel
          chatId={chatId}
          character={character}
          isRoom={isRoom}
          chatMemory={chatMemory}
          chatScenario={chatScenario}
          authorNote={authorNote}
          worldTags={worldTags}
          onClose={onCloseScene || (() => {})}
        />
      )}

      {participantsOpen && chatId != null && characters && characters.length > 0 && (
        <ParticipantsPanel
          chatId={chatId}
          characters={characters}
          allCharacters={allCharacters}
          mutedParticipantIds={mutedParticipantIds}
          onClose={onCloseParticipants || (() => {})}
        />
      )}
    </div>

      {/* Full Screen Edit Modal */}
      <Dialog open={editingIndex !== null} onOpenChange={(open) => !open && cancelEdit()}>
        <DialogContent size="lg" className="h-[80vh] md:h-[70vh] p-0">
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <DialogTitle asChild>
              <h3 className="text-lg font-semibold text-foreground">Edit Message</h3>
            </DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-auto w-auto p-2 -m-2 rounded-full text-muted-foreground hover:bg-background hover:text-foreground">
                <FaTimes size={18} />
              </Button>
            </DialogClose>
          </div>

          <div className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col">
            <textarea
              ref={(el) => { if (el) el.focus() }}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="flex-1 w-full p-4 rounded-md border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none text-base disabled:opacity-50"
              placeholder="Type your message here..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
              }}
            />
            <div className="mt-2 text-xs text-muted-foreground flex flex-col sm:flex-row sm:justify-between gap-1">
              <span>Markdown is supported.</span>
              <span className="hidden sm:inline"><kbd className="bg-muted px-1.5 py-0.5 rounded">Enter</kbd> to save, <kbd className="bg-muted px-1.5 py-0.5 rounded">Shift+Enter</kbd> for new line, <kbd className="bg-muted px-1.5 py-0.5 rounded">Esc</kbd> to cancel</span>
            </div>
          </div>

          <div className="p-4 border-t border-border flex flex-col sm:flex-row justify-between gap-3 bg-background items-stretch sm:items-center flex-shrink-0">
            <ToggleSwitch
              checked={editIsImageRequest}
              onChange={setEditIsImageRequest}
              title="Request image generation"
              label="Generate Image"
            />

            <div className="flex gap-3">
              <Button
                onClick={cancelEdit}
                variant="ghost"
                className="flex-1 sm:flex-none h-auto px-5 py-2.5 font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                onClick={saveEdit}
                disabled={!editText.trim()}
                className="flex-1 sm:flex-none h-auto px-5 py-2.5 font-medium shadow-sm"
              >
                <FaCheck size={14} />
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Image Modal */}
      <Dialog open={fullscreenImage !== null} onOpenChange={(open) => !open && setFullscreenImage(null)}>
        <DialogContent size="full">
          <DialogTitle asChild>
            <span className="sr-only">Fullscreen image</span>
          </DialogTitle>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 h-auto w-auto p-3 rounded-full text-white/70 hover:bg-black/80 hover:text-white bg-black/50 z-10"
              title="Close"
            >
              <FaTimes size={20} />
            </Button>
          </DialogClose>
          {fullscreenImage && (
            <DisplayImage
              srcContext={fullscreenImage}
              alt="Fullscreen"
              className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ChatWindow;
