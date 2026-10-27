import { Character, Chat, World } from "../../types";
import { AppDispatch } from "../../store/store";
import { addChatNotice, addMessage, fetchChats, updateChatOptions } from "../chatSlice";
import { patchWorld } from "../worldSlice";
import { generateAssistText } from "../aiSlice";
import { cleanFirstText } from "../character/firstTexts";
import { buildWorldTimeTextPrompt, describeGap, firstAfterGap, gapDays, TimePassed, timePassedNotice, TimeUnit } from "../chat/passTime";
import { skipStoryTime } from "./storyTime";
import { logToTimeline } from "./timeline";
import { addLifeEvent, AGING_MIN_DAYS, buildGapLivesPrompt, parseGapLives } from "./worldLife";
import { advanceArc, arcActive, BEAT_GAP_MS } from "./worldArcs";
import { featureOn } from "./worldPrefs";
import { withTie } from "../character/ties";
import { updateCharacter } from "../characterSlice";
import { AI, YOU } from "../../utils/constants";
import { canUndo, clearSnapshot, loadSnapshot, saveSnapshot, snapshotOf } from "./timeSkipUndo";
import { dbService } from "../../services/dbService";
import { loadTimeline, replaceTimeline } from "./timeline";

// Pass the time for a whole world: each of its chats gets the gap (so every
// next reply knows it), the world's calendar moves on, it goes in the
// timeline, and - if you like - the people you talk to most text first.
// Resolves to how many texted.
export const passWorldTime = (
  { world, worldId, chats, characters, userName }: { world?: World; worldId: number | null; chats: Chat[]; characters: Character[]; userName: string },
  { amount, unit, note, theyTextFirst }: { amount: number; unit: TimeUnit; note: string; theyTextFirst: boolean }
) => async (dispatch: AppDispatch) => {
  const now = Date.now();
  const gap = describeGap(amount, unit);
  const days = gapDays(amount, unit);
  // What it was, so it can be undone (#189).
  const snapshot = snapshotOf(worldId, gap, now, chats, characters, world);
  await saveSnapshot(snapshot);
  for (const chat of chats) {
    if (!chat.id || chat.archived) continue;
    const passed: TimePassed = { gap, days, ...(note ? { note } : {}), at: now, fromMessage: (chat.content || []).length + 1 };
    await dispatch(addChatNotice({ chatId: chat.id, text: timePassedNotice(passed) }));
    await dispatch(updateChatOptions({ chatId: chat.id, patch: { timePassed: passed } }));
  }
  if (world?.storyTime && days >= 1) await dispatch(patchWorld(world.id, (w) => (w.storyTime ? { storyTime: skipStoryTime(w.storyTime, Math.round(days), now) } : {})));
  void logToTimeline(worldId, { kind: "time", text: `${gap} passed for everyone${note ? `: ${note}` : ""}`, at: now }, world?.storyTime);
  // The world ages (#180): lives move on over a long gap, ties may change,
  // and the storyline moves on as many chapters as the time covers.
  const ownNews: Record<number, string> = {};
  if (days >= AGING_MIN_DAYS && characters.length) {
    try {
      const withTies = featureOn(worldId, "drift");
      const reply = await dispatch(generateAssistText({ instruction: buildGapLivesPrompt(world || { name: "My world", premise: "the user's own world" }, gap, note || undefined, characters, withTies), background: true, activity: { at: now, kind: "event", text: `Lives moved on over ${gap}`, name: world?.name }, ...(world ? { worldId: world.id } : {}) })).unwrap();
      const { lives, ties } = parseGapLives(reply, characters);
      const byId = new Map(characters.map((c) => [c.id, c]));
      for (const l of lives) {
        byId.set(l.id, addLifeEvent(byId.get(l.id)!, l.text, now));
        ownNews[l.id] = l.text;
      }
      for (const t of withTies ? ties : []) {
        const [na, nb] = withTie(byId.get(t.a)!, byId.get(t.b)!, t.bToA, t.aToB);
        byId.set(na.id, na);
        byId.set(nb.id, nb);
      }
      for (const c of characters) if (byId.get(c.id) !== c) await dispatch(updateCharacter(byId.get(c.id)!));
      for (const l of lives) void logToTimeline(worldId, { kind: "event", text: l.text, characterIds: [l.id], at: now }, world?.storyTime);
    } catch (err) {
      console.warn("Lives over the gap failed (non-fatal):", err);
    }
  }
  if (world && arcActive(world)) {
    const chapters = Math.floor(days / (BEAT_GAP_MS / 86_400_000));
    for (let i = 0; i < chapters; i++) {
      const latest = await dispatch(patchWorld(world.id, (w) => (w.arc && !w.arc.doneAt ? { arc: advanceArc(w.arc, now) } : {})));
      const arc = (latest as { payload?: World })?.payload?.arc;
      if (!arc || arc.doneAt) break;
    }
  }
  if (!theyTextFirst) {
    await saveSnapshot({ ...snapshot, endAt: Date.now() });
    return 0;
  }
  let texted = 0;
  for (const c of firstAfterGap(characters, chats)) {
    const chat = chats.find((ch) => ch.characterIds?.length === 1 && ch.characterIds[0] === c.id && !ch.whatIf && !ch.archived);
    if (!chat?.id) continue;
    try {
      const last = (chat.content || []).filter((m) => !m.isSystem && !m.isRoomEvent && m.txt).slice(-4).map((m) => `${m.role === YOU ? userName : c.name}: ${(m.txt || "").slice(0, 200)}`);
      const text = cleanFirstText(await dispatch(generateAssistText({ instruction: buildWorldTimeTextPrompt(c, { gap, days, note }, userName, last, ownNews[c.id]), background: true, activity: { at: now, kind: "first-text", text: `${c.name} texted after ${gap}`, characterId: c.id, name: c.name } })).unwrap());
      if (!text) continue;
      await dispatch(addMessage({ chatId: chat.id, role: AI, text, speakerId: c.id, notes: ["texted-first"], at: Date.now() }));
      texted++;
    } catch (err) {
      console.warn(`${c.name} couldn't text after the gap (non-fatal):`, err);
    }
  }
  await dispatch(fetchChats());
  await saveSnapshot({ ...snapshot, endAt: Date.now() });
  return texted;
};

// Takes back the last time skip (#189): chats, people, the calendar and the
// storyline as they were, and its timeline entries gone. Resolves false
// when it can't be undone anymore.
export const undoWorldTime = (worldId: number | null) => async (dispatch: AppDispatch, getState: () => { chat: { chats: Chat[] }; character: { characters: Character[] } }) => {
  await dispatch(fetchChats());
  const { chats } = getState().chat;
  const { characters } = getState().character;
  const s = await loadSnapshot(worldId);
  if (!s || !canUndo(s, chats, Date.now())) return false;
  for (const chat of s.chats) await dbService.withChatLock(chat.id!, () => dbService.updateChat(chat));
  for (const before of s.characters) {
    const now = characters.find((c) => c.id === before.id);
    if (now) await dispatch(updateCharacter({ ...now, lifeEvents: before.lifeEvents, ties: before.ties, knowsAbout: before.knowsAbout, firstTexts: before.firstTexts }));
  }
  if (worldId != null && s.world) await dispatch(patchWorld(worldId, { storyTime: s.world.storyTime, arc: s.world.arc }));
  await replaceTimeline(worldId, (await loadTimeline(worldId)).filter((e) => e.at < s.at || e.at > s.endAt!));
  await clearSnapshot(worldId);
  await dispatch(fetchChats());
  return true;
};
