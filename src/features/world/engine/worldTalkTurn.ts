import { toast } from "sonner";
import { Character } from "../../../types";
import { generateAssistText } from "../../aiSlice";
import { updateCharacter } from "../../characterSlice";
import { channelId } from "../../channels/channels";
import { parseOffscreenTalk } from "../../chat/offscreenTalk";
import { factsAboutUser } from "../../character/intimacy";
import { withTie } from "../../character/ties";
import { worldOf } from "../currentWorld";
import { factionsOf } from "../factions";
import { buildGoalPrompt, cleanGoal, needsGoal, parseGoalProgress } from "../goals";
import { applyShared, buildFoldPrompt, buildKnowsNote, buildShareSection, cleanFold, foldDue, markFolded, parseNewFact, parseShared } from "../knowledge";
import { buildSceneNow } from "../sceneNow";
import { editTimeline, loadTimeline, logToTimeline } from "../timeline";
import { arcActive, arcLine } from "../worldArcs";
import { activeEvents } from "../worldEvents";
import { featureOn, talkLengthFor } from "../worldPrefs";
import { addWorldTalk, becameFriends, buildWorldTalkPrompt, parseTieChange, pickTalkTopic, recencyOf, talksBetween, tieMayChange, UserKnowledge } from "../worldTalk";
import { EngineDispatch, engineState, GetState } from "./state";
import { pickNextTalk } from "./pickNextTalk";

