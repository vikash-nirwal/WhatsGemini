import React, { useEffect, useRef, useState } from "react";
import { FaTimes, FaPlus, FaPencilAlt } from "react-icons/fa";
import { useAppDispatch } from "src/store/hooks";
import { updateChatAuthorNote, updateChatWorldTags } from "src/features/chatSlice";
import { updateCharacter } from "src/features/characterSlice";
import { Character } from "src/types";
import { Textarea } from "src/components/atoms/textarea";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";
import { ChatSidePanelShell } from "src/components/molecules/ChatSidePanelShell";
import { MAX_MEMORY_ENTRIES } from "src/utils/constants";

interface ScenePanelProps {
  chatId: number;
  character?: Character;
  authorNote?: string;
  worldTags?: string[];
  onClose: () => void;
}

const ScenePanel: React.FC<ScenePanelProps> = ({ chatId, character, authorNote, worldTags, onClose }) => {
  const dispatch = useAppDispatch();

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

  // Memory - reuses Character.memory, the same data CharacterPage's editor manages.
  const memory = character?.memory || [];
  const handleRemoveMemoryFact = (index: number) => {
    if (!character) return;
    const newMemory = memory.filter((_, i) => i !== index);
    dispatch(updateCharacter({ ...character, memory: newMemory }));
  };

  const [editingFactIndex, setEditingFactIndex] = useState<number | null>(null);
  const [factDraft, setFactDraft] = useState("");
  const [addingFact, setAddingFact] = useState(false);

  const startEditFact = (index: number) => {
    setEditingFactIndex(index);
    setFactDraft(memory[index]);
  };

  const commitFactEdit = () => {
    if (!character || editingFactIndex === null) return;
    const trimmed = factDraft.trim();
    const newMemory = trimmed
      ? memory.map((fact, i) => (i === editingFactIndex ? trimmed : fact))
      : memory.filter((_, i) => i !== editingFactIndex);
    dispatch(updateCharacter({ ...character, memory: newMemory }));
    setEditingFactIndex(null);
    setFactDraft("");
  };

  const commitNewFact = () => {
    const trimmed = factDraft.trim();
    if (trimmed && character) {
      const withNewFact = [...memory, trimmed];
      const capped = withNewFact.length > MAX_MEMORY_ENTRIES ? withNewFact.slice(withNewFact.length - MAX_MEMORY_ENTRIES) : withNewFact;
      dispatch(updateCharacter({ ...character, memory: capped }));
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
        </div>

        {/* Memory */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Memory</span>
            <span className="text-[11px] text-primary">{memory.length} facts</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {memory.length === 0 && !addingFact ? (
              <p className="text-[12.5px] text-subtle">No facts remembered yet.</p>
            ) : (
              memory.map((fact, idx) =>
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
              )
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
                onClick={() => setAddingFact(true)}
                className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 mt-0.5 rounded-full border border-dashed border-border/40 text-subtle text-xs hover:border-primary hover:text-primary transition"
              >
                <FaPlus size={9} /> Add
              </button>
            )}
          </div>
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
      </div>
    </ChatSidePanelShell>
  );
};

export default ScenePanel;
