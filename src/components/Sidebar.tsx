import React, { useEffect, useState, useCallback, useMemo, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchChats, deleteChat, addChat, importChat, updateChatPinned } from "../features/chatSlice";
import { selectActivePersona } from "../features/settingsSlice";
import { fetchCharacters } from "../features/characterSlice";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { FaTrash, FaFileImport, FaPlus, FaSearch, FaThumbtack, FaUser, FaPencilAlt, FaChevronRight, FaCheck, FaUsers } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { useModal } from "../contexts/ModalContext";
import { useSidebar } from "../contexts/SidebarContext";
import Modal from "./Modal";
import { Chat, Character } from "../types";
import { cn } from "../utils/cn";
import { CharacterAvatar } from "./ui/CharacterAvatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { SegmentedControl } from "./settings/SegmentedControl";
import Logo from "./ui/Logo";
import { ThemeContext } from "../contexts/ThemeContext";
import { stripLeakedBase64 } from "../features/ai/utils/apiUtils";

const formatChatTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
};

// The snippet row is a single-line CSS `truncate` (clipped by rendered pixel
// width, not character count), so the match has to land near the start of the
// snippet string or it gets clipped away before it's ever visible. Keep the
// leading context short; the trailing context can be long since it just gets
// truncated off harmlessly.
const SNIPPET_BEFORE = 14;
const SNIPPET_AFTER = 60;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Highlights every case-insensitive occurrence of `query` inside `text`.
const HighlightedText = ({ text, query }: { text: string; query: string }) => {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-primary/25 text-foreground rounded-sm">{part}</mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

// Finds the first message whose text contains `query` (case-insensitive) and
// returns a short window of context around the match, WhatsApp-search style.
const findMessageSnippet = (chat: Chat, query: string): string | undefined => {
  const q = query.toLowerCase();
  for (const msg of chat.content || []) {
    const text = stripLeakedBase64(msg.txt || "").trim();
    if (!text) continue;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) continue;
    const start = Math.max(0, idx - SNIPPET_BEFORE);
    const end = Math.min(text.length, idx + q.length + SNIPPET_AFTER);
    return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  }
  return undefined;
};