// Life inside a world (#145): two characters who know each other text on
// their own, one pair per check, on the helper model. You only see it
// through Peek. What they pass on, how they stand and what they want
// afterwards are read from the same reply.
export const worldTalkTurn = (now: number) => async (dispatch: EngineDispatch, getState: GetState) => {
  const { characters, worlds, userName, chats, channels } = engineState(getState);
  const pair = pickNextTalk(characters, worlds, now);
  if (!pair) return;
  const [a, b] = pair;
  const worldId = worldOf(a, worlds);
  const fresh = (id: number) => engineState(getState).characters.find((c) => c.id === id);
  const previous = talksBetween(characters, a.id, b.id).slice(-1)[0];
  const maxLines = talkLengthFor(worldId);
  const talkWorld = worlds.find((w) => w.id === worldId);
  // A topic each time (#159), now and then the user - with what each of
  // them actually knows about them. A world event going on (#162) is the
  // news before the storyline and the channel's last post.
  const event = featureOn(worldId, "events") ? activeEvents(talkWorld, now)[0] : undefined;
  const arc = arcLine(arcActive(talkWorld));
  const news = event ? `${event.title}: ${event.text}` : arc ? arc : worldId ? channels.find((c) => c.id === channelId("world", worldId))?.posts.slice(-1)[0]?.text : undefined;
  const groups = Object.fromEntries([a, b].map((c) => [c.id, factionsOf(talkWorld, c.id).map((f) => f.name)]));
  const topic = pickTalkTopic({ hasTie: Boolean(a.ties?.some((t) => t.withId === b.id)), hasNews: Boolean(news), hasPrevious: Boolean(previous?.lines.length), hasGroups: groups[a.id].length + groups[b.id].length > 0 });
  const knowledge = (c: Character): UserKnowledge => {
    const own = chats.filter((ch) => ch.characterIds?.length === 1 && ch.characterIds[0] === c.id);
    const lastAt = Math.max(0, ...own.map((ch) => ch.content?.[ch.content.length - 1]?.timestamp || 0));
    return { relationship: c.relationship, lastTalked: recencyOf(lastAt || undefined, now), facts: factsAboutUser([...(c.pinnedMemory || []), ...(c.memory || [])], c.memoryCategories) };
  };
  const askTie = featureOn(worldId, "drift") && tieMayChange(topic);
  // What each knows from the world's record (#204), at one shared time and
  // place (#205).
  const record = await loadTimeline(worldId);
  const share = buildShareSection([a, b], record, now, characters);
  // Goals (#208): one of them without one this week picks it first, from
  // who they are and what they know.
  const goals = featureOn(worldId, "goals");
  const wanting = goals ? [a, b].find((c) => needsGoal(c, now)) : undefined;
  if (wanting) {
    const goal = cleanGoal(await dispatch(generateAssistText({
      instruction: buildGoalPrompt(wanting, talkWorld?.name, buildKnowsNote(wanting, record, characters, now)),
      background: true,
      activity: { at: now, kind: "other", text: `${wanting.name} decided what they want this week`, characterId: wanting.id, name: wanting.name },
    })).unwrap());
    const latest = fresh(wanting.id);
    if (goal && latest) await dispatch(updateCharacter({ ...latest, goal: { text: goal, setAt: now } }));
  }
  const [ga, gb] = [a, b].map((c) => fresh(c.id) || c);
  const reply = await dispatch(generateAssistText({
    instruction: buildWorldTalkPrompt(ga, gb, { goals, world: talkWorld, userName, maxLines, previous, topic, news, askTie, groups, sceneNow: buildSceneNow(talkWorld, [a, b], now), share, knows: { [a.id]: knowledge(a), [b.id]: knowledge(b) } }),
    background: true,
    activity: { at: now, kind: "talk", text: `${a.name} and ${b.name} texted`, characterId: a.id, name: a.name },
  })).unwrap();
  const lines = parseOffscreenTalk(reply, pair, maxLines);
  // Saved even when empty, so a failed attempt waits for the next gap.
  await dispatch(updateCharacter(addWorldTalk(fresh(a.id) || a, { id: `wt-${now.toString(36)}`, withId: b.id, at: now, lines })));
  // Hearsay (#206): what was passed on, and anything new about them.
  const told = lines.length ? parseShared(reply) : [];
  if (told.length) void editTimeline(worldId, (list) => applyShared(list, share.items, told, [a.id, b.id], now));
  const fact = lines.length ? parseNewFact(reply) : undefined;
  if (fact) void logToTimeline(worldId, { kind: "talk", text: fact, characterIds: [a.id, b.id], audience: "private", at: now }, talkWorld?.storyTime);
  // A goal moved on, or reached (#208).
  for (const step of goals && lines.length ? parseGoalProgress(reply, [a, b]) : []) {
    const who = fresh(step.id);
    if (!who?.goal) continue;
    await dispatch(updateCharacter({ ...who, goal: step.done ? undefined : { ...who.goal, progress: step.progress } }));
    if (step.done) void logToTimeline(worldId, { kind: "event", text: `${who.name} got what they were after: ${who.goal.text}`, characterIds: [who.id], audience: "private", at: now }, talkWorld?.storyTime);
  }
  // When they talked about you, the world's timeline notes it (#161).
  if (topic === "user" && lines.length) {
    void logToTimeline(worldId, { kind: "talk", text: `${a.name} and ${b.name} talked about you`, characterIds: [a.id, b.id], at: now }, talkWorld?.storyTime);
  }
  // Strangers become friends (#181), after a few talks.
  const nowA = fresh(a.id);
  const nowB = fresh(b.id);
  if (nowA && nowB && becameFriends(engineState(getState).characters, nowA, nowB)) {
    const [na, nb] = withTie(nowA, nowB, "your friend", "your friend");
    await dispatch(updateCharacter(na));
    await dispatch(updateCharacter(nb));
    void logToTimeline(worldId, { kind: "tie", text: `${a.name} and ${b.name} became friends`, characterIds: [a.id, b.id], at: now }, talkWorld?.storyTime);
  }
  // Relationships that drift (#163): the talk changed how they stand.
  const change = askTie && lines.length ? parseTieChange(reply) : undefined;
  const freshA = fresh(a.id);
  const freshB = fresh(b.id);
  const before = freshA?.ties?.find((t) => t.withId === b.id)?.tie;
  const bare = (tie: string) => tie.replace(/^your\s+/i, "");
  if (change && freshA && freshB && bare(change.bToA).toLowerCase() !== bare(before || "").toLowerCase()) {
    const [na, nb] = withTie(freshA, freshB, change.bToA, change.aToB);
    await dispatch(updateCharacter(na));
    await dispatch(updateCharacter(nb));
    const what = `${b.name} is now ${a.name}'s ${bare(change.bToA)}${before ? ` (was ${bare(before)})` : ""}`;
    void logToTimeline(worldId, { kind: "tie", text: what, characterIds: [a.id, b.id], at: now }, talkWorld?.storyTime);
    toast(`${a.name} and ${b.name}`, { description: what });
  }
  // Memory condensing (#207): one of them who knows a lot folds the oldest
  // into a line, at most one a check.
  const timeline = await loadTimeline(worldId);
  const folder = [a, b].map((c) => ({ c, due: foldDue(c.id, timeline, now) })).find((x) => x.due.length);
  if (!folder) return;
  const summary = cleanFold(await dispatch(generateAssistText({
    instruction: buildFoldPrompt(fresh(folder.c.id) || folder.c, folder.due, engineState(getState).characters),
    background: true,
    activity: { at: now, kind: "other", text: `${folder.c.name} sorted through what they know`, characterId: folder.c.id, name: folder.c.name },
  })).unwrap());
  const latest = fresh(folder.c.id);
  if (summary && latest) {
    await dispatch(updateCharacter({ ...latest, knownSummary: summary }));
    void editTimeline(worldId, (list) => markFolded(list, folder.due.map((e) => e.id), folder.c.id));
  }
};
