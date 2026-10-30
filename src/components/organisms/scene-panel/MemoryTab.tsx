import { formatRelativeTime } from "src/utils/formatRelativeTime";
import React, { useState } from "react";
import { FaTimes, FaPlus, FaPencilAlt, FaThumbtack, FaTag } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { updateChatMemory, updateChatMemoryScope } from "src/features/chatSlice";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { updateCharacter } from "src/features/characterSlice";
import { MemoryCategory } from "src/types";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";
import { MAX_MEMORY_ENTRIES } from "src/utils/constants";
import { CONDENSE_AT } from "src/features/memory/condense";
import { condenseMemoryIfDue, MemoryOwner } from "src/features/memory/condenseJob";
import { selectActivePersona } from "src/features/settingsSlice";
import { cn } from "src/utils/cn";
import { groupMemoryFacts, MEMORY_CATEGORY_LABELS, nextMemoryCategory } from "src/features/ai/utils/memoryExtraction";
import { formatLearned, memoryDatesFor } from "src/features/ai/utils/memoryTime";
import { ScenePanelTabProps } from "./types";

const CATEGORY_LABELS = MEMORY_CATEGORY_LABELS;

// The Memory tab: how the character has grown, and the long-term memory
// (the character's, or this chat's own), grouped, with pinning and editing.
const MemoryTab: React.FC<ScenePanelTabProps> = ({ chatId, character, isRoom, chatMemory, chatPinnedMemory }) => {
  const dispatch = useAppDispatch();

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
  // When each fact was learned (#109).
  const dates = chatScoped ? chat?.memoryDates : character?.memoryDates;

  const handleScopeChange = (scope: "character" | "chat") => {
    dispatch(updateChatMemoryScope({
      chatId,
      memoryScope: scope,
      seed: character ? { memory: character.memory, pinnedMemory: character.pinnedMemory, memoryCategories: character.memoryCategories, memoryDates: character.memoryDates } : undefined,
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
    // A fact added by hand is learned now; a reworded one keeps its date.
    const memoryDates = memoryDatesFor([...newPinned, ...newMemory], dates, new Map(renamed ? [[renamed.to, renamed.from]] : []), new Set(), Date.now());
    if (chatScoped) {
      dispatch(updateChatMemory({ chatId, memory: newMemory, pinnedMemory: newPinned, memoryCategories: memoryCategories ?? null, memoryDates: memoryDates ?? null }));
    } else if (character) {
      dispatch(updateCharacter({ ...character, memory: newMemory, pinnedMemory: newPinned, memoryCategories, memoryDates }));
    }
  };

  // Cycles a fact through About you -> Relationship -> Story -> unsorted.
  const handleCycleCategory = (fact: string) => {
    commitMemory(memory, pinned, undefined, { [fact]: nextMemoryCategory(categories[fact]) });
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

  // Memory grouped by what it's about, once any fact has a category; a
  // memory nobody has sorted yet stays one plain list, as before.
  const groupMemory = memory.some((fact) => categories[fact]);
  const memoryGroups = groupMemoryFacts(memory, categories);

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
                    <span className="flex-1">
                      {fact}
                      {dates?.[fact] && formatLearned(dates[fact].learnedAt, Date.now()) && (
                        <span className="ml-1.5 text-[11px] text-subtle whitespace-nowrap">learned {formatLearned(dates[fact].learnedAt, Date.now())}</span>
                      )}
                    </span>
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

  // A long list folds its oldest facts on its own, one pass per memory
  // update; this does it now, until it's short again (condense.ts).
  const [tidying, setTidying] = useState(false);
  const userName = useAppSelector(selectActivePersona)?.name?.trim() || "the user";
  const tidy = async () => {
    const owner: MemoryOwner | undefined = chatScoped && chatId
      ? { kind: "chat", id: chatId, name: isRoom ? chat?.title || "the group" : character?.name || "the character" }
      : character ? { kind: "character", id: character.id, name: character.name } : undefined;
    if (!owner) return;
    setTidying(true);
    try {
      await dispatch(condenseMemoryIfDue(owner, userName, 10));
    } finally {
      setTidying(false);
    }
  };

  // "Where things stand" (#142): written with each memory update; replies
  // get it instead of a list of facts. The facts below stay the source.
  const standing = chatScoped ? chat?.memoryStanding : character?.memoryStanding;
  return (
          <div className="flex flex-col gap-[22px]">
          {standing && (
            <section aria-label="Where things stand" className="rounded-card bg-raised px-4 py-3 ring-1 ring-inset ring-border">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-foreground">Where things stand</h3>
                <span className="text-[12px] text-subtle">{formatRelativeTime(standing.at)}</span>
              </div>
              <p className="mt-1.5 font-serif text-[14px] leading-[21px] text-muted-foreground">{standing.text}</p>
            </section>
          )}
          {/* Character growth (#60): accepted notes on how they've changed */}
          {!isRoom && character && (character.growth || []).length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">How {character.name} has grown</span>
              </div>
              <ul aria-label={`How ${character.name} has grown`} className="flex flex-col gap-1.5">
                {(character.growth || []).map((note, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border/30 text-[12.5px] text-foreground">
                    <span className="flex-1">{note}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-auto w-auto p-0.5 text-subtle hover:text-destructive hover:bg-transparent"
                      aria-label={`Remove: ${note}`}
                      onClick={() => {
                        const next = (character.growth || []).filter((_, j) => j !== i);
                        dispatch(updateCharacter({ ...character, growth: next.length > 0 ? next : undefined }));
                      }}
                    >
                      <FaTimes size={10} />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Memory */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">{isRoom ? "Group Memory" : "Memory"}</span>
              <span className="flex items-baseline gap-2">
                {memory.length > CONDENSE_AT && (
                  <Button type="button" variant="link" size="sm" className="h-auto p-0 text-[11px]" disabled={tidying} onClick={() => void tidy()} title="Fold the oldest facts into a few lines, until the list is short again">
                    {tidying ? "Tidying..." : "Tidy up"}
                  </Button>
                )}
                <span className="text-[11px] text-primary">{memory.length + pinned.length} facts</span>
              </span>
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
          </div>
  );
};

export default MemoryTab;