const Sidebar = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { showConfirm } = useModal();
  const { isOpen, close } = useSidebar();
  const { colorTheme } = useContext(ThemeContext);
  const neumorphic = colorTheme === "neumorphic";

  const activeChatId = useMemo(() => {
    const match = location.pathname.match(/^\/chat\/(\d+)/);
    return match ? Number(match[1]) : null;
  }, [location.pathname]);

  const chats = useAppSelector((state) => state.chat.chats);
  const pendingFollowups = useAppSelector((state) => state.chat.pendingFollowups);
  const characters = useAppSelector((state) => state.character.characters);
  const activePersona = useAppSelector(selectActivePersona);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [characterSearch, setCharacterSearch] = useState("");
  // Room Creator (Phase 12) - lives inside the same "New chat" modal rather
  // than a separate flow, since picking who to talk to is the one thing
  // both a 1:1 chat and a group room start with.
  const [newChatMode, setNewChatMode] = useState<"single" | "group">("single");
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>([]);
  const [roomName, setRoomName] = useState("");
  const [roomScenario, setRoomScenario] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);

  const resetNewChatModal = () => {
    setCharacterSearch("");
    setNewChatMode("single");
    setSelectedCharacterIds([]);
    setRoomName("");
    setRoomScenario("");
  };

  const toggleCharacterSelection = (id: number) => {
    setSelectedCharacterIds((prev) => (prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id]));
  };

  useEffect(() => {
    dispatch(fetchChats());
    dispatch(fetchCharacters());
  }, [dispatch]);

  const handleDeleteChat = useCallback(async (chatId: number) => {
    const confirmed = await showConfirm("Delete Chat", "Are you sure you want to delete this chat?");
    if (confirmed) {
      dispatch(deleteChat(chatId));
      navigate("/");
      close();
    }
  }, [dispatch, navigate, showConfirm, close]);

  const handleTogglePin = useCallback((chatId: number, pinned: boolean) => {
    dispatch(updateChatPinned({ chatId, pinned: !pinned }));
  }, [dispatch]);

  const handleCharacterClick = useCallback(async (characterId: number, characterName: string) => {
    // The character's own 1:1 chat specifically - not just any room they
    // happen to be a member of - so this always resumes/creates the same
    // one-on-one conversation a tap on their card has always opened.
    const existingChat = chats.find((chat: Chat) => chat.characterIds?.length === 1 && chat.characterIds[0] === characterId);
    if (existingChat) {
      navigate(`/chat/${existingChat.id}`);
    } else {
      const result = await dispatch(addChat({ title: characterName, characterIds: [characterId] }));
      if (result.payload && (result.payload as Chat).id) {
        navigate(`/chat/${(result.payload as Chat).id}`);
      }
    }
    close();
  }, [chats, dispatch, navigate, close]);

  const handleCreateRoom = async () => {
    if (selectedCharacterIds.length < 2 || creatingRoom) return;
    setCreatingRoom(true);
    try {
      const selectedChars = selectedCharacterIds
        .map((id) => characters.find((c) => c.id === id))
        .filter((c): c is Character => Boolean(c));
      const title = roomName.trim() || selectedChars.map((c) => c.name).join(", ");
      const result = await dispatch(addChat({
        title,
        characterIds: selectedCharacterIds,
        authorNote: roomScenario.trim() || undefined,
      }));
      if (result.payload && (result.payload as Chat).id) {
        navigate(`/chat/${(result.payload as Chat).id}`);
      }
      setIsNewChatModalOpen(false);
      resetNewChatModal();
      close();
    } finally {
      setCreatingRoom(false);
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const chatData = JSON.parse(e.target?.result as string);
        const result = await dispatch(importChat(chatData)).unwrap();
        if (result && result.id) {
          navigate(`/chat/${result.id}`);
          close();
        }
      } catch (error) {
        console.error("Failed to import chat:", error);
        alert("Failed to import chat. Invalid file.");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const filteredChats = useMemo(() => {
    const q = search.trim();
    if (!q) return chats.map((chat) => ({ chat, snippet: undefined as string | undefined }));

    const lowerQ = q.toLowerCase();
    const results: { chat: Chat; snippet?: string }[] = [];
    for (const chat of chats) {
      // Any member's name counts as a match, not just the primary one - a
      // group room should be findable by any of its participants.
      const memberNames = (chat.characterIds || []).map((id) => characters.find((c) => c.id === id)?.name).filter(Boolean) as string[];
      const titleMatches = chat.title.toLowerCase().includes(lowerQ) || memberNames.some((name) => name.toLowerCase().includes(lowerQ));
      const snippet = titleMatches ? undefined : findMessageSnippet(chat, q);
      if (titleMatches || snippet) {
        results.push({ chat, snippet });
      }
    }
    return results;
  }, [chats, characters, search]);

  const pinnedItems = useMemo(() => filteredChats.filter((i) => i.chat.pinned), [filteredChats]);
  const unpinnedItems = useMemo(() => filteredChats.filter((i) => !i.chat.pinned), [filteredChats]);

  const filteredCharacters = useMemo(() => {
    const q = characterSearch.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter((c: Character) =>
      c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q)
    );
  }, [characters, characterSearch]);

  return (
    <>
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed z-50 top-0 left-0 w-[300px] h-full flex flex-col transition-transform transform md:relative md:translate-x-0",
          // Canvas spec: "custom aside ... no shadcn Sidebar - its border-and-
          // panel model fights the soft ground." Cozy keeps the bordered card
          // look; neumorphic sits flush with the page instead.
          neumorphic ? "bg-background" : "bg-card border-r border-border/40",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Sidebar"
      >
        {/* Logo header - h-[60px] to match Header.tsx so the border-b seam lines up */}
        <div className="h-[60px] px-4 flex items-center gap-3 border-b border-border/40 flex-shrink-0">
          <Logo size={34} className="shadow-[0_6px_18px_rgb(var(--primary)/0.35)] rounded-full flex-shrink-0" />
          <div className="leading-tight flex-1 min-w-0">
            <div className="font-bold text-[16px] tracking-tight text-foreground">WhatsGemini</div>
            <div className="text-[11px] text-subtle font-medium">Your characters, your stories</div>
          </div>
        </div>

        {/* New chat / Import */}
        <div className="px-4 pt-4 pb-2.5 flex gap-2 flex-shrink-0">
          <Button
            onClick={() => setIsNewChatModalOpen(true)}
            variant="default"
            className="flex-1 h-auto py-[11px] text-[13.5px] font-semibold shadow-[0_8px_20px_rgb(var(--primary)/0.28)]"
          >
            <FaPlus size={12} />
            <span>New chat</span>
          </Button>
          <Button
            onClick={handleImportClick}
            variant="panel"
            size="icon"
            title="Import chat"
            aria-label="Import chat"
            className="h-auto w-[42px] py-[11px] text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <FaFileImport size={14} />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            style={{ display: "none" }}
          />
        </div>

        {/* Search */}
        <div className="px-4 pb-3.5 flex-shrink-0">
          <div className="relative">
            <FaSearch size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats and messages"
              aria-label="Search chats and messages"
              className="pl-8 text-[12.5px] rounded-lg bg-background border-border/10 shadow-none"
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2.5">
          {search.trim() && filteredChats.length === 0 ? (
            <p className="text-center text-subtle text-[12.5px] px-3 py-6">No chats or messages match "{search.trim()}".</p>
          ) : (
            <>
              {pinnedItems.length > 0 && (
                <>
                  <div className="text-[10.5px] font-semibold tracking-[0.09em] uppercase text-subtle px-3 pt-2 pb-1.5">
                    Pinned
                  </div>
                  <ChatList items={pinnedItems} characters={characters} onDeleteChat={handleDeleteChat} onTogglePin={handleTogglePin} onNavigate={close} query={search.trim()} activeChatId={activeChatId} pendingFollowups={pendingFollowups} />
                </>
              )}
              {unpinnedItems.length > 0 && (
                <>
                  <div className="text-[10.5px] font-semibold tracking-[0.09em] uppercase text-subtle px-3 pt-2 pb-1.5">
                    {pinnedItems.length > 0 ? "Other chats" : "Recent"}
                  </div>
                  <ChatList items={unpinnedItems} characters={characters} onDeleteChat={handleDeleteChat} onTogglePin={handleTogglePin} onNavigate={close} query={search.trim()} activeChatId={activeChatId} pendingFollowups={pendingFollowups} />
                </>
              )}
            </>
          )}
        </div>

        {/* Your persona - links into Settings' User Profile section */}
        <Link
          to="/settings"
          state={{ openSection: "profile" }}
          onClick={close}
          className={cn(
            "flex-shrink-0 flex items-center gap-3 px-4 py-3 group hover:bg-hover transition",
            !neumorphic && "border-t border-border/40"
          )}
        >
          <div className="w-[34px] h-[34px] rounded-full bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
            <FaUser size={14} />
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[13px] font-semibold text-foreground truncate">
              {activePersona?.name?.trim() || "Your persona"}
            </div>
            <div className="text-[11.5px] text-subtle truncate mt-0.5">
              {activePersona?.bio?.trim() || "Set up your name and bio"}
            </div>
          </div>
          <FaPencilAlt size={12} className="text-subtle group-hover:text-foreground flex-shrink-0 transition" />
        </Link>
      </aside>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-black z-40 md:hidden"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      {/* New Chat Modal - also the Room Creator (Phase 12), toggled into
          "group" mode below rather than a separate flow */}
      <Modal
        isOpen={isNewChatModalOpen}
        onClose={() => {
          setIsNewChatModalOpen(false);
          resetNewChatModal();
        }}
        title={newChatMode === "group" ? "Start a group chat" : "Who do you want to talk to?"}
        subtitle={newChatMode === "group" ? "Pick everyone who should be in the room." : "Pick a character to start a new chat."}
      >
        {characters.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-muted-foreground mb-3">No characters available yet.</p>
            <Button
              onClick={() => {
                setIsNewChatModalOpen(false);
                navigate("/characters/new");
              }}
              variant="default"
              size="sm"
            >
              <FaPlus size={11} />
              <span>Create a character</span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {characters.length > 1 && (
              <SegmentedControl
                value={newChatMode}
                onChange={(v) => {
                  setNewChatMode(v as "single" | "group");
                  setSelectedCharacterIds([]);
                }}
                options={[
                  { value: "single", label: "1:1 chat" },
                  { value: "group", label: <span className="inline-flex items-center gap-1.5"><FaUsers size={11} /> Group chat</span> },
                ]}
                className="self-start"
              />
            )}
            <div className="relative">
              <FaSearch size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <Input
                value={characterSearch}
                onChange={(e) => setCharacterSearch(e.target.value)}
                placeholder="Search your cast"
                aria-label="Search your cast"
                className="pl-8 text-[13px] bg-background border-border/10 shadow-none"
                autoFocus
              />
            </div>
            {filteredCharacters.length === 0 ? (
              <p className="text-muted-foreground text-center py-4 text-sm">No characters match "{characterSearch.trim()}".</p>
            ) : (
              <div className="max-h-[280px] overflow-y-auto flex flex-col gap-2">
                {filteredCharacters.map((char: Character) => {
                  const isSelected = selectedCharacterIds.includes(char.id);
                  return (
                    <Button
                      key={char.id}
                      onClick={() => {
                        if (newChatMode === "group") {
                          toggleCharacterSelection(char.id);
                          return;
                        }
                        setIsNewChatModalOpen(false);
                        resetNewChatModal();
                        handleCharacterClick(char.id, char.name);
                      }}
                      variant="ghost"
                      className={cn(
                        "w-full h-auto justify-start gap-3 p-3 rounded-lg text-left font-normal",
                        newChatMode === "group" && isSelected && "bg-primary/10"
                      )}
                    >
                      {newChatMode === "group" && (
                        <span
                          className={cn(
                            "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition",
                            isSelected ? "bg-primary border-primary" : "border-border"
                          )}
                        >
                          {isSelected && <FaCheck size={10} className="text-primary-foreground" />}
                        </span>
                      )}
                      <CharacterAvatar name={char.name} accent={char.accent} size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[14.5px] text-foreground truncate">{char.name}</h3>
                          {char.relationship && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0">
                              {char.relationship}
                            </span>
                          )}
                        </div>
                        {char.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{char.description}</p>
                        )}
                      </div>
                      {newChatMode === "single" && <FaChevronRight size={13} className="text-subtle flex-shrink-0" />}
                    </Button>
                  );
                })}
              </div>
            )}

            {newChatMode === "group" && selectedCharacterIds.length >= 2 && (
              <div className="flex flex-col gap-2.5 pt-3 mt-1 border-t border-border/40">
                <Input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder={characters.filter((c) => selectedCharacterIds.includes(c.id)).map((c) => c.name).join(", ")}
                  aria-label="Room name"
                  className="text-[13px] bg-background border-border/10 shadow-none"
                />
                <Textarea
                  value={roomScenario}
                  onChange={(e) => setRoomScenario(e.target.value)}
                  placeholder="Scenario / scene setting (optional) - shared context every character in the room will see"
                  aria-label="Room scenario"
                  className="min-h-[64px] text-[13px] bg-background border-border/10 shadow-none resize-none"
                />
                <Button
                  onClick={handleCreateRoom}
                  disabled={creatingRoom}
                  variant="default"
                  className="h-auto py-2.5 text-[13.5px] font-semibold"
                >
                  <FaUsers size={12} />
                  {creatingRoom ? "Creating..." : `Create Room (${selectedCharacterIds.length})`}
                </Button>
              </div>
            )}
            {newChatMode === "group" && selectedCharacterIds.length === 1 && (
              <p className="text-xs text-subtle text-center pt-1">Pick at least one more character to start a group chat.</p>
            )}
          </div>
        )}
        {characters.length > 0 && newChatMode === "single" && (
          <div className="flex items-center gap-2 pt-3 mt-1 border-t border-border/40 text-[13px] text-muted-foreground">
            <FaPlus size={12} className="text-primary flex-shrink-0" />
            <span>
              Someone new?{" "}
              <button
                type="button"
                onClick={() => {
                  setIsNewChatModalOpen(false);
                  navigate("/characters/new");
                }}
                className="font-medium text-primary hover:underline"
              >
                Create a character
              </button>
            </span>
          </div>
        )}
      </Modal>
    </>
  );
};

