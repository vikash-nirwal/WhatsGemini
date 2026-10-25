import { toast } from "sonner";
import { useAppDispatch } from "../../store/hooks";
import { generateAssistText } from "../../features/aiSlice";
import { addMessage, fetchChatById, setBlocked, updateChatMessage, updateChatOptions } from "../../features/chatSlice";
import { blockedByThem, mainChatWith } from "../../features/chat/blocking";
import { useAppSelector } from "../../store/hooks";
import { useRef } from "react";
import { formatTranscript, TranscriptNames } from "../../features/ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "../../features/ai/utils/transcript";
import { NARRATIVE_CONTEXT_MESSAGES, parseReplySuggestions } from "../../features/ai/utils/narrativeTools";
import { buildNarrationPrompt, buildWhoRepliesPrompt, cleanNarration, MAX_CHAIN, parseWhoReplies } from "../../features/ai/utils/roomTurns";
import { BEAT_CHECK_MESSAGES, buildBeatCheckPrompt, isFinished, moveBeat, parseBeatCheckReply } from "../../features/chat/storyScript";
import { findQuotedMessage, quoteTextOf } from "../../features/chat/replyQuotes";
import { buildPollVotesPrompt, castYourVote, parsePollVotes } from "../../features/chat/groupLife";
import { renameGroupChat } from "../../features/chatSlice";
import { secretsInPlay } from "../../features/character/secrets";
import { StoryTags } from "../../features/chat/storyTags";
import { trustAfter } from "../../features/chat/conflicts";
import { moodAfterReply } from "../../features/chat/lingeringMood";
import { addLie, catchLie, standingLies } from "../../features/chat/lies";
import { markRumorRaised, pendingRumors } from "../../features/character/rumors";
import { fetchCharacterById, updateCharacter } from "../../features/characterSlice";
import { mergeState } from "../../features/chat/sceneState";
import { gameLabel, GameOutcome } from "../../features/chat/miniGames";
import { buildNextIdeasPrompt } from "../../features/chat/coWriting";
import { browserLanguageName, buildTranslatePrompt } from "../../features/chat/languagePractice";
import { AI, YOU } from "../../utils/constants";
import { Character, Chat, Message, MessageNote, Poll, PollVote, SceneState, UserProfile } from "../../types";

export interface ReplyEffectDeps {
  chatIdNum: number | null;
  currentChat?: Chat;
  characterData?: Character;
  roomCharacters: Character[];
  isRoom: boolean;
  activePersona?: UserProfile;
  messages: Message[];
  transcriptNames: () => TranscriptNames;
  setReplySuggestions: (value: { forMessageId: string; items: string[] } | null) => void;
}

