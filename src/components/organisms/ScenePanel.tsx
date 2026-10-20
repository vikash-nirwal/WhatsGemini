import React, { useEffect, useRef, useState } from "react";
import { FaTimes, FaPlus, FaPencilAlt, FaThumbtack, FaTag } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { updateChatAuthorNote, updateChatWorldTags, updateChatMemory, updateChatScenario, updateChatBoundaries, updateChatMemoryScope, updateChatMessage, updateChatOptions } from "src/features/chatSlice";
import { TagInput } from "src/components/molecules/form-controls";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { updateCharacter } from "src/features/characterSlice";
import { setEmotionPanelEnabled, setEmotionPopupEnabled, setEmotionPopupDuration } from "src/features/settingsSlice";
import { Character, Intensity, MemoryCategory } from "src/types";
import { Textarea } from "src/components/atoms/textarea";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { ChatSidePanelShell } from "src/components/molecules/ChatSidePanelShell";
import { MAX_MEMORY_ENTRIES, DIARY_INTERVAL } from "src/utils/constants";
import { cn } from "src/utils/cn";
import { AUTHOR_NOTE_PRESETS, hasPreset, togglePreset } from "src/features/ai/utils/narrativeTools";

const CATEGORY_LABELS: Record<MemoryCategory, string> = { user: "About you", relationship: "Relationship", story: "Story" };

interface ScenePanelProps {
  chatId: number;
  character?: Character;
  // Whether this chat currently has 2+ characters. When true, Memory (below)
  // reads/writes the room's own Chat.memory instead of the primary
  // character's Character.memory, and a Scenario editor for the room's own
  // Chat.scenario is shown - both scoped to just this room, so nothing here
  // ever touches any participant's own character record.
  isRoom?: boolean;
  chatMemory?: string[];
  chatPinnedMemory?: string[];
  chatScenario?: string;
  authorNote?: string;
  worldTags?: string[];
  hardLimits?: string[];
  intensity?: Intensity;
  isNsfwChat?: boolean; // intensity only matters (and is only shown) when the chat is effectively NSFW
  onClose: () => void;
}

