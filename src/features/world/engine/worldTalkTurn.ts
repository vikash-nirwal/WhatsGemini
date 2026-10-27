import { Character } from "../../../types";
import { generateAssistText } from "../../aiSlice";
import { patchCharacter } from "../../characterSlice";
import { channelId } from "../../channels/channels";
import { parseOffscreenTalk } from "../../chat/offscreenTalk";
import { factsAboutUser } from "../../character/intimacy";
import { worldOf } from "../currentWorld";
import { factionsOf } from "../factions";
import { buildGoalPrompt, clashLine, cleanGoal, goalsClash, needsGoal, parseGoalAgainst, parseGoalProgress } from "../goals";
import { bringsBackGone, canonLine, canonOf, goneIn } from "../canon";
import { addExtras, extrasLine, parsePeople } from "../extras";
import { patchWorld } from "../../worldSlice";
import { applyShared, buildFoldPrompt, buildKnowsNote, buildShareSection, cleanFold, foldDue, markFolded, parseNewFact, parseShared } from "../knowledge";
import { buildSceneNow } from "../sceneNow";
import { editTimeline, loadTimeline, logToTimeline } from "../timeline";
import { arcActive, arcLine } from "../worldArcs";
import { activeEvents } from "../worldEvents";
import { featureOn, talkLengthFor } from "../worldPrefs";
import { buildWorldTalkPrompt, parseTieChange, pickTalkTopic, recencyOf, talksBetween, tieMayChange, UserKnowledge } from "../worldTalk";
import { nudgeBond, nudgeMood, standingLine, tieUnderStrain } from "../bonds";
import { afterTalk } from "./shared";
import { pointsLine } from "../pointsNotes";
import { linesFor, talkSettingFor } from "../talkMedium";
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
  const talkWorld = worlds.find((w) => w.id === worldId);
  // Texts, letters, or in person where they both are (#216).
  const setting = talkSettingFor(a, b, talkWorld, now);
  const maxLines = linesFor(setting, talkLengthFor(worldId));
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
  // With drift on, a tie that's under strain (#211) may change whatever
  // the talk is about, and the prompt hears how the two stand lately.
  const drift = featureOn(worldId, "drift");
  const askTie = drift && (tieMayChange(topic) || tieUnderStrain(a, b.id, now) || tieUnderStrain(b, a.id, now));
  // Goals that clash (#221) are on their minds whether or not drift is on.
  // Points (#234): how each scores the other, with that switch on.
  const standing = [drift ? standingLine(a, b, now) : undefined, featureOn(worldId, "goals") ? clashLine(a, b) : undefined, pointsLine(a, b, now)].filter(Boolean).join(" ") || undefined;
  // What each knows from the world's record (#204), at one shared time and
  // place (#205).
  const record = await loadTimeline(worldId);
  const share = buildShareSection([a, b], record, now, characters);
  // Goals (#208): one of them without one this week picks it first, from
  // who they are and what they know.
  const goals = featureOn(worldId, "goals");
  const wanting = goals ? [a, b].find((c) => needsGoal(c, now)) : undefined;
  if (wanting) {
    // Knowing what the others here want, so it may clash with one (#221).
    const others = characters.filter((c) => c.id !== wanting.id && worldOf(c, worlds) === worldId && c.goal && !needsGoal(c, now));
    const goalReply = await dispatch(generateAssistText({
      instruction: buildGoalPrompt(wanting, talkWorld?.name, buildKnowsNote(wanting, record, characters, now), others.map((c) => ({ name: c.name, goal: c.goal!.text }))),
      background: true,
      activity: { at: now, kind: "other", text: `${wanting.name} decided what they want this week`, characterId: wanting.id, name: wanting.name },
      replyKind: "goal",
    })).unwrap();
    const goal = cleanGoal(goalReply);
    const against = goal ? parseGoalAgainst(goalReply, others) : undefined;
    const rival = others.find((c) => c.id === against);
    if (goal) await dispatch(patchCharacter(wanting.id, (latest) => ({ goal: { text: goal, setAt: now, ...(rival ? { against: rival.id } : {}) }, ...(rival ? nudgeBond(latest, rival.id, { tension: 15 }, now, `they both want things that can't both happen: ${goal}`) : {}) })));
    if (goal && rival) await dispatch(patchCharacter(rival.id, (latest) => nudgeBond(latest, wanting.id, { tension: 15 }, now, `${wanting.name}'s plans this week get in the way`)));
  }
  const [ga, gb] = [a, b].map((c) => fresh(c.id) || c);
  // What's settled here (#220) and the people around (#218).
  const cast = characters.filter((c) => worldOf(c, worlds) === worldId);
  const extrasOn = Boolean(talkWorld) && featureOn(worldId, "extras");
  const talkContext = {
    // Everyone's story counts for canon, the dead's too.
    canon: canonLine(canonOf(talkWorld, engineState(getState).everyone.filter((c) => worldOf(c, worlds) === worldId), record)),
    extras: extrasOn ? extrasLine(talkWorld, [a, b], cast) : undefined,
    askPeople: extrasOn,
  };
  const reply = await dispatch(generateAssistText({
    instruction: buildWorldTalkPrompt(ga, gb, { goals, world: talkWorld, userName, maxLines, previous, topic, news, askTie, standing, setting, ...talkContext, groups, sceneNow: buildSceneNow(talkWorld, [a, b], now), share, knows: { [a.id]: knowledge(a), [b.id]: knowledge(b) } }),
    background: true,
    activity: { at: now, kind: "talk", text: `${a.name} and ${b.name} texted`, characterId: a.id, name: a.name },
  })).unwrap();
  // A talk that puts someone who has died back on stage is dropped (#220).
  const parsedLines = parseOffscreenTalk(reply, pair, maxLines);
  const gone = goneIn(engineState(getState).everyone, talkWorld?.id);
  const lines = parsedLines.some((l) => bringsBackGone(l.text, gone)) ? [] : parsedLines;
  // Someone new came up by name (#218): they join the people around.
  const people = extrasOn && lines.length ? parsePeople(reply) : [];
  if (people.length && talkWorld) await dispatch(patchWorld(talkWorld.id, (w) => ({ extras: addExtras(w.extras, people, cast, now) })));
  // Hearsay (#206): what was passed on, and anything new about them.
  const told = lines.length ? parseShared(reply) : [];
  if (told.length) void editTimeline(worldId, (list) => applyShared(list, share.items, told, [a.id, b.id], now));
  const fact = lines.length ? parseNewFact(reply) : undefined;
  if (fact) void logToTimeline(worldId, { kind: "talk", text: fact, characterIds: [a.id, b.id], audience: "private", at: now }, talkWorld?.storyTime);
  // A goal moved on, or reached (#208).
  for (const step of goals && lines.length ? parseGoalProgress(reply, [a, b]) : []) {
    const who = fresh(step.id);
    if (!who?.goal) continue;
    await dispatch(patchCharacter(who.id, (latest) => ({ goal: step.done || !latest.goal ? undefined : { ...latest.goal, progress: step.progress }, ...(step.done ? nudgeMood(latest, 25, now, `got what they were after: ${who.goal!.text}`) : {}) })));
    if (step.done) void logToTimeline(worldId, { kind: "event", text: `${who.name} got what they were after: ${who.goal.text}`, characterIds: [who.id], audience: "private", at: now }, talkWorld?.storyTime);
    // Whoever wanted it the other way is left low (#221).
    for (const other of step.done ? engineState(getState).characters.filter((c) => c.id !== who.id && goalsClash(c, who)) : []) {
      await dispatch(patchCharacter(other.id, (latest) => ({ ...nudgeMood(latest, -20, now, `${who.name} got there first`), ...(latest.goal?.against === who.id ? { goal: undefined } : {}) })));
    }
  }
  // When they talked about you, the world's timeline notes it (#161).
  if (topic === "user" && lines.length) {
    void logToTimeline(worldId, { kind: "talk", text: `${a.name} and ${b.name} talked about you`, characterIds: [a.id, b.id], at: now }, talkWorld?.storyTime);
  }
  // Kept, closer, friends, a changed tie (#145, #163, #181, #211), last,
  // as before, so a changed tie is the newest thing in the record.
  await dispatch(afterTalk({ a, b, worldId, world: talkWorld, lines, setting, change: askTie && lines.length ? parseTieChange(reply) : undefined, now }));
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
  if (summary) {
    await dispatch(patchCharacter(folder.c.id, { knownSummary: summary }));
    void editTimeline(worldId, (list) => markFolded(list, folder.due.map((e) => e.id), folder.c.id));
  }
};
