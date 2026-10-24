import React, { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchChats, deleteChat, addChat, importChat, updateChatPinned, updateChatOptions } from "../../features/chatSlice";
import { selectActivePersona } from "../../features/settingsSlice";
import { fetchCharacters } from "../../features/characterSlice";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { FaFileImport, FaPlus, FaSearch, FaThumbtack, FaPencilAlt, FaChevronRight, FaCheck, FaUsers, FaAngleDoubleLeft, FaAngleDoubleRight, FaArrowLeft, FaArchive, FaVolumeMute, FaChevronDown } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { useModal } from "../../contexts/ModalContext";
import { useSidebar } from "../../contexts/SidebarContext";
import Modal from "src/components/molecules/Modal";
import { Chat, Character } from "../../types";
import { cn } from "../../utils/cn";
import { CharacterAvatar, getInitials } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";
import { Input } from "src/components/atoms/input";
import { Textarea } from "src/components/atoms/textarea";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { Tooltip, TooltipTrigger, TooltipContent } from "src/components/atoms/tooltip";
import Logo from "src/components/atoms/Logo";
import { useColorTheme } from "../../hooks/useColorTheme";
import { stripLeakedBase64 } from "../../features/ai/utils/apiUtils";
import { isNsfwCharacter } from "../../features/character/contentRating";
import { StatusStrip } from "./StatusStrip";
import { hasUnseenStatus } from "../../features/character/statusUpdates";
import { useStatusReply } from "../../hooks/useStatusReply";
import { lastPreview, splitArchived, unreadCount } from "../../features/chat/chatList";
import { TAB_BAR_HEIGHT, usePhoneShell } from "../../hooks/usePhoneShell";
import { MdOutlineAddComment } from "react-icons/md";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "src/components/molecules/dropdown-menu";

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
    // A voice note (#44) says so, like WhatsApp's "🎤 Voice message".
    return `${msg.isVoiceNote ? "🎤 Voice message: " : ""}${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  }
  return undefined;
};

const Sidebar = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { showConfirm } = useModal();
  const { isOpen, close, collapsed, toggleCollapsed } = useSidebar();
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const terminal = is("terminal");
  // The phone-style shell (#114): on "/" the chat list is the home screen,
  // full width above the tab bar, with WhatsApp's title row and a new-chat
  // button in the corner; statuses move to the Updates tab.
  const shell = usePhoneShell();
  const home = shell && location.pathname === "/";

  const activeChatId = useMemo(() => {
    const match = location.pathname.match(/^\/chat\/(\d+)/);
    return match ? Number(match[1]) : null;
  }, [location.pathname]);

  const chats = useAppSelector((state) => state.chat.chats);
  const pendingFollowups = useAppSelector((state) => state.chat.pendingFollowups);
  const characters = useAppSelector((state) => state.character.characters);
  const showNsfwCharacters = useAppSelector((state) => state.settings.showNsfwCharacters);
  const activePersona = useAppSelector(selectActivePersona);
  const personaName = activePersona?.name?.trim();
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

  // The drawer's own links close it, but navigation can also come from
  // back/forward, a link elsewhere on the page or a keyboard shortcut - and
  // the open drawer would then cover the new page. The key alone isn't
  // enough: history entries made outside the router (a plain hash change)
  // all share the key "default", so the path is watched too.
  useEffect(() => {
    close();
  }, [location.pathname, location.search, location.key, close]);

  const handleDeleteChat = useCallback(async (chatId: number) => {
    const confirmed = await showConfirm("Delete Chat", "Are you sure you want to delete this chat?");
    if (confirmed) {
      dispatch(deleteChat(chatId));
      navigate("/");
      close();
    }
  }, [dispatch, navigate, showConfirm, close]);

  // Replying to a status (#8): the character's 1:1 chat, with the status
  // quoted in the composer.
  const statusCharacters = useMemo(
    () => (showNsfwCharacters ? characters : characters.filter((c: Character) => !isNsfwCharacter(c))),
    [characters, showNsfwCharacters]
  );
  const handleStatusReply = useStatusReply(close);

  const handleTogglePin = useCallback((chatId: number, pinned: boolean) => {
    dispatch(updateChatPinned({ chatId, pinned: !pinned }));
  }, [dispatch]);
  // A WhatsApp chat list (#115): mute and archive from a row's menu.
  const handleToggleMute = useCallback((chatId: number, muted: boolean) => {
    dispatch(updateChatOptions({ chatId, patch: { muted: !muted || undefined } }));
  }, [dispatch]);
  const handleToggleArchive = useCallback((chatId: number, archived: boolean) => {
    dispatch(updateChatOptions({ chatId, patch: { archived: !archived || undefined } }));
  }, [dispatch]);
  const [showArchived, setShowArchived] = useState(false);

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

  const { shown: listedItems, archived: archivedItems } = useMemo(() => splitArchived(filteredChats, Boolean(search.trim())), [filteredChats, search]);
  const viewingArchived = showArchived && archivedItems.length > 0 && !search.trim();
  // WhatsApp's filter chips on the home screen (#114): all, unread, groups.
  const [listFilter, setListFilter] = useState<"all" | "unread" | "groups">("all");
  const filterOn = home && !viewingArchived ? listFilter : "all";
  const visibleItems = (viewingArchived ? archivedItems : listedItems).filter((i) =>
    filterOn === "unread" ? unreadCount(i.chat) > 0 : filterOn === "groups" ? (i.chat.characterIds?.length || 0) > 1 : true
  );
  const pinnedItems = useMemo(() => visibleItems.filter((i) => i.chat.pinned), [visibleItems]);
  const unpinnedItems = useMemo(() => visibleItems.filter((i) => !i.chat.pinned), [visibleItems]);
  const archivedUnread = archivedItems.filter((i) => unreadCount(i.chat) > 0).length;

  // The new-chat picker honors the gallery's "Show NSFW" switch; the chat
  // list above still resolves every chat's character regardless.
  const filteredCharacters = useMemo(() => {
    const visible = showNsfwCharacters ? characters : characters.filter((c: Character) => !isNsfwCharacter(c));
    const q = characterSearch.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((c: Character) =>
      c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q)
    );
  }, [characters, characterSearch, showNsfwCharacters]);

  return (
    <>
      {/* Sidebar - docked from lg (1024px) up, an off-canvas drawer below
          that. Docking it from md (768px) left a tablet's chat header so
          little room that the title shrank to "A.." under a row of icons. */}
      <aside
        className={cn(
          "fixed z-50 top-0 left-0 w-[300px] h-full flex flex-col transition-[transform,width] duration-200 transform lg:relative lg:translate-x-0",
          // Canvas spec: "custom aside ... no shadcn Sidebar - its border-and-
          // panel model fights the soft ground." Cozy keeps the bordered card
          // look; neumorphic sits flush with the page instead.
          neumorphic ? "bg-background" : "bg-card border-r border-border/40",
          // Collapse is a desktop-only concept (an icon rail) - mobile always
          // shows the full 300px drawer when opened regardless of this flag,
          // so every `collapsed` class below is paired with `lg:`.
          collapsed && "lg:w-[76px]",
          isOpen ? "translate-x-0" : "-translate-x-full",
          home && "!fixed !inset-x-0 !top-0 !w-full !h-auto !translate-x-0 z-30 border-r-0"
        )}
        style={home ? { bottom: TAB_BAR_HEIGHT } : undefined}
        aria-label="Sidebar"
        data-home={home ? "true" : undefined}
      >
        {home && (
          <div className="h-[60px] px-4 flex items-center gap-2 flex-shrink-0" data-slot="home-title">
            <h1 className="flex-1 text-[22px] font-bold tracking-tight text-primary">WhatsGemini</h1>
            <Button onClick={handleImportClick} variant="ghost" size="icon" title="Import chat" aria-label="Import chat" className="h-10 w-10 rounded-full text-muted-foreground">
              <FaFileImport size={16} />
            </Button>
            <Link to="/settings/profile" aria-label="Your profile" title="Your profile" className="rounded-full">
              <CharacterAvatar name={personaName || "You"} imageSrc={activePersona?.avatar} size={32} />
            </Link>
          </div>
        )}
        {/* Logo header - h-[60px] to match Header.tsx so the border-b seam lines up */}
        <div className={cn("h-[60px] px-4 flex items-center gap-3 border-b border-border/40 flex-shrink-0", collapsed && "lg:px-2.5", home && "hidden")}>
          <Logo size={34} className="shadow-[0_6px_18px_rgb(var(--primary)/0.35)] rounded-full flex-shrink-0" />
          {terminal ? (
            <div className={cn("leading-tight flex-1 min-w-0", collapsed && "lg:hidden")}>
              <div className="font-bold text-[12px] text-foreground truncate">whatsgemini@local</div>
              <div className="text-[10px] text-muted-foreground truncate lowercase"># session: {personaName || "guest"}</div>
            </div>
          ) : (
            <div className={cn("leading-tight flex-1 min-w-0", collapsed && "lg:hidden")}>
              <div className="font-bold text-[16px] tracking-tight text-foreground">WhatsGemini</div>
              <div className="text-[11px] text-subtle font-medium">Your characters, your stories</div>
            </div>
          )}
          {/* Desktop-only icon-rail collapse toggle - mobile relies on the
              overlay/Header hamburger instead, so this never shows there. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={toggleCollapsed}
                variant="ghost"
                size="icon"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="hidden lg:inline-flex h-auto w-auto p-1.5 rounded-lg text-subtle hover:text-foreground flex-shrink-0"
              >
                {collapsed ? <FaAngleDoubleRight size={13} /> : <FaAngleDoubleLeft size={13} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
          </Tooltip>
        </div>

        {/* New chat / Import */}
        <div className={cn("px-4 pt-4 pb-2.5 flex gap-2 flex-shrink-0", collapsed && "lg:px-2.5 lg:justify-center", home && "hidden")}>
          {terminal ? (
            <Button
              onClick={() => setIsNewChatModalOpen(true)}
              variant="outline"
              title="New chat"
              aria-label="New chat"
              className={cn("flex-1 h-auto py-[9px] text-[12px] border-border-bright text-foreground normal-case", collapsed && "lg:flex-none lg:px-[9px]")}
            >
              {collapsed ? "[+]" : "[+] new_chat.sh"}
            </Button>
          ) : (
            <Button
              onClick={() => setIsNewChatModalOpen(true)}
              variant="default"
              title="New chat"
              aria-label="New chat"
              className={cn(
                "flex-1 h-auto py-[11px] text-[13.5px] font-semibold shadow-[0_8px_20px_rgb(var(--primary)/0.28)]",
                collapsed && "lg:flex-none lg:w-[42px] lg:px-0 lg:justify-center"
              )}
            >
              <FaPlus size={12} />
              <span className={cn(collapsed && "lg:hidden")}>New chat</span>
            </Button>
          )}
          {terminal ? (
            <Button onClick={handleImportClick} variant="outline" title="Import chat" aria-label="Import chat" className={cn("h-auto py-[9px] px-3 text-[12px] flex-shrink-0", collapsed && "lg:hidden")}>
              import
            </Button>
          ) : (
          <Button
            onClick={handleImportClick}
            variant="panel"
            size="icon"
            title="Import chat"
            aria-label="Import chat"
            className={cn("h-auto w-[42px] py-[11px] text-muted-foreground hover:text-foreground flex-shrink-0", collapsed && "lg:hidden")}
          >
            <FaFileImport size={14} />
          </Button>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            style={{ display: "none" }}
          />
        </div>

        {/* Search - dropped from the collapsed rail; expand to search again */}
        <div className={cn("px-4 pb-3.5 flex-shrink-0", collapsed && "lg:hidden")}>
          {terminal ? (
            <div className="flex items-center gap-2 border border-border px-2.5 text-[12px] focus-within:border-ring">
              <span className="text-muted-foreground flex-none">grep&gt;</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search chats..."
                aria-label="Search chats and messages"
                className="flex-1 min-w-0 bg-transparent outline-none py-[7px] text-foreground placeholder:text-subtle"
              />
            </div>
          ) : (
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
          )}
        </div>

        {home && !search.trim() && !viewingArchived && (
          <div role="group" aria-label="Filter chats" className="px-4 pb-2.5 flex gap-2 flex-shrink-0">
            {(["all", "unread", "groups"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={listFilter === f}
                onClick={() => setListFilter(f)}
                className={cn("px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors", listFilter === f ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground")}
              >
                {f === "all" ? "All" : f === "unread" ? "Unread" : "Groups"}
              </button>
            ))}
          </div>
        )}

        {/* Chat list */}
        <div className={cn("flex-1 overflow-y-auto px-2 pb-2.5", collapsed && "lg:px-1.5")}>
          {/* Collapsing only applies from lg up, so below that the full row
              shows even when the sidebar is set to collapsed. */}
          {!terminal && !search.trim() && !home && (
            <div className={cn(collapsed && "lg:hidden")}>
              <StatusStrip characters={statusCharacters} onReply={handleStatusReply} />
            </div>
          )}
          {collapsed && !terminal && !search.trim() && (
            <div className="hidden lg:block">
              <StatusStrip characters={statusCharacters} onReply={handleStatusReply} compact />
            </div>
          )}
          {/* Archived chats (#115): one row at the top opens them. */}
          {!search.trim() && archivedItems.length > 0 && (
            viewingArchived ? (
              <button type="button" onClick={() => setShowArchived(false)} className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-[13.5px] font-semibold text-foreground hover:bg-hover rounded-lg", collapsed && "lg:hidden")} aria-label="Back to chats">
                <FaArrowLeft size={12} className="text-subtle" />
                Archived
              </button>
            ) : (
              <button type="button" onClick={() => setShowArchived(true)} className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-[13.5px] text-foreground hover:bg-hover rounded-lg", collapsed && "lg:hidden")} aria-label={`Archived, ${archivedItems.length} ${archivedItems.length === 1 ? "chat" : "chats"}`}>
                <FaArchive size={13} className="text-primary w-[34px]" />
                <span className="flex-1 text-left font-medium">Archived</span>
                <span className={cn("text-[12px]", archivedUnread > 0 ? "font-semibold text-primary" : "text-subtle")}>{archivedUnread > 0 ? archivedUnread : archivedItems.length}</span>
              </button>
            )
          )}
          {search.trim() && filteredChats.length === 0 ? (
            <p className={cn("text-center text-subtle text-[12.5px] px-3 py-6", collapsed && "lg:hidden")}>No chats or messages match "{search.trim()}".</p>
          ) : (
            <>
              {pinnedItems.length > 0 && (
                <>
                  <div className={cn("text-[10.5px] font-semibold tracking-[0.09em] uppercase text-subtle px-3 pt-2 pb-1.5", collapsed && "lg:hidden", home && "sr-only")}>
                    {terminal ? <span className="normal-case tracking-normal font-normal text-[10px] text-muted-foreground"># pinned</span> : "Pinned"}
                  </div>
                  <ChatList items={pinnedItems} characters={characters} onDeleteChat={handleDeleteChat} onTogglePin={handleTogglePin} onToggleMute={handleToggleMute} onToggleArchive={handleToggleArchive} onNavigate={close} query={search.trim()} activeChatId={activeChatId} pendingFollowups={pendingFollowups} collapsed={collapsed} />
                </>
              )}
              {unpinnedItems.length > 0 && (
                <>
                  <div className={cn("text-[10.5px] font-semibold tracking-[0.09em] uppercase text-subtle px-3 pt-2 pb-1.5", collapsed && "lg:hidden", home && "sr-only")}>
                    {terminal ? (
                      <span className="normal-case tracking-normal font-normal text-[10px] text-muted-foreground"># ls ~/chats -lt</span>
                    ) : pinnedItems.length > 0 ? "Other chats" : "Recent"}
                  </div>
                  <ChatList items={unpinnedItems} characters={characters} onDeleteChat={handleDeleteChat} onTogglePin={handleTogglePin} onToggleMute={handleToggleMute} onToggleArchive={handleToggleArchive} onNavigate={close} query={search.trim()} activeChatId={activeChatId} pendingFollowups={pendingFollowups} collapsed={collapsed} />
                </>
              )}
            </>
          )}
        </div>

        {/* Your persona - links into Settings' User Profile section; the
            home screen has the avatar in its title row instead. */}
        {home ? (
          <Button
            onClick={() => setIsNewChatModalOpen(true)}
            title="New chat"
            aria-label="New chat"
            data-slot="new-chat-fab"
            className="absolute right-4 bottom-4 h-14 w-14 rounded-2xl p-0 shadow-[0_4px_14px_rgb(0_0_0/0.25)]"
          >
            <MdOutlineAddComment size={24} />
          </Button>
        ) : terminal ? (
          <Link
            to="/settings/profile"
            onClick={close}
            title={collapsed ? `whoami: ${personaName || "guest"}` : undefined}
            className={cn(
              "flex-shrink-0 mx-4 mb-4 mt-2 flex items-center gap-2.5 p-2.5 border border-border hover:border-border-bright transition-colors",
              collapsed && "lg:mx-2.5 lg:justify-center lg:px-2.5"
            )}
          >
            <CharacterAvatar
              name={personaName}
              imageSrc={activePersona?.avatar}
              size={24}
              className="rounded-none border border-border-bright text-[10px] font-extrabold"
            />
            <div className={cn("flex-1 min-w-0 leading-tight", collapsed && "lg:hidden")}>
              <div className="text-[11px] font-bold text-foreground truncate lowercase">whoami: {personaName || "guest"}</div>
              <div className="text-[10px] text-muted-foreground truncate mt-0.5"># {activePersona?.bio?.trim() || "set up your name and bio"}</div>
            </div>
          </Link>
        ) : (
        <Link
          to="/settings/profile"
          onClick={close}
          title={collapsed ? activePersona?.name?.trim() || "Your persona" : undefined}
          className={cn(
            "flex-shrink-0 flex items-center gap-3 px-4 py-3 group hover:bg-hover transition",
            !neumorphic && "border-t border-border/40",
            collapsed && "lg:justify-center lg:px-2.5"
          )}
        >
          <CharacterAvatar name={activePersona?.name} imageSrc={activePersona?.avatar} size={34} />
          <div className={cn("flex-1 min-w-0 leading-tight", collapsed && "lg:hidden")}>
            <div className="text-[13px] font-semibold text-foreground truncate">
              {activePersona?.name?.trim() || "Your persona"}
            </div>
            <div className="text-[11.5px] text-subtle truncate mt-0.5">
              {activePersona?.bio?.trim() || "Set up your name and bio"}
            </div>
          </div>
          <FaPencilAlt size={12} className={cn("text-subtle group-hover:text-foreground flex-shrink-0 transition", collapsed && "lg:hidden")} />
        </Link>
        )}
      </aside>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-black z-40 lg:hidden"
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
                      <CharacterAvatar name={char.name} accent={char.accent} imageSrc={char.appearanceImages?.[0]} size={40} />
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

const ChatList = ({ items, characters, onDeleteChat, onTogglePin, onToggleMute, onToggleArchive, onNavigate, query, activeChatId, pendingFollowups, collapsed }: { items: { chat: Chat; snippet?: string }[], characters: Character[], onDeleteChat: (id: number) => void, onTogglePin: (id: number, pinned: boolean) => void, onToggleMute: (id: number, muted: boolean) => void, onToggleArchive: (id: number, archived: boolean) => void, onNavigate: () => void, query: string, activeChatId: number | null, pendingFollowups: Record<number, number>, collapsed: boolean }) => {
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const terminal = is("terminal");
  const privacy = useAppSelector((state) => state.settings.privacy);
  return (
    <div className="flex-1 flex flex-col gap-0.5">
      {items.map(({ chat, snippet }) => {
        // The row's avatar/subtitle show the primary (first) member - a
        // group room's own participant strip (Phase 12) is where the rest
        // of the cast actually shows up.
        const character = characters.find((c) => c.id === chat.characterIds?.[0]);
        const isActive = chat.id === activeChatId;
        const members = (chat.characterIds || []).map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));
        const isNsfwChat = members.some(isNsfwCharacter);
        // Discreet mode drops the NSFW chat's preview line; blur mode drops
        // its portrait back to initials (too small to usefully tap-reveal).
        const hidePreview = privacy.discreetMode && isNsfwChat && !snippet;
        const avatarSrc = privacy.blurNsfwMedia && isNsfwChat ? undefined : character?.appearanceImages?.[0];
        // "Typing..." only ever applies to the chat currently open in this tab
        // (autonomous follow-ups aren't scheduled for closed chats), while
        // "Waiting for you" is derived straight from the persisted follow-up
        // streak, so it shows correctly for any chat in the list.
        const isFollowupTyping = Boolean(pendingFollowups[chat.id]);
        const isWaitingForUser = Boolean(
          chat.autoReply?.enabled && chat.autoReply.followupCount >= chat.autoReply.maxFollowups
        );
        // A WhatsApp chat list (#115): unread replies (none for the chat
        // you're in), the last message's preview, with ticks on yours.
        const unread = isActive ? 0 : unreadCount(chat);
        const preview = hidePreview ? undefined : lastPreview(chat);
        const previewSpeaker = preview && !preview.fromYou && members.length > 1 ? members.find((m) => m.id === preview.speakerId)?.name : undefined;

        return (
          <Link
            to={`/chat/${chat.id}`}
            key={chat.id}
            onClick={onNavigate}
            title={collapsed ? chat.title : undefined}
            className={cn(
              "relative flex items-center gap-3 p-2.5 rounded-lg cursor-pointer group transition",
              terminal
                ? cn("gap-2.5 p-2", isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-primary/10")
                : // Canvas spec: "Active row is the only one with surface-sunken;
                  // the rest are transparent."
                  isActive ? (neumorphic ? "surface-sunken" : "bg-secondary") : "hover:bg-hover",
              collapsed && "lg:justify-center lg:px-0"
            )}
          >
            {isActive && !terminal && (
              <span className={cn("absolute left-[-8px] top-[14%] bottom-[14%] w-[3px] rounded-full bg-primary", collapsed && "lg:hidden")} />
            )}
            {terminal ? (
              <span className="w-[26px] flex-none font-extrabold text-[11px]">{getInitials(character?.name || chat.title)}</span>
            ) : (
              <span className={cn("rounded-full flex-shrink-0", character && hasUnseenStatus(character, Date.now()) && "ring-2 ring-primary ring-offset-2 ring-offset-card")}>
                <CharacterAvatar name={character?.name || chat.title} accent={character?.accent} imageSrc={avatarSrc} size={34} />
              </span>
            )}
            <div className={cn("flex-1 flex flex-col overflow-hidden min-w-0", collapsed && "lg:hidden")}>
              <div className="flex items-center gap-1.5">
                <span className={cn("flex-1 min-w-0 font-semibold text-[13.5px] truncate", terminal ? "text-[12px] font-bold" : "text-foreground")}>
                  <HighlightedText text={chat.title} query={query} />
                  {terminal && ".log"}
                </span>
                {isFollowupTyping ? (
                  <span className={cn("text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0", terminal && "bg-transparent text-inherit text-[10px] px-0")}>
                    {terminal ? "typing..." : "Typing..."}
                  </span>
                ) : isWaitingForUser ? (
                  <span className={cn("text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0", terminal && "bg-transparent text-inherit opacity-75 text-[10px] px-0")}>
                    {terminal ? "waiting" : "Waiting for you"}
                  </span>
                ) : (
                  <span className={cn("text-[10.5px] flex-shrink-0", terminal ? "text-[10px] opacity-75" : unread > 0 ? "font-semibold text-primary" : "text-ink-faint")}>{formatChatTime(chat.timestamp)}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                {snippet ? (
                  <span className={cn("flex-1 min-w-0 text-xs truncate", terminal ? "text-[11px] opacity-75" : "text-muted-foreground")}>
                    {terminal && "# "}
                    <HighlightedText text={snippet} query={query} />
                  </span>
                ) : preview ? (
                  <span className={cn("flex-1 min-w-0 text-xs truncate", terminal ? "text-[11px] opacity-75" : unread > 0 ? "text-foreground" : "text-muted-foreground")} data-slot="chat-preview">
                    {terminal && "# "}
                    {preview.fromYou && <span aria-label="You:" className="mr-1 tracking-[-0.2em] text-subtle" data-slot="ticks" data-state="delivered">✓✓</span>}
                    {previewSpeaker && <span className="font-medium">{previewSpeaker}: </span>}
                    {preview.text}
                  </span>
                ) : character?.description && !hidePreview ? (
                  <span className={cn("flex-1 min-w-0 text-xs truncate", terminal ? "text-[11px] opacity-75" : "text-muted-foreground")}>
                    {terminal && "# "}
                    {character.description}
                  </span>
                ) : <span className="flex-1" />}
                {chat.muted && <FaVolumeMute size={11} className="flex-shrink-0 text-subtle" aria-label="Muted" />}
                {chat.pinned && !terminal && <FaThumbtack size={10} className="flex-shrink-0 text-subtle" aria-label="Pinned" />}
                {unread > 0 && (
                  <span
                    data-slot="unread-badge"
                    aria-label={`${unread} unread`}
                    className={cn("min-w-[19px] h-[19px] px-1.5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-semibold", chat.muted ? "bg-subtle/30 text-foreground" : "bg-primary text-primary-foreground")}
                  >
                    {unread}
                  </span>
                )}
              </div>
            </div>
            {/* Pin, mute, archive and delete (#115), in one menu per row: on
                hover with a mouse, always on a touch screen. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  // Inside the row's link: neither open the chat nor close the drawer.
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-auto w-auto p-1.5 rounded-lg flex-shrink-0 text-ink-faint hover:text-foreground hover:bg-primary/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100",
                    terminal && isActive && "text-primary-foreground/80 hover:text-primary-foreground",
                    collapsed && "lg:hidden"
                  )}
                  title="Chat options"
                  aria-label={`Chat options for ${chat.title}`}
                >
                  <FaChevronDown size={11} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={() => onTogglePin(chat.id, Boolean(chat.pinned))}>{chat.pinned ? "Unpin chat" : "Pin chat"}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onToggleMute(chat.id, Boolean(chat.muted))}>{chat.muted ? "Unmute" : "Mute"}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onToggleArchive(chat.id, Boolean(chat.archived))}>{chat.archived ? "Unarchive chat" : "Archive chat"}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onDeleteChat(chat.id)} className="text-destructive focus:text-destructive">Delete chat</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Link>
        );
      })}
    </div>
  );
};

export default Sidebar;
