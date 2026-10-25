import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAppDispatch } from "../../store/hooks";
import { extractCharacterMemory, generateAssistText, writeDiaryEntry } from "../../features/aiSlice";
import { fetchChatById, updateChatMemory, updateChatOptions } from "../../features/chatSlice";
import { fetchCharacterById, updateCharacter } from "../../features/characterSlice";
import { applyMemoryChanges, carryMemoryCategories } from "../../features/ai/utils/memoryExtraction";
import { carryMemoryDates } from "../../features/ai/utils/memoryTime";
import { appendDiaryEntry } from "../../features/ai/utils/diary";
import { formatTranscript, TranscriptNames } from "../../features/ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "../../features/ai/utils/transcript";
import { buildReplySuggestionsPrompt, parseReplySuggestions, NARRATIVE_CONTEXT_MESSAGES } from "../../features/ai/utils/narrativeTools";
import { buildRelationshipPrompt, parseRelationshipReply, relationshipCheckDue } from "../../features/character/relationshipEvolution";
import { addGrowth, arcCheckDue, buildArcPrompt, parseArcReply } from "../../features/character/characterArc";
import { buildStagePrompt, parseStageReply, stageCheckDue } from "../../features/character/relationshipStages";
import { latestStorySummary } from "../../features/chat/recap";
import { applyPlanChanges, buildPlansPrompt, mentionsOpenPlan, mentionsPlan, openPlans, parsePlansReply } from "../../features/chat/sharedPlans";
import { generateNodeId } from "../../features/chat/messageTree";
import { addJokes, buildJokesPrompt, jokeCheckDue, parseJokesReply } from "../../features/chat/insideJokes";
import { AI, DIARY_INTERVAL, MEMORY_EXTRACTION_INTERVAL } from "../../utils/constants";
import { Character, Chat, Message, RoleplayStyle, UserProfile } from "../../types";

export interface BackgroundUpdateDeps {
  chatIdNum: number | null;
  currentChat?: Chat;
  characterData?: Character;
  roomCharacters: Character[];
  isRoom: boolean;
  chatScopedMemory: boolean;
  activePersona?: UserProfile;
  roleplayStyle: RoleplayStyle;
  transcriptNames: () => TranscriptNames;
  warnBackgroundFailure: (kind: "memory" | "compress", message?: string) => void;
}

