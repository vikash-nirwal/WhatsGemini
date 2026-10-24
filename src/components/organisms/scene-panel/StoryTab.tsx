import React, { useState } from "react";
import { FaPencilAlt } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { updateChatMessage } from "src/features/chatSlice";
import { MoodTimeline } from "src/components/molecules/MoodTimeline";
import { moodPoints } from "src/features/chat/moodTimeline";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";
import { ScenePanelTabProps } from "./types";
import { PlansSection } from "./PlansSection";
import { InsideJokesSection, LiesSection, PastSection } from "./StorySections";

// The Story tab: plans together, inside jokes, lies, their past, chapters,
// bookmarks and the mood timeline.
const StoryTab: React.FC<ScenePanelTabProps> = ({ chatId, character, isRoom, onClose }) => {
  const dispatch = useAppDispatch();

  // Memory - a room reads/writes its own Chat.memory; a 1:1 chat reuses
  // Character.memory, the same data the Character Editor manages.
  // Pinned facts are a separate list: always injected, never evicted by the
  // MAX_MEMORY_ENTRIES cap that trims the least recently mentioned ones.
  // Read straight from the store, so new chat fields don't have to be
  // threaded through ChatWindow.
  const chat = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId));

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

  return (
          <div role="tabpanel" id="scene-tabpanel-story" aria-labelledby="scene-tab-story" className="flex flex-col gap-[22px]">
          {!isRoom && character && chat && <PlansSection chat={chat} characterName={character.name} />}
          {!isRoom && character && chat && <InsideJokesSection chat={chat} characterName={character.name} />}
          {!isRoom && character && chat && <LiesSection chat={chat} characterName={character.name} />}
          {!isRoom && character && <PastSection character={character} />}

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

          {/* Bookmarks (#21) - starred messages on the current branch */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Starred messages</span>
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

          {/* Relationship timeline (#51): mood over the chat, 1:1 only */}
          {!isRoom && character && (
            <div>
              <div className="mb-2">
                <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">{character.name}'s mood over time</span>
              </div>
              <MoodTimeline points={moodPoints(chat?.content || [], character.id)} name={character.name} />
            </div>
          )}
          </div>
  );
};

export default StoryTab;