const ScenePanel: React.FC<ScenePanelProps> = ({ chatId, character, isRoom, chatMemory, chatPinnedMemory, chatScenario, authorNote, worldTags, hardLimits, intensity, isNsfwChat, onClose }) => {
  const dispatch = useAppDispatch();

  // App-wide display preferences, not per-chat data like everything else in
  // this panel - surfaced here anyway (rather than the global Settings page)
  // since they're about how the chat you're actually looking at right now
  // renders, and this is the panel already open while you're looking at it.
  const emotionPanelEnabled = useAppSelector((state) => state.settings.emotionPanelEnabled);
  const emotionPopupEnabled = useAppSelector((state) => state.settings.emotionPopupEnabled);
  const emotionPopupDuration = useAppSelector((state) => state.settings.emotionPopupDuration);

  // Author's note - local live value, resynced when the chat/prop changes, saved on blur.
  const [noteValue, setNoteValue] = useState(authorNote || "");
  useEffect(() => {
    setNoteValue(authorNote || "");
  }, [authorNote, chatId]);

  const handleNoteBlur = () => {
    if (noteValue !== (authorNote || "")) {
      dispatch(updateChatAuthorNote({ chatId, authorNote: noteValue || undefined }));
    }
  };

  // Room scenario - only shown/editable for a room; a 1:1 chat's scenario
  // lives on the character itself (Character Editor), not here.
  const [scenarioValue, setScenarioValue] = useState(chatScenario || "");
  useEffect(() => {
    setScenarioValue(chatScenario || "");
  }, [chatScenario, chatId]);

  const handleScenarioBlur = () => {
    if (scenarioValue !== (chatScenario || "")) {
      dispatch(updateChatScenario({ chatId, scenario: scenarioValue || undefined }));
    }
  };

  // Memory - a room reads/writes its own Chat.memory; a 1:1 chat reuses
  // Character.memory, the same data the Character Editor manages.
  // Pinned facts are a separate list: always injected, never evicted by the
  // MAX_MEMORY_ENTRIES cap that trims the least recently mentioned ones.
  // Read straight from the store, so new chat fields don't have to be
  // threaded through ChatWindow.
  const chat = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId));
  // A 1:1 chat can keep its own memory too (Chat.memoryScope), like a room.
  const chatScoped = Boolean(isRoom || chat?.memoryScope === "chat");
  const memory = chatScoped ? (chat?.memory || chatMemory || []) : (character?.memory || []);
  const pinned = chatScoped ? (chat?.pinnedMemory || chatPinnedMemory || []) : (character?.pinnedMemory || []);
  const categories = (chatScoped ? chat?.memoryCategories : character?.memoryCategories) || {};

  const handleScopeChange = (scope: "character" | "chat") => {
    dispatch(updateChatMemoryScope({
      chatId,
      memoryScope: scope,
      seed: character ? { memory: character.memory, pinnedMemory: character.pinnedMemory, memoryCategories: character.memoryCategories } : undefined,
    }));
  };

  // `renamed` carries a fact's category over when its wording is edited.
  const commitMemory = (newMemory: string[], newPinned: string[] = pinned, renamed?: { from: string; to: string }, categoryPatch?: Record<string, MemoryCategory | undefined>) => {
    const nextCategories: Record<string, MemoryCategory> = {};
    for (const fact of [...newPinned, ...newMemory]) {
      const category = categoryPatch && fact in categoryPatch
        ? categoryPatch[fact]
        : categories[fact] ?? (renamed && fact === renamed.to ? categories[renamed.from] : undefined);
      if (category) nextCategories[fact] = category;
    }
    const memoryCategories = Object.keys(nextCategories).length > 0 ? nextCategories : undefined;
    if (chatScoped) {
      dispatch(updateChatMemory({ chatId, memory: newMemory, pinnedMemory: newPinned, memoryCategories: memoryCategories ?? null }));
    } else if (character) {
      dispatch(updateCharacter({ ...character, memory: newMemory, pinnedMemory: newPinned, memoryCategories }));
    }
  };

  // Cycles a fact through About you -> Relationship -> Story -> unsorted.
  const handleCycleCategory = (fact: string) => {
    const order: (MemoryCategory | undefined)[] = ["user", "relationship", "story", undefined];
    const next = order[(order.indexOf(categories[fact]) + 1) % order.length];
    commitMemory(memory, pinned, undefined, { [fact]: next });
  };

  const handlePinFact = (index: number) => {
    commitMemory(memory.filter((_, i) => i !== index), [...pinned, memory[index]]);
  };

  const handleUnpinFact = (index: number) => {
    const withFact = [...memory, pinned[index]];
    const capped = withFact.length > MAX_MEMORY_ENTRIES ? withFact.slice(withFact.length - MAX_MEMORY_ENTRIES) : withFact;
    commitMemory(capped, pinned.filter((_, i) => i !== index));
  };

  const handleForgetPinnedFact = (index: number) => {
    commitMemory(memory, pinned.filter((_, i) => i !== index));
  };

  const handleRemoveMemoryFact = (index: number) => {
    commitMemory(memory.filter((_, i) => i !== index));
  };

  const [editingFactIndex, setEditingFactIndex] = useState<number | null>(null);
  const [factDraft, setFactDraft] = useState("");
  const [addingFact, setAddingFact] = useState(false);
  // The group a fact typed into "+ Add" joins (the group whose button was used).
  const [addingCategory, setAddingCategory] = useState<MemoryCategory | undefined>(undefined);

  const startEditFact = (index: number) => {
    setEditingFactIndex(index);
    setFactDraft(memory[index]);
  };

  const commitFactEdit = () => {
    if (editingFactIndex === null) return;
    const trimmed = factDraft.trim();
    const newMemory = trimmed
      ? memory.map((fact, i) => (i === editingFactIndex ? trimmed : fact))
      : memory.filter((_, i) => i !== editingFactIndex);
    commitMemory(newMemory, pinned, trimmed ? { from: memory[editingFactIndex], to: trimmed } : undefined);
    setEditingFactIndex(null);
    setFactDraft("");
  };

  const commitNewFact = () => {
    const trimmed = factDraft.trim();
    if (trimmed) {
      const withNewFact = [...memory, trimmed];
      const capped = withNewFact.length > MAX_MEMORY_ENTRIES ? withNewFact.slice(withNewFact.length - MAX_MEMORY_ENTRIES) : withNewFact;
      commitMemory(capped, pinned, undefined, addingCategory ? { [trimmed]: addingCategory } : undefined);
    }
    setFactDraft("");
    setAddingFact(false);
  };

  // World tags - purely user-authored, no AI extraction.
  const tags = worldTags || [];
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingTag) tagInputRef.current?.focus();
  }, [addingTag]);

  const commitTag = () => {
    const trimmed = tagDraft.trim();
    if (trimmed) {
      dispatch(updateChatWorldTags({ chatId, worldTags: [...tags, trimmed] }));
    }
    setTagDraft("");
    setAddingTag(false);
  };

  const handleRemoveTag = (index: number) => {
    dispatch(updateChatWorldTags({ chatId, worldTags: tags.filter((_, i) => i !== index) }));
  };

  // World tags pick up the character's own accent color, like their avatar
  // gradient and gallery card glow - falls back to the brand primary when
  // there's no character (shouldn't normally happen, Scene panel is always
  // opened from within a character's chat).
  const tagColor = character?.accent?.[0];
  const tagBg = tagColor ? `${tagColor}26` : "rgb(var(--primary) / 0.14)";
  const tagFg = tagColor || "rgb(var(--primary))";

  const bookmarks = (chat?.content || []).filter((m) => m.bookmarked && m.id);
  // Below 1280px the panel covers the chat, so close it before scrolling.
  const jumpToMessage = (id: string) => {
    const covering = typeof window !== "undefined" && window.matchMedia?.("(max-width: 1279px)").matches;
    if (covering) onClose();
    setTimeout(() => {
      document.querySelector(`[data-message-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, covering ? 250 : 0);
  };

  // Chapters ended in this chat, in story order (the active branch's path).
  const chapters = (chat?.content || []).filter((m) => m.chapterTitle && m.id);
  const [renamingChapterId, setRenamingChapterId] = useState<string | null>(null);
  const [chapterDraft, setChapterDraft] = useState("");
  const commitChapterRename = () => {
    const title = chapterDraft.trim();
    if (renamingChapterId && title) dispatch(updateChatMessage({ chatId, messageId: renamingChapterId, patch: { chapterTitle: title } }));
    setRenamingChapterId(null);
    setChapterDraft("");
  };

  // Memory grouped by what it's about, once any fact has a category; a
  // memory nobody has sorted yet stays one plain list, as before.
  const groupMemory = memory.some((fact) => categories[fact]);
  const memoryGroups: { key: string; label: string; category?: MemoryCategory; items: { fact: string; idx: number }[] }[] = [
    { key: "user", label: CATEGORY_LABELS.user, category: "user" as MemoryCategory },
    { key: "relationship", label: CATEGORY_LABELS.relationship, category: "relationship" as MemoryCategory },
    { key: "story", label: CATEGORY_LABELS.story, category: "story" as MemoryCategory },
    { key: "other", label: "Other", category: undefined },
  ].map((g) => ({
    ...g,
    items: memory
      .map((fact, idx) => ({ fact, idx }))
      .filter(({ fact }) => (groupMemory ? (categories[fact] ?? undefined) === g.category : g.key === "other")),
  }));

  const renderFact = (fact: string, idx: number) =>
                editingFactIndex === idx ? (
                  <Input
                    key={idx}
                    autoFocus
                    value={factDraft}
                    onChange={(e) => setFactDraft(e.target.value)}
                    onBlur={commitFactEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitFactEdit();
                      } else if (e.key === "Escape") {
                        setEditingFactIndex(null);
                        setFactDraft("");
                      }
                    }}
                    className="h-auto py-2 px-3 text-[12.5px] rounded-lg bg-background"
                  />
                ) : (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border/30 text-[12.5px] text-foreground"
                  >
                    <span className="flex-1">{fact}</span>
                    <Button
                      onClick={() => handleCycleCategory(fact)}
                      variant="ghost"
                      size="icon"
                      className={cn("h-auto w-auto p-0.5 hover:bg-transparent flex-shrink-0", categories[fact] ? "text-primary/70 hover:text-primary" : "text-subtle hover:text-primary")}
                      title={`Group: ${categories[fact] ? CATEGORY_LABELS[categories[fact]] : "Unsorted"} - click to change`}
                      aria-label={`Change group (now ${categories[fact] ? CATEGORY_LABELS[categories[fact]] : "Unsorted"})`}
                    >
                      <FaTag size={9} />
                    </Button>
                    <Button
                      onClick={() => handlePinFact(idx)}
                      variant="ghost"
                      size="icon"
                      className="h-auto w-auto p-0.5 text-subtle hover:text-primary hover:bg-transparent flex-shrink-0"
                      title="Pin (always remembered, never dropped)"
                      aria-label="Pin this fact"
                    >
                      <FaThumbtack size={10} />
                    </Button>
                    <Button
                      onClick={() => startEditFact(idx)}
                      variant="ghost"
                      size="icon"
                      className="h-auto w-auto p-0.5 text-subtle hover:text-primary hover:bg-transparent flex-shrink-0"
                      title="Edit"
                      aria-label="Edit this fact"
                    >
                      <FaPencilAlt size={10} />
                    </Button>
                    <Button
                      onClick={() => handleRemoveMemoryFact(idx)}
                      variant="ghost"
                      size="icon"
                      className="h-auto w-auto p-0.5 text-subtle hover:text-destructive hover:bg-transparent flex-shrink-0"
                      title="Forget"
                      aria-label="Forget this fact"
                    >
                      <FaTimes size={11} />
                    </Button>
                  </div>
                )

  return (
    <ChatSidePanelShell title="Scene" onClose={onClose} closeLabel="Close scene panel">
      <div className="flex-1 overflow-y-auto px-[18px] py-[18px] flex flex-col gap-[22px]">
        {/* Author's Note */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Author's Note</span>
            <span className="text-[11px] text-subtle">every reply</span>
          </div>
          <Textarea
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onBlur={handleNoteBlur}
            placeholder="Keep it slow and sensory…"
            className="min-h-[72px] font-serif text-[13.5px] leading-[1.55] bg-background rounded-lg"
          />
          {/* One-tap presets (#17): each adds or removes its own line. */}
          <div className="flex flex-wrap gap-1.5 mt-2" role="group" aria-label="Author's note presets">
            {AUTHOR_NOTE_PRESETS.map((preset) => {
              const on = hasPreset(noteValue, preset);
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={on}
                  title={preset.text}
                  onClick={() => {
                    const next = togglePreset(noteValue, preset);
                    setNoteValue(next);
                    dispatch(updateChatAuthorNote({ chatId, authorNote: next || undefined }));
                  }}
                  className={cn(
                    "min-h-6 px-2.5 py-1 rounded-full border text-[11.5px] transition",
                    on ? "border-primary bg-primary/15 text-primary font-medium" : "border-border/50 text-subtle hover:border-primary hover:text-primary"
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scenario - room-only; a 1:1 chat's scenario lives on the character itself */}
        {isRoom && (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Scenario</span>
              <span className="text-[11px] text-subtle">shared by everyone here</span>
            </div>
            <Textarea
              value={scenarioValue}
              onChange={(e) => setScenarioValue(e.target.value)}
              onBlur={handleScenarioBlur}
              placeholder="The current setting/plot for this group…"
              className="min-h-[72px] font-serif text-[13.5px] leading-[1.55] bg-background rounded-lg"
            />
          </div>
        )}

        {/* Memory */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">{isRoom ? "Group Memory" : "Memory"}</span>
            <span className="text-[11px] text-primary">{memory.length + pinned.length} facts</span>
          </div>
          {!isRoom && character && (
            <div className="mb-2.5">
              <SegmentedControl
                value={chatScoped ? "chat" : "character"}
                onChange={(v) => handleScopeChange(v as "character" | "chat")}
                options={[
                  { value: "character", label: `Shared with ${character.name}` },
                  { value: "chat", label: "This chat only" },
                ]}
              />
              <p className="text-[11px] text-subtle mt-1.5">
                {chatScoped
                  ? `New facts stay in this chat and won't change ${character.name}'s other chats.`
                  : `Facts are shared by every chat with ${character.name}.`}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {pinned.map((fact, idx) => (
              <div
                key={`pinned-${idx}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/30 text-[12.5px] text-foreground"
              >
                <span className="flex-1">{fact}</span>
                <Button
                  onClick={() => handleUnpinFact(idx)}
                  variant="ghost"
                  size="icon"
                  className="h-auto w-auto p-0.5 text-primary hover:text-subtle hover:bg-transparent flex-shrink-0"
                  title="Unpin"
                  aria-label="Unpin this fact"
                >
                  <FaThumbtack size={10} />
                </Button>
                <Button
                  onClick={() => handleForgetPinnedFact(idx)}
                  variant="ghost"
                  size="icon"
                  className="h-auto w-auto p-0.5 text-subtle hover:text-destructive hover:bg-transparent flex-shrink-0"
                  title="Forget"
                  aria-label="Forget this pinned fact"
                >
                  <FaTimes size={11} />
                </Button>
              </div>
            ))}
            {memory.length === 0 && pinned.length === 0 && !addingFact ? (
              <p className="text-[12.5px] text-subtle">{isRoom ? "No shared facts remembered yet." : "No facts remembered yet."}</p>
            ) : (
              memoryGroups.map((group) => (
                <React.Fragment key={group.key}>
                  {groupMemory && group.items.length > 0 && (
                    <div className="flex items-center justify-between mt-1.5 first:mt-0">
                      <span className="text-[10.5px] tracking-[0.08em] uppercase text-subtle font-semibold">{group.label}</span>
                      <button
                        type="button"
                        onClick={() => { setAddingCategory(group.category); setAddingFact(true); }}
                        className="text-[10.5px] text-subtle hover:text-primary"
                        aria-label={`Add a fact to ${group.label}`}
                      >
                        + add
                      </button>
                    </div>
                  )}
                  {group.items.map(({ fact, idx }) => renderFact(fact, idx))}
                </React.Fragment>
              ))
            )}
            {addingFact ? (
              <Input
                autoFocus
                value={factDraft}
                onChange={(e) => setFactDraft(e.target.value)}
                onBlur={commitNewFact}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitNewFact();
                  } else if (e.key === "Escape") {
                    setFactDraft("");
                    setAddingFact(false);
                  }
                }}
                placeholder="A fact to remember…"
                className="h-auto py-2 px-3 text-[12.5px] rounded-lg bg-background"
              />
            ) : (
              <button
                type="button"
                onClick={() => { setAddingCategory(undefined); setAddingFact(true); }}
                aria-label="Add a memory fact"
                className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 mt-0.5 rounded-full border border-dashed border-border/40 text-subtle text-xs hover:border-primary hover:text-primary transition"
              >
                <FaPlus size={9} /> Add
              </button>
            )}
          </div>
        </div>

        {/* Reply suggestions (#16) - per chat */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-foreground">Suggest replies</div>
            <div className="text-[11px] text-subtle">After each reply, three short ideas for what you could say. Tap one to edit it in the box.</div>
          </div>
          <ToggleSwitch
            checked={Boolean(chat?.replySuggestions)}
            onChange={(val) => dispatch(updateChatOptions({ chatId, patch: { replySuggestions: val || undefined } }))}
            label={<span className="sr-only">Suggest replies</span>}
          />
        </div>

        {/* Diary (#5) - a per-character switch, so it's set here in context */}
        {!isRoom && character && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">{character.name} keeps a diary</div>
              <div className="text-[11px] text-subtle">
                {chatScoped
                  ? `Paused in this chat: entries only come from chats that share ${character.name}'s memory.`
                  : `Every ${DIARY_INTERVAL} messages, a short private entry about you. The latest one shapes how ${character.name} acts. Read it from the Characters page.`}
              </div>
            </div>
            <ToggleSwitch
              checked={Boolean(character.diaryEnabled)}
              onChange={(val) => dispatch(updateCharacter({ ...character, diaryEnabled: val }))}
              label={<span className="sr-only">{character.name} keeps a diary</span>}
            />
          </div>
        )}

        {/* Inner thoughts (#10) - also per character */}
        {!isRoom && character && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">Show {character.name}'s inner thoughts</div>
              <div className="text-[11px] text-subtle">
                Each reply also carries a private thought, hidden until you tap it. {character.name} never hears it back.
              </div>
            </div>
            <ToggleSwitch
              checked={Boolean(character.innerThoughts)}
              onChange={(val) => dispatch(updateCharacter({ ...character, innerThoughts: val || undefined }))}
              label={<span className="sr-only">Show {character.name}'s inner thoughts</span>}
            />
          </div>
        )}

        {/* Bookmarks (#21) - starred messages on the current branch */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Bookmarks</span>
            {bookmarks.length > 0 && <span className="text-[11px] text-primary">{bookmarks.length}</span>}
          </div>
          {bookmarks.length === 0 ? (
            <p className="text-[12.5px] text-subtle">Star a message (its ★ button, or long-press on a phone) to find it again here.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {bookmarks.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => jumpToMessage(m.id!)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-background border border-border/30 text-[12.5px] hover:border-primary/50"
                    aria-label={`Jump to: ${(m.txt || "").slice(0, 60)}`}
                  >
                    <span className="block text-[11px] text-subtle mb-0.5">{m.role === "you" ? "You" : (character?.name || "Character")}</span>
                    <span className="line-clamp-2 text-foreground">{m.txt}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Chapters - the story so far, one titled recap per "End chapter" */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Chapters</span>
            {chapters.length > 0 && <span className="text-[11px] text-primary">{chapters.length}</span>}
          </div>
          {chapters.length === 0 ? (
            <p className="text-[12.5px] text-subtle">No chapters yet. Use "End chapter" in the chat menu to close one with a title and recap; the next reply starts fresh from it.</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {chapters.map((chapter, i) => (
                <li key={chapter.id} className="px-3 py-2 rounded-lg bg-background border border-border/30 text-[12.5px]">
                  {renamingChapterId === chapter.id ? (
                    <Input
                      autoFocus
                      aria-label="Chapter title"
                      value={chapterDraft}
                      onChange={(e) => setChapterDraft(e.target.value)}
                      onBlur={commitChapterRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitChapterRename(); }
                        else if (e.key === "Escape") { setRenamingChapterId(null); setChapterDraft(""); }
                      }}
                      className="h-auto py-1 px-2 text-[12.5px] rounded-md"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-semibold text-foreground">{i + 1}. {chapter.chapterTitle}</span>
                      <Button
                        onClick={() => { setRenamingChapterId(chapter.id!); setChapterDraft(chapter.chapterTitle || ""); }}
                        variant="ghost"
                        size="icon"
                        className="h-auto w-auto p-0.5 text-subtle hover:text-primary hover:bg-transparent flex-shrink-0"
                        title="Rename"
                        aria-label={`Rename chapter ${i + 1}`}
                      >
                        <FaPencilAlt size={10} />
                      </Button>
                    </div>
                  )}
                  {chapter.chapterRecap && <p className="mt-1 text-subtle leading-snug">{chapter.chapterRecap}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Boundaries */}
        <div>
          <div data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold mb-2">Boundaries</div>
          <p className="text-[11.5px] text-subtle mb-2">Hard limits are sent right before every reply, so the story never goes there.</p>
          <TagInput
            value={hardLimits || []}
            onChange={(limits) => dispatch(updateChatBoundaries({ chatId, hardLimits: limits, intensity }))}
            placeholder="Add a hard limit…"
          />
          {isNsfwChat && (
            <div className="mt-3 flex flex-col gap-1.5">
              <span className="text-[11.5px] text-subtle">Intensity of intimate scenes</span>
              <SegmentedControl
                value={intensity || ""}
                onChange={(v) => dispatch(updateChatBoundaries({ chatId, hardLimits, intensity: (v || undefined) as Intensity | undefined }))}
                options={[
                  { value: "", label: "Default" },
                  { value: "fade", label: "Fade out" },
                  { value: "suggestive", label: "Suggestive" },
                  { value: "explicit", label: "Explicit" },
                ]}
              />
            </div>
          )}
        </div>

        {/* World tags */}
        <div>
          <div data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold mb-2">World</div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
                style={{ background: tagBg, color: tagFg }}
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(idx)}
                  className="hover:text-destructive"
                  title="Remove tag"
                  aria-label={`Remove tag ${tag}`}
                >
                  <FaTimes size={9} />
                </button>
              </span>
            ))}
            {addingTag ? (
              <Input
                ref={tagInputRef}
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={commitTag}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTag();
                  } else if (e.key === "Escape") {
                    setTagDraft("");
                    setAddingTag(false);
                  }
                }}
                className="h-7 w-28 text-xs px-2.5 py-0 rounded-full"
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingTag(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border/40 text-subtle text-xs hover:border-primary hover:text-primary transition"
              >
                <FaPlus size={9} /> Add
              </button>
            )}
          </div>
        </div>

        {/* Display - app-wide preferences for the docked mood panel/popup, see note above */}
        <div>
          <div data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold mb-2">Display</div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">Mood panel</div>
                <div className="text-[11px] text-subtle">Docks each character's current mood portrait beside the chat</div>
              </div>
              <ToggleSwitch checked={emotionPanelEnabled} onChange={(val) => dispatch(setEmotionPanelEnabled(val))} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">Pop up on mood change</div>
                <div className="text-[11px] text-subtle">Briefly shows a portrait centered on screen when a mood changes</div>
              </div>
              <ToggleSwitch checked={emotionPopupEnabled} onChange={(val) => dispatch(setEmotionPopupEnabled(val))} />
            </div>
            {emotionPopupEnabled && (
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12.5px] font-medium text-foreground">Popup duration (ms)</div>
                <Input
                  type="number"
                  value={emotionPopupDuration}
                  onChange={(e) => dispatch(setEmotionPopupDuration(Math.max(300, Number(e.target.value))))}
                  min="300"
                  step="100"
                  className="h-8 w-24 text-[12.5px] px-2.5 rounded-lg"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </ChatSidePanelShell>
  );
};

export default ScenePanel;