const ChatList = ({ items, characters, onDeleteChat, onTogglePin, onNavigate, query, activeChatId, pendingFollowups }: { items: { chat: Chat; snippet?: string }[], characters: Character[], onDeleteChat: (id: number) => void, onTogglePin: (id: number, pinned: boolean) => void, onNavigate: () => void, query: string, activeChatId: number | null, pendingFollowups: Record<number, number> }) => {
  const { colorTheme } = useContext(ThemeContext);
  const neumorphic = colorTheme === "neumorphic";
  return (
    <div className="flex-1 flex flex-col gap-0.5">
      {items.map(({ chat, snippet }) => {
        // The row's avatar/subtitle show the primary (first) member - a
        // group room's own participant strip (Phase 12) is where the rest
        // of the cast actually shows up.
        const character = characters.find((c) => c.id === chat.characterIds?.[0]);
        const isActive = chat.id === activeChatId;
        // "Typing..." only ever applies to the chat currently open in this tab
        // (autonomous follow-ups aren't scheduled for closed chats), while
        // "Waiting for you" is derived straight from the persisted follow-up
        // streak, so it shows correctly for any chat in the list.
        const isFollowupTyping = Boolean(pendingFollowups[chat.id]);
        const isWaitingForUser = Boolean(
          chat.autoReply?.enabled && chat.autoReply.followupCount >= chat.autoReply.maxFollowups
        );

        return (
          <Link
            to={`/chat/${chat.id}`}
            key={chat.id}
            onClick={onNavigate}
            className={cn(
              "relative flex items-center gap-3 p-2.5 rounded-lg cursor-pointer group transition",
              // Canvas spec: "Active row is the only one with shadow-inset;
              // the rest are transparent."
              isActive ? (neumorphic ? "shadow-inset" : "bg-secondary") : "hover:bg-hover"
            )}
          >
            {isActive && (
              <span className="absolute left-[-8px] top-[14%] bottom-[14%] w-[3px] rounded-full bg-primary" />
            )}
            <CharacterAvatar name={character?.name || chat.title} accent={character?.accent} size={34} />
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="flex-1 min-w-0 text-foreground font-semibold text-[13.5px] truncate">
                  <HighlightedText text={chat.title} query={query} />
                </span>
                {isFollowupTyping ? (
                  <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0">
                    Typing...
                  </span>
                ) : isWaitingForUser ? (
                  <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                    Waiting for you
                  </span>
                ) : (
                  <span className="text-[10.5px] text-ink-faint flex-shrink-0">{formatChatTime(chat.timestamp)}</span>
                )}
              </div>
              {snippet ? (
                <span className="text-xs text-muted-foreground truncate">
                  <HighlightedText text={snippet} query={query} />
                </span>
              ) : character?.description ? (
                <span className="text-xs text-muted-foreground truncate">{character.description}</span>
              ) : null}
            </div>
            <Button
              onClick={(e) => { e.preventDefault(); onTogglePin(chat.id, Boolean(chat.pinned)); }}
              variant="ghost"
              size="icon"
              className={cn(
                "h-auto w-auto p-1.5 rounded-lg flex-shrink-0",
                chat.pinned
                  ? "text-primary hover:bg-transparent"
                  : "text-ink-faint opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10"
              )}
              title={chat.pinned ? "Unpin chat" : "Pin chat"}
              aria-label={chat.pinned ? `Unpin chat with ${chat.title}` : `Pin chat with ${chat.title}`}
            >
              <FaThumbtack size={12} />
            </Button>
            <Button
              onClick={(e) => { e.preventDefault(); onDeleteChat(chat.id); }}
              variant="ghost"
              size="icon"
              className="h-auto w-auto p-1.5 rounded-lg text-ink-faint hover:text-red-500 hover:bg-red-500/10 flex-shrink-0"
              title="Delete Chat"
              aria-label={`Delete chat with ${chat.title}`}
            >
              <FaTrash size={12} />
            </Button>
          </Link>
        );
      })}
    </div>
  );
};

export default Sidebar;