// What a reply changes besides its own text, and the small per-message
// actions: the story script's beat, the tracked scene, a mini-game's score,
// the character's reaction, a language correction, what a helper saw in a
// photo; the room's narrator and "natural" speaker pick; and reacting,
// bookmarking, translating and co-writing ideas.
export const useReplyEffects = ({
  chatIdNum,
  currentChat,
  characterData,
  roomCharacters,
  isRoom,
  activePersona,
  messages,
  transcriptNames,
  setReplySuggestions,
}: ReplyEffectDeps) => {
  const dispatch = useAppDispatch();
  // Every chat and character, for a patch-up in another chat (#133).
  const allChats = useAppSelector((state) => state.chat.chats);
  const allCharacters = useAppSelector((state) => state.character.characters);
  const latestStore = useRef({ chats: allChats, characters: allCharacters });
  latestStore.current = { chats: allChats, characters: allCharacters };

  // Story script (#57): saved on the chat; a reply that reports reaching the
  // current beat moves the story on to the next one. One without the tag
  // gets the helper's check instead (given the chat's messages), so the
  // story moves on by itself even when the model forgets to tag it.
  const saveStoryScript = (script: Chat["storyScript"]) => {
    if (chatIdNum) dispatch(updateChatOptions({ chatId: chatIdNum, patch: { storyScript: script } }));
  };
  const moveStoryBeat = (step: number) => {
    if (currentChat?.storyScript) saveStoryScript(moveBeat(currentChat.storyScript, step));
  };
  const checkBeatReached = async (allMessages: Message[]) => {
    const script = currentChat?.storyScript;
    const last = allMessages[allMessages.length - 1];
    // Only for a reply written for the current beat, the one the check asks about.
    if (!chatIdNum || !script || script.beats.length === 0 || isFinished(script) || last?.role !== AI || last.beat !== script.currentBeat + 1) return;
    try {
      const recent = trimToLatestSummary(allMessages).filter((m) => !m.isSystem).slice(-BEAT_CHECK_MESSAGES);
      const reply = await dispatch(generateAssistText({ instruction: buildBeatCheckPrompt(script, formatTranscript(recent, transcriptNames())), background: true })).unwrap();
      if (!parseBeatCheckReply(reply)) return;
      // Re-read the script: it may have been moved by hand or edited while
      // the check ran, and then this answer is about a beat that's gone.
      const fresh = await dispatch(fetchChatById(chatIdNum)).unwrap().catch(() => undefined);
      const latest = fresh?.storyScript;
      if (!latest || latest.currentBeat !== script.currentBeat || latest.beats[script.currentBeat]?.id !== script.beats[script.currentBeat].id) return;
      await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { storyScript: moveBeat(latest, 1) } }));
    } catch (err) {
      console.warn("Story beat check failed (non-fatal):", err);
    }
  };
  // Quoted replies (#119): a reply that quoted one of your messages keeps
  // the quote, once the message it points at is found.
  // Forwarded (#123): something they passed along is kept the same way.
  // A shared contact card (#128) is kept on the reply too.
  // An event invite (#134) too.
  const applyReplyQuote = (payload: { replyQuote?: string; forward?: string; contact?: { name: string; about: string }; invite?: Message["invite"]; sticker?: string; blocks?: boolean; patchedUp?: string } | undefined, allMessages: Message[]) => {
    // Blocking (#133), from the same reply: they blocked you, or a friend
    // patched it up with whoever did.
    if (chatIdNum && payload?.blocks && !isRoom && characterData && !currentChat?.blocked) {
      void dispatch(setBlocked({ chatId: chatIdNum, blocked: { by: "them", at: Date.now() }, notice: `${characterData.name} blocked you` }));
    }
    if (payload?.patchedUp) void patchUp(payload.patchedUp);
    if (!chatIdNum || (!payload?.replyQuote && !payload?.forward && !payload?.contact && !payload?.invite && !payload?.sticker)) return;
    const reply = [...allMessages].reverse().find((m) => m.role === AI && m.id);
    if (!reply?.id) return;
    const quoted = payload.replyQuote ? findQuotedMessage(allMessages, payload.replyQuote) : undefined;
    const patch: Partial<Message> = {
      ...(quoted ? { replyTo: { id: quoted.id, text: quoteTextOf(quoted), from: "you" as const } } : {}),
      ...(payload.forward ? { forward: { text: payload.forward } } : {}),
      ...(payload.contact ? { contactCard: payload.contact } : {}),
      ...(payload.invite ? { invite: payload.invite } : {}),
      ...(payload.sticker ? { sticker: payload.sticker } : {}),
    };
    if (Object.keys(patch).length > 0) void dispatch(updateChatMessage({ chatId: chatIdNum, messageId: reply.id, patch }));
  };
  // A friend patched it up (#133): whoever blocked you (by name) unblocks
  // you, with a notice in your chat with them.
  const patchUp = async (name: string) => {
    const { chats, characters } = latestStore.current;
    const blocker = characters.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    const chat = blocker ? mainChatWith(chats, blocker.id) : undefined;
    if (!blocker || !chat?.id || !blockedByThem(chat)) return;
    await dispatch(setBlocked({ chatId: chat.id, blocked: null, notice: `${blocker.name} unblocked you` }));
    toast.success(`${blocker.name} unblocked you`);
  };
  // View-once photos (#122): with the switch on, about half the photos a
  // character sends open only once.
  const markViewOnce = (payload: { images?: string[] } | undefined, allMessages: Message[], speaker: Character | undefined) => {
    if (!chatIdNum || !speaker?.viewOncePhotos || !payload?.images?.length || Math.random() >= 0.5) return;
    const reply = [...allMessages].reverse().find((m) => m.role === AI && m.id);
    if (reply?.id && reply.images?.length) void dispatch(updateChatMessage({ chatId: chatIdNum, messageId: reply.id, patch: { viewOnce: true } }));
  };
  // Opened once: the picture leaves the message.
  const openViewOnce = (msg: Message) => {
    if (chatIdNum && msg.id && !msg.viewedOnce) void dispatch(updateChatMessage({ chatId: chatIdNum, messageId: msg.id, patch: { viewedOnce: true, images: undefined } }));
  };
  // Group chats (#124): the members vote on a new poll (one helper call,
  // votes timed over the next minute or two), and a member can rename the
  // group or start a poll from a reply.
  const runPollVotes = async (messageId: string, poll: { question: string; options: string[] }, voters: Character[], allMessages: Message[]) => {
    if (!chatIdNum || voters.length === 0) return;
    try {
      const recent = trimToLatestSummary(allMessages).filter((m) => !m.isSystem).slice(-8);
      const reply = await dispatch(generateAssistText({ instruction: buildPollVotesPrompt(poll, voters, formatTranscript(recent, transcriptNames())), background: true })).unwrap();
      const votes = parsePollVotes(reply, voters, poll.options.length, Date.now());
      if (votes.length === 0) return;
      // Fresh copy: you may have voted meanwhile.
      const fresh: Chat | undefined = await dispatch(fetchChatById(chatIdNum)).unwrap().catch(() => undefined);
      const current: Poll = fresh?.content?.find((m: Message) => m.id === messageId)?.poll || { ...poll, votes: [] };
      await dispatch(updateChatMessage({ chatId: chatIdNum, messageId, patch: { poll: { ...current, votes: [...current.votes.filter((v: PollVote) => v.voter === "you"), ...votes] } } }));
    } catch (err) {
      console.warn("Poll votes failed (non-fatal):", err);
    }
  };
  const applyGroupTags = (payload: { groupName?: string; poll?: { question: string; options: string[] } } | undefined, allMessages: Message[], speaker: Character | undefined) => {
    if (!chatIdNum || !isRoom || !speaker) return;
    if (payload?.groupName) void dispatch(renameGroupChat({ chatId: chatIdNum, title: payload.groupName, by: speaker.name }));
    if (payload?.poll) {
      const reply = [...allMessages].reverse().find((m) => m.role === AI && m.id);
      if (!reply?.id) return;
      const poll = { ...payload.poll, votes: [] };
      const replyId = reply.id;
      void dispatch(updateChatMessage({ chatId: chatIdNum, messageId: replyId, patch: { poll } })).then(() =>
        runPollVotes(replyId, poll, roomCharacters.filter((c) => c.id !== speaker.id), allMessages)
      );
    }
  };
  // Your vote: one option; tapping it again takes it back.
  const votePoll = (msg: Message, option: number) => {
    if (!chatIdNum || !msg.id || !msg.poll) return;
    void dispatch(updateChatMessage({ chatId: chatIdNum, messageId: msg.id, patch: { poll: castYourVote(msg.poll, option, Date.now()) } }));
  };
  const advanceStoryIfDone = (payload: { beatDone?: boolean } | undefined, allMessages?: Message[]) => {
    if (payload?.beatDone) moveStoryBeat(1);
    else if (allMessages) void checkBeatReached(allMessages);
  };

  // Secrets (#81): the tag's number points into the secrets the prompt
  // offered (secretsInPlay, worked out the same way); the one told is kept
  // on the chat so it isn't offered again.
  const revealedSecretFor = (payload: { secretRevealed?: number } | undefined) =>
    !isRoom && payload?.secretRevealed ? secretsInPlay(characterData, currentChat).revealable[payload.secretRevealed - 1] : undefined;
  const noteSecretRevealed = (payload: { secretRevealed?: number } | undefined) => {
    const secret = revealedSecretFor(payload);
    if (!chatIdNum || !secret) return;
    dispatch(updateChatOptions({ chatId: chatIdNum, patch: { revealedSecrets: [...(currentChat?.revealedSecrets || []), secret.id] } }));
  };

  // Story tags (#97, #98, #100): which of them this reply's tags really
  // change, given the chat as it is - a fight starts only when one isn't on,
  // making up only ends one, a caught lie must be a standing one, a rumor
  // must be waiting.
  const tagEffects = (tags: StoryTags | undefined, speaker = characterData) => ({
    upset: Boolean(!isRoom && tags?.upset && currentChat?.conflicts && !currentChat.conflict),
    madeUp: Boolean(!isRoom && tags?.madeUp && currentChat?.conflict),
    lie: !isRoom && currentChat?.lies && tags?.lie ? tags.lie : undefined,
    lieCaught: !isRoom && tags?.lieCaught && standingLies(currentChat?.toldLies)[tags.lieCaught - 1] ? tags.lieCaught : undefined,
    rumor: tags?.rumorRaised ? pendingRumors(speaker, Date.now())[0] : undefined,
  });

  // The notes under a reply (#93-#100): a dream told (`dreamt`), a fight
  // started or ended, a lie caught, a rumor raised.
  const replyNotes = (payload: { storyTags?: StoryTags } | undefined, speaker = characterData, dreamt = false): MessageNote[] | undefined => {
    const effects = tagEffects(payload?.storyTags, speaker);
    const notes: MessageNote[] = [
      ...(dreamt ? (["dream"] as const) : []),
      ...(effects.upset ? (["upset"] as const) : []),
      ...(effects.madeUp ? (["made-up"] as const) : []),
      ...(effects.lieCaught ? (["lie-caught"] as const) : []),
      ...(effects.rumor ? (["rumor"] as const) : []),
    ];
    return notes.length > 0 ? notes : undefined;
  };

  // Scene state (#9): what a reply reports is merged into the chat's state.
  // A fight or making up (#97) moves trust too, after the reply's own report.
  const saveSceneState = (payload: { sceneState?: Partial<SceneState>; storyTags?: StoryTags } | undefined) => {
    if (!chatIdNum || !currentChat?.sceneTracker) return;
    const effects = tagEffects(payload?.storyTags);
    const change = effects.upset ? "upset" : effects.madeUp ? "made-up" : undefined;
    if (!payload?.sceneState && !change) return;
    const reported = mergeState(currentChat.sceneState, payload?.sceneState || {});
    const moved = change ? trustAfter(reported, change) : undefined;
    dispatch(updateChatOptions({ chatId: chatIdNum, patch: { sceneState: moved ? mergeState(reported, moved) : reported } }));
  };

  // Moods that carry over (#106): the reply's emotion tag moves the chat's
  // lingering mood, with what the user last said as its cause. `fresh` is the
  // message list as it stands after the reply, when the caller has it; the
  // rendered one may not include the message just sent.
  const carryMood = (payload: { emotion?: string } | undefined, fresh?: Message[]) => {
    if (!chatIdNum || isRoom || !currentChat?.moodCarry) return;
    const list = fresh || messages;
    const lastUser = [...list].reverse().find((m) => m.role === YOU && !m.isNarration && m.txt);
    const next = moodAfterReply(currentChat.mood, payload?.emotion, lastUser?.txt, Date.now());
    if (next === currentChat.mood) return;
    dispatch(updateChatOptions({ chatId: chatIdNum, patch: { mood: next } }));
  };

  // Memory with time (#109): once a reply had a fact from a while back to
  // bring up, the next offer waits a couple of days.
  const noteCallback = (offered: boolean) => {
    if (!chatIdNum || !offered) return;
    dispatch(updateChatOptions({ chatId: chatIdNum, patch: { callbackAt: Date.now() } }));
  };

  // What else a reply changes (#94, #97, #98, #100, #103): the fight starts
  // or ends, a lie is kept or caught, a rumor is marked raised, the dream
  // is recorded and a cliffhanger, once picked up, is cleared.
  const noteStoryTags = async (payload: { text?: string; storyTags?: StoryTags } | undefined, speaker = characterData, dreamt = false) => {
    if (!chatIdNum) return;
    const effects = tagEffects(payload?.storyTags, speaker);
    const now = Date.now();
    const patch: Partial<Chat> = {};
    if (effects.upset) patch.conflict = { about: payload!.storyTags!.upset!, since: now };
    if (effects.madeUp) patch.conflict = undefined;
    let lies = currentChat?.toldLies;
    if (effects.lieCaught) lies = catchLie(lies, effects.lieCaught, now);
    if (effects.lie) lies = addLie(lies, payload?.text || "", effects.lie, now);
    if (lies !== currentChat?.toldLies) patch.toldLies = lies;
    if (currentChat?.pendingHook) patch.pendingHook = undefined;
    if (Object.keys(patch).length > 0) await dispatch(updateChatOptions({ chatId: chatIdNum, patch }));
    if (effects.upset) toast.info(`${speaker?.name || "They"} ${speaker?.name ? "is" : "are"} upset with you`);
    if (effects.madeUp) toast.success("You made up");
    if (speaker && (effects.rumor || dreamt)) {
      const fresh: Character = (await dispatch(fetchCharacterById(speaker.id)).unwrap().catch(() => speaker)) || speaker;
      await dispatch(updateCharacter({
        ...fresh,
        ...(effects.rumor ? { rumors: markRumorRaised(fresh.rumors, effects.rumor.id, now) } : {}),
        ...(dreamt ? { lastDreamAt: now } : {}),
      }));
    }
  };

  // "Natural" turns (#22): who would answer, by a cheap helper call. Null
  // when the call fails, so the turn falls back to round-robin.
  const pickNaturalSpeakers = async (contextMessages: Message[], active: Character[], starter?: Character): Promise<Character[] | null> => {
    try {
      const recent = trimToLatestSummary(contextMessages).slice(-NARRATIVE_CONTEXT_MESSAGES);
      const reply = await dispatch(generateAssistText({
        instruction: buildWhoRepliesPrompt(active.map((c) => c.name), activePersona?.name?.trim() || "User", formatTranscript(recent, transcriptNames()), MAX_CHAIN, starter?.name),
        background: true,
      })).unwrap();
      return parseWhoReplies(reply, active);
    } catch (err) {
      console.warn("Picking who replies failed (non-fatal):", err);
      return null;
    }
  };

  // The room's narrator (#23): a short line of narration after each round.
  const maybeNarrate = async () => {
    if (!isRoom || !chatIdNum || !currentChat?.narrator) return;
    try {
      const fresh = await dispatch(fetchChatById(chatIdNum)).unwrap();
      const recent = trimToLatestSummary(fresh.content).slice(-NARRATIVE_CONTEXT_MESSAGES);
      const reply = await dispatch(generateAssistText({ instruction: buildNarrationPrompt(roomCharacters.map((c) => c.name), formatTranscript(recent, transcriptNames())) })).unwrap();
      const text = cleanNarration(reply);
      if (text) await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text, isNarration: true }));
    } catch (err) {
      console.warn("Narration failed (non-fatal):", err);
    }
  };

  // Mini-games (#52): each reply to the user's message moves the game on a
  // turn; a reply that ends it updates the score.
  const advanceGame = (payload: { gameOver?: GameOutcome } | undefined, countTurn: boolean) => {
    const game = currentChat?.game;
    if (!chatIdNum || !game) return;
    if (payload?.gameOver) {
      const score = { user: 0, character: 0, ...currentChat?.gameScore };
      if (payload.gameOver === "user") score.user += 1;
      if (payload.gameOver === "character") score.character += 1;
      dispatch(updateChatOptions({ chatId: chatIdNum, patch: { game: undefined, gameScore: score } }));
      const label = gameLabel(game.kind);
      toast.success(payload.gameOver === "user" ? `You won ${label}!` : payload.gameOver === "character" ? `${characterData?.name || "They"} won ${label}.` : `${label} is over.`);
      return;
    }
    if (countTurn) dispatch(updateChatOptions({ chatId: chatIdNum, patch: { game: { ...game, turns: game.turns + 1 } } }));
  };

  // A character's emoji reaction (#11) goes on the user message its reply
  // answered: the latest real user line in the context it was given.
  const saveCharacterReaction = async (reaction: string | undefined, answered: Message[], speakerId?: number) => {
    if (!reaction || !chatIdNum) return;
    const target = [...answered].reverse().find((m) => m.role === YOU && !m.isNarration && !m.isSystem && !m.isCompressionSummary);
    if (!target?.id) return;
    await dispatch(updateChatMessage({ chatId: chatIdNum, messageId: target.id, patch: { characterReaction: { emoji: reaction, speakerId } } }));
  };

  // Language practice (#67): the fix for your last message sits under it.
  const saveCorrection = async (correction: string | undefined, answered: Message[]) => {
    if (!correction || !chatIdNum || !currentChat?.language) return;
    const target = [...answered].reverse().find((m) => m.role === YOU && !m.isNarration && !m.isSystem && !m.isCompressionSummary);
    if (target?.id) await dispatch(updateChatMessage({ chatId: chatIdNum, messageId: target.id, patch: { correction } }));
  };

  // Co-writing mode (#68): a few ideas for what happens next, shown like
  // reply suggestions; tapping one puts it in the box to write from.
  const handleSuggestNext = async () => {
    const last = messages[messages.length - 1];
    if (!characterData || !last?.id) return;
    const story = trimToLatestSummary(messages).slice(-NARRATIVE_CONTEXT_MESSAGES).filter((m) => !m.isSystem).map((m) => m.txt || "").join("\n\n");
    try {
      const reply = await dispatch(generateAssistText({ instruction: buildNextIdeasPrompt(activePersona?.name?.trim() || "The user", characterData.name, story), background: true })).unwrap();
      const items = parseReplySuggestions(reply);
      if (items.length > 0) setReplySuggestions({ forMessageId: last.id, items });
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't think of what happens next. Check your model settings.");
    }
  };

  // ...and any reply can be translated into your own language.
  const handleTranslate = async (msg: Message) => {
    if (!chatIdNum || !msg.id || !msg.txt) return;
    try {
      const into = currentChat?.language?.translateInto?.trim() || browserLanguageName();
      const translation = (await dispatch(generateAssistText({ instruction: buildTranslatePrompt(msg.txt, into), background: true })).unwrap()).trim();
      if (translation) await dispatch(updateChatMessage({ chatId: chatIdNum, messageId: msg.id, patch: { translation } }));
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't translate that. Check your model settings.");
    }
  };

  // A photo the user sent (#48): what a helper saw in it is kept on their
  // message for later turns, and a photo nobody could see gets a hint.
  const savePhotoOutcome = async (payload: { photoDescription?: string; photoUnseen?: boolean } | undefined, answered: Message[]) => {
    if (payload?.photoUnseen) {
      toast.info("This model can't see photos, so the character was told there's one it can't see. Pick a vision model, or a vision-capable helper model in Settings > Text.");
    }
    if (!payload?.photoDescription || !chatIdNum) return;
    const target = [...answered].reverse().find((m) => m.role === YOU && m.images && m.images.length > 0);
    if (target?.id) await dispatch(updateChatMessage({ chatId: chatIdNum, messageId: target.id, patch: { photoDescription: payload.photoDescription } }));
  };

  // Your own reaction to a message (#11); picking the same emoji again
  // removes it.
  const handleReact = (msg: Message, emoji: string) => {
    if (!chatIdNum || !msg.id) return;
    dispatch(updateChatMessage({ chatId: chatIdNum, messageId: msg.id, patch: { reaction: msg.reaction === emoji ? undefined : emoji } }));
  };

  // Bookmarks (#21): a star on any message, listed in the Scene panel.
  const handleToggleBookmark = (msg: Message) => {
    if (!chatIdNum || !msg.id) return;
    dispatch(updateChatMessage({ chatId: chatIdNum, messageId: msg.id, patch: { bookmarked: msg.bookmarked ? undefined : true } }));
  };

  return {
    saveStoryScript,
    moveStoryBeat,
    advanceStoryIfDone,
    applyReplyQuote,
    markViewOnce,
    runPollVotes,
    applyGroupTags,
    votePoll,
    openViewOnce,
    revealedSecretFor,
    noteSecretRevealed,
    replyNotes,
    noteStoryTags,
    carryMood,
    noteCallback,
    saveSceneState,
    pickNaturalSpeakers,
    maybeNarrate,
    advanceGame,
    saveCharacterReaction,
    saveCorrection,
    handleSuggestNext,
    handleTranslate,
    savePhotoOutcome,
    handleReact,
    handleToggleBookmark,
  };
};