// What runs after each reply in a chat, out of the user's way: reply
// suggestions, long-term memory, the diary, and the checks that may suggest
// a new relationship label, a growth note or a stage change (with their
// accept and dismiss handlers). Every step is best-effort.
export const useBackgroundUpdates = ({
  chatIdNum,
  currentChat,
  characterData,
  roomCharacters,
  isRoom,
  chatScopedMemory,
  activePersona,
  roleplayStyle,
  transcriptNames,
  warnBackgroundFailure,
}: BackgroundUpdateDeps) => {
  const dispatch = useAppDispatch();

  // Every MEMORY_EXTRACTION_INTERVAL messages, distill new durable facts from
  // the recent conversation into long-term memory. Independent of the
  // compression threshold (which defaults to off) so it works for every
  // character. Best-effort/silent: a failure here shouldn't interrupt the
  // conversation. `speaker` defaults to the chat's primary character
  // (unchanged behavior for a 1:1 chat) but a room passes whichever bot
  // actually just replied - only to gate/label the extraction call, though:
  // in a room the extracted facts merge into the room's own Chat.memory, not
  // that (or any) participant's personal Character.memory, so a group
  // conversation never writes back onto a character used outside this room.
  //
  // Counted from the message count at the last extraction (per chat, this
  // session) rather than `length % interval === 0`: impersonated/silent sends,
  // follow-ups and compression all shift the count, and the modulo check
  // could step over its multiple and go quiet for dozens of messages (or
  // re-fire on every regenerate that landed on one).
  const memoryBaselineRef = useRef<Record<number, number>>({});
  const maybeExtractMemory = async (allMessages: Message[], speaker = characterData) => {
    if (!speaker || !chatIdNum || allMessages.length === 0) return;
    const count = allMessages.length;
    let baseline = memoryBaselineRef.current[chatIdNum];
    // First call this session: assume the last multiple of the interval
    // strictly below `count` was already handled, so a chat reaching exactly
    // 12, 24, ... messages still extracts right away, as it used to.
    if (baseline == null) baseline = Math.floor((count - 1) / MEMORY_EXTRACTION_INTERVAL) * MEMORY_EXTRACTION_INTERVAL;
    if (count < baseline) baseline = count; // compressed, rewound or switched to a shorter branch
    memoryBaselineRef.current[chatIdNum] = baseline;
    if (count - baseline < MEMORY_EXTRACTION_INTERVAL) return;
    memoryBaselineRef.current[chatIdNum] = count;
    // Disappearing messages (#136): nothing said while they're on is kept.
    if (currentChat?.disappearing) return;

    try {
      const recentMessages = allMessages.slice(-Math.min(count - baseline, MEMORY_EXTRACTION_INTERVAL * 2));
      const existingMemory = chatScopedMemory ? (currentChat?.memory || []) : (speaker.memory || []);
      const pinned = chatScopedMemory ? (currentChat?.pinnedMemory || []) : (speaker.pinnedMemory || []);
      const names = transcriptNames();
      const changes = await dispatch(
        extractCharacterMemory({
          recentMessages,
          memory: existingMemory,
          pinnedMemory: pinned,
          names: { ...names, charName: isRoom ? undefined : speaker.name },
        })
      ).unwrap();

      const hasChanges = changes.added.length + changes.updated.length + changes.forgotten.length + changes.reinforced.length > 0;
      if (hasChanges) {
        // Applied to the same snapshot the model was shown, since the
        // changes refer to its facts by position.
        const merged = applyMemoryChanges(existingMemory, changes, pinned);
        if (chatScopedMemory && chatIdNum) {
          const memoryCategories = carryMemoryCategories(merged, pinned, currentChat?.memoryCategories, existingMemory, changes);
          const memoryDates = carryMemoryDates(merged, pinned, currentChat?.memoryDates, existingMemory, changes, Date.now());
          await dispatch(updateChatMemory({ chatId: chatIdNum, memory: merged, memoryCategories: memoryCategories ?? null, memoryDates: memoryDates ?? null }));
        } else {
          // Re-read the character before writing: `speaker` was captured
          // before the extraction call, and saving it whole would undo
          // anything written meanwhile (e.g. this turn's selfie in gallery).
          const fresh = (await dispatch(fetchCharacterById(speaker.id)).unwrap().catch(() => speaker)) || speaker;
          const memoryCategories = carryMemoryCategories(merged, pinned, fresh.memoryCategories, existingMemory, changes);
          const memoryDates = carryMemoryDates(merged, pinned, fresh.memoryDates, existingMemory, changes, Date.now());
          await dispatch(updateCharacter({ ...fresh, memory: merged, memoryCategories, memoryDates }));
        }
      }
    } catch (err) {
      console.warn("Memory extraction failed (non-fatal):", err);
      warnBackgroundFailure("memory", typeof err === "string" ? err : (err as Error)?.message);
    }
  };

  // Diary (#5): every DIARY_INTERVAL messages a character with the diary on
  // writes a private first-person entry about the recent conversation: in a
  // 1:1 chat only when it shares the character's memory, so a "this chat
  // only" what-if never reaches the diary, and in a group chat for each
  // member who keeps one. Same per-chat baseline counting as memory
  // extraction above.
  const diaryBaselineRef = useRef<Record<number, number>>({});
  const maybeWriteDiary = async (allMessages: Message[], speaker = characterData) => {
    // A group chat writes one entry per member with the diary on, each from
    // their own point of view; a 1:1 chat only when it shares the character's memory.
    const writers = isRoom
      ? roomCharacters.filter((c) => c.diaryEnabled)
      : speaker?.diaryEnabled && !chatScopedMemory ? [speaker] : [];
    if (writers.length === 0 || !chatIdNum || allMessages.length === 0) return;
    const count = allMessages.length;
    let baseline = diaryBaselineRef.current[chatIdNum];
    if (baseline == null) baseline = Math.floor((count - 1) / DIARY_INTERVAL) * DIARY_INTERVAL;
    if (count < baseline) baseline = count;
    diaryBaselineRef.current[chatIdNum] = baseline;
    if (count - baseline < DIARY_INTERVAL) return;
    diaryBaselineRef.current[chatIdNum] = count;

    const recent = trimToLatestSummary(allMessages).slice(-DIARY_INTERVAL);
    for (const writer of writers) {
      try {
        const text = await dispatch(writeDiaryEntry({
          charName: writer.name,
          userName: activePersona?.name?.trim() || "the user",
          recentMessages: recent,
          names: transcriptNames(),
          previousEntry: writer.diary?.[writer.diary.length - 1],
          others: isRoom ? roomCharacters.filter((c) => c.id !== writer.id).map((c) => c.name) : undefined,
        })).unwrap();
        if (!text) continue;
        const fresh = (await dispatch(fetchCharacterById(writer.id)).unwrap().catch(() => writer)) || writer;
        await dispatch(updateCharacter({
          ...fresh,
          diary: appendDiaryEntry(fresh.diary, { id: generateNodeId(), timestamp: Date.now(), chatId: chatIdNum, text }),
        }));
      } catch (err) {
        console.warn("Diary entry failed (non-fatal):", err);
      }
    }
  };

  // Reply suggestions (#16): three short ideas for your next message, shown
  // under the newest reply when the chat has them switched on. Kept in
  // memory only; they're for this moment, not the story.
  const [replySuggestions, setReplySuggestions] = useState<{ forMessageId: string; items: string[] } | null>(null);
  const maybeSuggestReplies = async (allMessages: Message[], speaker = characterData) => {
    const last = allMessages[allMessages.length - 1];
    if (!currentChat?.replySuggestions || !speaker || !last?.id || last.role !== AI) return;
    const userName = activePersona?.name?.trim() || "User";
    const recent = trimToLatestSummary(allMessages).slice(-NARRATIVE_CONTEXT_MESSAGES);
    try {
      const reply = await dispatch(generateAssistText({
        instruction: buildReplySuggestionsPrompt(userName, speaker.name, formatTranscript(recent, transcriptNames())),
        background: true,
      })).unwrap();
      const items = parseReplySuggestions(reply);
      if (items.length > 0) setReplySuggestions({ forMessageId: last.id, items });
    } catch (err) {
      console.warn("Reply suggestions failed (non-fatal):", err);
    }
  };

  // Relationship that evolves (#30): every RELATIONSHIP_INTERVAL messages in
  // a 1:1 chat, the helper model may suggest a new relationship label for
  // the user to approve. The check is recorded first, so a failure or a slow
  // reply never asks twice for the same stretch.
  const maybeSuggestRelationship = async (allMessages: Message[], speaker = characterData) => {
    if (!chatIdNum || isRoom || !speaker || roleplayStyle.relationshipSuggestions === false || currentChat?.relationshipSuggestions === false || currentChat?.relationshipSuggestion) return;
    const count = allMessages.filter((m) => !m.isSystem).length;
    if (!relationshipCheckDue(count, currentChat?.relationshipCheckedAt)) return;
    await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { relationshipCheckedAt: count } }));
    try {
      const recent = trimToLatestSummary(allMessages).slice(-NARRATIVE_CONTEXT_MESSAGES);
      const reply = await dispatch(generateAssistText({
        instruction: buildRelationshipPrompt(speaker.name, activePersona?.name?.trim() || "the user", speaker.relationship || "", formatTranscript(recent, transcriptNames()), latestStorySummary(allMessages)),
        background: true,
      })).unwrap();
      const to = parseRelationshipReply(reply, speaker.relationship || "");
      if (to) await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { relationshipSuggestion: { from: speaker.relationship || "", to } } }));
    } catch (err) {
      console.warn("Relationship check failed (non-fatal):", err);
    }
  };
  const acceptRelationship = () => {
    const suggestion = currentChat?.relationshipSuggestion;
    if (!chatIdNum || !suggestion || !characterData) return;
    dispatch(updateCharacter({ ...characterData, relationship: suggestion.to }));
    dispatch(updateChatOptions({ chatId: chatIdNum, patch: { relationshipSuggestion: undefined } }));
    toast.success(`${characterData.name} and you: ${suggestion.to}`);
  };
  const dismissRelationship = () => {
    if (chatIdNum) dispatch(updateChatOptions({ chatId: chatIdNum, patch: { relationshipSuggestion: undefined } }));
  };

  // Character arc (#60): every ARC_INTERVAL messages in a 1:1 chat that
  // shares the character's memory, the helper may suggest a note on how
  // they've grown, for the user to approve. Recorded first, like the
  // relationship check, so a stretch is never asked about twice.
  const maybeSuggestArc = async (allMessages: Message[], speaker = characterData) => {
    if (!chatIdNum || isRoom || chatScopedMemory || !speaker || roleplayStyle.arcSuggestions === false || currentChat?.arcSuggestion) return;
    const count = allMessages.filter((m) => !m.isSystem).length;
    if (!arcCheckDue(count, currentChat?.arcCheckedAt)) return;
    await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { arcCheckedAt: count } }));
    try {
      const recent = trimToLatestSummary(allMessages).slice(-NARRATIVE_CONTEXT_MESSAGES);
      const reply = await dispatch(generateAssistText({
        instruction: buildArcPrompt(speaker.name, activePersona?.name?.trim() || "the user", [speaker.description, speaker.prompt].filter(Boolean).join(" "), speaker.growth || [], speaker.memory || [], formatTranscript(recent, transcriptNames()), latestStorySummary(allMessages)),
        background: true,
      })).unwrap();
      const note = parseArcReply(reply, speaker.growth || []);
      if (note) await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { arcSuggestion: note } }));
    } catch (err) {
      console.warn("Character arc check failed (non-fatal):", err);
    }
  };
  const acceptArc = async () => {
    const note = currentChat?.arcSuggestion;
    if (!chatIdNum || !note || !characterData) return;
    const fresh = (await dispatch(fetchCharacterById(characterData.id)).unwrap().catch(() => characterData)) || characterData;
    dispatch(updateCharacter({ ...fresh, growth: addGrowth(fresh.growth, note) }));
    dispatch(updateChatOptions({ chatId: chatIdNum, patch: { arcSuggestion: undefined } }));
    toast.success(`Added to how ${characterData.name} has grown`);
  };
  const dismissArc = () => {
    if (chatIdNum) dispatch(updateChatOptions({ chatId: chatIdNum, patch: { arcSuggestion: undefined } }));
  };

  // Relationship stages (#70): with a stage set, every STAGE_INTERVAL
  // messages a cheap check may suggest moving a step up or down.
  const maybeSuggestStage = async (allMessages: Message[], speaker = characterData) => {
    const stage = currentChat?.stage;
    if (!chatIdNum || isRoom || !speaker || !stage || currentChat?.stageSuggestion) return;
    const count = allMessages.filter((m) => !m.isSystem).length;
    if (!stageCheckDue(count, currentChat?.stageCheckedAt)) return;
    await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { stageCheckedAt: count } }));
    try {
      const recent = trimToLatestSummary(allMessages).slice(-NARRATIVE_CONTEXT_MESSAGES);
      const reply = await dispatch(generateAssistText({
        instruction: buildStagePrompt(speaker.name, activePersona?.name?.trim() || "the user", stage, formatTranscript(recent, transcriptNames())),
        background: true,
      })).unwrap();
      const next = parseStageReply(reply, stage);
      if (next) await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { stageSuggestion: next } }));
    } catch (err) {
      console.warn("Relationship stage check failed (non-fatal):", err);
    }
  };
  const acceptStage = () => {
    if (!chatIdNum || !currentChat?.stageSuggestion) return;
    dispatch(updateChatOptions({ chatId: chatIdNum, patch: { stage: currentChat.stageSuggestion, stageSuggestion: undefined } }));
  };
  const dismissStage = () => {
    if (chatIdNum) dispatch(updateChatOptions({ chatId: chatIdNum, patch: { stageSuggestion: undefined } }));
  };

  // Shared plans (#84): with "Notice plans" on, a 1:1 exchange that sounds
  // like a plan (or mentions an open one) gets a helper check, which may add
  // plans and tick off the ones that just happened.
  const maybeTrackPlans = async (allMessages: Message[], speaker = characterData) => {
    if (!chatIdNum || isRoom || !speaker || !currentChat?.planTracking) return;
    const exchange = allMessages.filter((m) => !m.isSystem).slice(-2);
    const text = exchange.map((m) => m.txt || "").join("\n");
    const open = openPlans(currentChat.plans);
    if (!mentionsPlan(text) && !mentionsOpenPlan(text, open)) return;
    try {
      const now = Date.now();
      const reply = await dispatch(generateAssistText({
        instruction: buildPlansPrompt(speaker.name, activePersona?.name?.trim() || "the user", open, formatTranscript(exchange, transcriptNames()), now),
        background: true,
      })).unwrap();
      const changes = parsePlansReply(reply, open.length);
      if (changes.added.length === 0 && changes.doneIndexes.length === 0) return;
      // Fresh plans, in case they were edited while the check ran.
      const fresh = await dispatch(fetchChatById(chatIdNum)).unwrap().catch(() => currentChat);
      const latest = fresh?.plans || currentChat.plans;
      // Done numbers point into the open plans the prompt listed.
      const doneIndexes = changes.doneIndexes.map((i) => openPlans(latest).findIndex((p) => p.id === open[i]?.id)).filter((i) => i >= 0);
      await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { plans: applyPlanChanges(latest, { ...changes, doneIndexes }, now) } }));
    } catch (err) {
      console.warn("Plan check failed (non-fatal):", err);
    }
  };

  // Inside jokes (#96): with "Notice inside jokes" on, every JOKE_INTERVAL
  // messages of a 1:1 chat a helper check picks out new ones. Recorded
  // first, like the other checks, so a stretch is never asked about twice.
  const maybeTrackJokes = async (allMessages: Message[], speaker = characterData) => {
    if (!chatIdNum || isRoom || !speaker || !currentChat?.jokeTracking) return;
    const count = allMessages.filter((m) => !m.isSystem).length;
    if (!jokeCheckDue(count, currentChat.jokesCheckedAt)) return;
    await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { jokesCheckedAt: count } }));
    try {
      const recent = trimToLatestSummary(allMessages).filter((m) => !m.isSystem).slice(-40);
      const reply = await dispatch(generateAssistText({
        instruction: buildJokesPrompt(speaker.name, activePersona?.name?.trim() || "the user", currentChat.insideJokes || [], formatTranscript(recent, transcriptNames())),
        background: true,
      })).unwrap();
      const fresh = await dispatch(fetchChatById(chatIdNum)).unwrap().catch(() => currentChat);
      const texts = parseJokesReply(reply, fresh?.insideJokes || []);
      if (texts.length > 0) await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { insideJokes: addJokes(fresh?.insideJokes, texts, Date.now()) } }));
    } catch (err) {
      console.warn("Inside jokes check failed (non-fatal):", err);
    }
  };

  // After each reply: suggestions in parallel (they write nothing), then
  // memory and the diary one after the other, so their two character saves
  // can't overwrite each other.
  const runBackgroundUpdates = async (allMessages: Message[], speaker = characterData) => {
    void maybeSuggestReplies(allMessages, speaker);
    await maybeExtractMemory(allMessages, speaker);
    await maybeWriteDiary(allMessages, speaker);
    await maybeSuggestRelationship(allMessages, speaker);
    await maybeSuggestArc(allMessages, speaker);
    await maybeSuggestStage(allMessages, speaker);
    await maybeTrackPlans(allMessages, speaker);
    await maybeTrackJokes(allMessages, speaker);
  };

  return {
    runBackgroundUpdates,
    replySuggestions,
    setReplySuggestions,
    acceptRelationship,
    dismissRelationship,
    acceptArc,
    dismissArc,
    acceptStage,
    dismissStage,
  };
};
