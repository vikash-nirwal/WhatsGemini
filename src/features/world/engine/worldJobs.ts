import { toast } from "sonner";
import { World } from "../../../types";
import { AI } from "../../../utils/constants";
import { generateAssistText } from "../../aiSlice";
import { patchCharacter } from "../../characterSlice";
import { addChat, addChatNotice, addMessage, fetchChats, updateChatOptions } from "../../chatSlice";
import { patchWorld } from "../../worldSlice";
import { cleanFirstText } from "../../character/firstTexts";
import { lifeScaled } from "../../life/lifeDial";
import { fairOrder, markServed } from "../../life/scheduler";
import { digestDue, lastDigestAt, markDigest, notifyWorld } from "../../notifications/notifications";
import { buildPlanReminderPrompt, planPassed, planReminderDue } from "../groupPlans";
import { buildIntroductionPrompt, introducedFact, INTRO_GAP_MS, introductionDue, pickIntroduction } from "../introductions";
import { buildHangoutsPrompt, hangoutsDue, parseHangouts, runInDue, whereIs, whereYouAre } from "../places";
import { writePlanOutcome } from "../planOutcome";
import { buildReputationPrompt, cleanReputation, REPUTATION_GAP_MS, reputationDue } from "../reputation";
import { addSecret, buildSecretPrompt, HOW_IT_CAME_OUT, parseSecret, pickGossip, pickSecretPair, SECRET_GAP_MS, SECRET_OUT_AFTER_MS, secretDue, secretReadyToSurface, surfacedFacts } from "../secrets";
import { shareNews } from "../shareNews";
import { moveArcOn, startWorldEvent } from "../startEvent";
import { loadTimeline, logToTimeline } from "../timeline";
import { buildCastSuggestionsPrompt, castLiteOf, parseCastSuggestions } from "../worldAssist";
import { advanceArc, arcActive, BEAT_GAP_MS, nextBeatDue } from "../worldArcs";
import { buildEventIdeaPrompt, EVENT_GAP_MS, eventDue, parseEvent } from "../worldEvents";
import { addLifeEvent, buildLifeEventPrompt, cleanLifeEvent, LIFE_GAP_MS, lifeEventDue, NEWCOMER_GAP_MS, newcomerDue, pickLifeSubject } from "../worldLife";
import { featureOn } from "../worldPrefs";
import { EngineDispatch, engineState, GetState } from "./state";

// A world's own life (#162-#184), moved out of WorldEventWatcher (#209):
// its storyline moves on, it starts events, lives move on and newcomers
// arrive, word about you gets around, people introduce you and keep
// secrets, and plans resolve. Each job serves at most one world a check,
// the one it served longest ago that's due (fairOrder), and reads the
// store again after every model call.

type Job = (now: number) => (dispatch: EngineDispatch, getState: GetState) => Promise<void>;

const castOf = (characters: ReturnType<typeof engineState>["characters"], worldId: number) => characters.filter((c) => c.worldId === worldId);

// The first world, in turn order, that this job has something to do in.
const pickWorld = (job: string, worlds: World[], now: number, due: (w: World) => unknown): World | undefined => {
  const world = fairOrder(job, worlds, (w) => w.id, now).find((w) => Boolean(due(w)));
  if (world) markServed(job, world.id, now);
  return world;
};

// The news reaches you (#178): one or two people close to it text you.
const tellTheNews = (world: World, news: string, about: number[], now: number) => async (dispatch: EngineDispatch, getState: GetState) => {
  const { characters, chats, userName } = engineState(getState);
  await dispatch(shareNews({ world, cast: castOf(characters, world.id), chats, userName, news, about, now }));
};

// Storylines (#169) move to their next beat on their own; no AI call.
export const moveStorylines: Job = (now) => async (dispatch, getState) => {
  for (const w of engineState(getState).worlds) {
    const arc = arcActive(w);
    if (!arc || !nextBeatDue(arc, now, lifeScaled(BEAT_GAP_MS))) continue;
    await dispatch(moveArcOn(w, now));
    // A notice (#175), so a new chapter isn't only in the timeline.
    const next = advanceArc(arc, now);
    const body = next.doneAt ? "The storyline has ended." : next.beats[next.step];
    toast(`${w.name} · ${arc.title}`, { description: body });
    void notifyWorld({ title: `${w.name} · ${arc.title}`, body, path: `/worlds/${w.id}/timeline` });
    if (!next.doneAt) await dispatch(tellTheNews(w, `${arc.title}: ${body}`, [], now));
  }
};

// Places fill up (#177): everyone gets a usual spot on the map.
export const fillPlaces: Job = (now) => async (dispatch, getState) => {
  const { worlds, characters } = engineState(getState);
  const world = pickWorld("places", worlds, now, (w) => featureOn(w.id, "places") && hangoutsDue(w, castOf(characters, w.id), now));
  if (!world) return;
  const pins = world.map!.pins;
  const people = castOf(characters, world.id).filter((c) => !c.hangout || !pins.some((p) => p.id === c.hangout));
  await dispatch(patchWorld(world.id, { lastHangoutsAt: now }));
  const picked = parseHangouts(await dispatch(generateAssistText({ instruction: buildHangoutsPrompt(world.name, pins, people), background: true, activity: { at: now, kind: "other", text: `People in ${world.name} found their places`, name: world.name }, worldId: world.id })).unwrap(), people, pins);
  for (const c of people) if (picked[c.id]) await dispatch(patchCharacter(c.id, { hangout: picked[c.id] }));
};

// Someone at the same place runs into you (#183).
export const runIntoYou: Job = (now) => async (dispatch, getState) => {
  const { worlds, characters, chats, userName } = engineState(getState);
  const world = pickWorld("run-in", worlds, now, (w) => featureOn(w.id, "places") && whereYouAre(w, now) && runInDue(w, now));
  if (!world) return;
  const place = whereYouAre(world, now)!;
  const there = characters.filter((c) => c.worldId === world.id && whereIs(c, world.map?.pins || [], now)?.id === place.id);
  if (!there.length) return;
  await dispatch(patchWorld(world.id, { lastRunInAt: now }));
  await dispatch(shareNews({ world, cast: there, chats, userName, news: `${userName} is at ${place.name} right now, and so are you - you've just spotted them`, about: there.map((c) => c.id), max: 1, now }));
};

// World events (#162).
export const startOwnEvent: Job = (now) => async (dispatch, getState) => {
  const { worlds, characters } = engineState(getState);
  const world = pickWorld("events", worlds, now, (w) => castOf(characters, w.id).length >= 2 && featureOn(w.id, "events") && eventDue(w, now, lifeScaled(EVENT_GAP_MS)));
  if (!world) return;
  // The check is recorded first, so a failed one waits a whole gap.
  await dispatch(patchWorld(world.id, { lastEventCheckAt: now }));
  const reply = await dispatch(generateAssistText({
    instruction: buildEventIdeaPrompt(world, castOf(characters, world.id).map((c) => c.name), world.events || []),
    background: true,
    activity: { at: now, kind: "event", text: `Something happened in ${world.name}`, name: world.name },
    worldId: world.id,
  })).unwrap();
  const event = parseEvent(reply, now);
  const fresh = engineState(getState).worlds.find((w) => w.id === world.id);
  if (!event || !fresh) return;
  await dispatch(startWorldEvent(fresh, event));
  toast(`${world.name}: ${event.title}`, { description: event.text });
  void notifyWorld({ title: `${world.name}: ${event.title}`, body: event.text, path: "/worlds" });
  await dispatch(tellTheNews(world, `${event.title}: ${event.text}`, [], now));
};

// Life events (#164).
export const moveLivesOn: Job = (now) => async (dispatch, getState) => {
  const { worlds, characters } = engineState(getState);
  const world = pickWorld("lives", worlds, now, (w) => castOf(characters, w.id).length > 0 && featureOn(w.id, "arrivals") && lifeEventDue(w, now, lifeScaled(LIFE_GAP_MS)));
  if (!world) return;
  await dispatch(patchWorld(world.id, { lastLifeAt: now }));
  const who = pickLifeSubject(castOf(characters, world.id), now);
  if (!who) return;
  const people = (who.ties || []).map((t) => characters.find((c) => c.id === t.withId)?.name).filter((n): n is string => Boolean(n));
  const text = cleanLifeEvent(await dispatch(generateAssistText({ instruction: buildLifeEventPrompt(who, world, people), background: true, activity: { at: now, kind: "event", text: `Something happened in ${who.name}'s life`, characterId: who.id, name: who.name } })).unwrap());
  if (!text) return;
  await dispatch(patchCharacter(who.id, (latest) => addLifeEvent(latest, text, now)));
  // Their own news (#203): it travels by talk, and by them texting you.
  void logToTimeline(world.id, { kind: "event", text, characterIds: [who.id], audience: "private", at: now }, world.storyTime);
  await dispatch(tellTheNews(world, text, [who.id], now));
};

// Newcomers (#164), waiting for you to welcome them.
export const welcomeNewcomer: Job = (now) => async (dispatch, getState) => {
  const { worlds, characters } = engineState(getState);
  const world = pickWorld("newcomers", worlds, now, (w) => featureOn(w.id, "arrivals") && newcomerDue(w, castOf(characters, w.id).length, now, lifeScaled(NEWCOMER_GAP_MS)));
  if (!world) return;
  const cast = castOf(characters, world.id);
  await dispatch(patchWorld(world.id, { lastNewcomerAt: now }));
  const reply = await dispatch(generateAssistText({ instruction: buildCastSuggestionsPrompt(world, cast.map(castLiteOf), [], 1), background: true, activity: { at: now, kind: "event", text: `Someone new came to ${world.name}`, name: world.name }, worldId: world.id })).unwrap();
  const sg = parseCastSuggestions(reply, cast.map((c) => ({ name: c.name, description: c.description })))[0];
  const fresh = engineState(getState).worlds.find((w) => w.id === world.id);
  if (!sg || !fresh) return;
  await dispatch(patchWorld(fresh.id, { newcomer: { ...sg, at: now } }));
  const who = `${sg.name}${sg.tieWith ? `, ${sg.tieWith}'s ${sg.tie}` : ""}`;
  toast(`Someone new in ${world.name}`, { description: `${who}. Welcome them on the Worlds page.` });
  void notifyWorld({ title: `Someone new in ${world.name}`, body: who, path: "/worlds" });
};

// Your reputation (#166).
export const refreshReputation: Job = (now) => async (dispatch, getState) => {
  const { worlds, characters, userName } = engineState(getState);
  const world = pickWorld("reputation", worlds, now, (w) => castOf(characters, w.id).length > 0 && featureOn(w.id, "reputation") && reputationDue(w, now, lifeScaled(REPUTATION_GAP_MS)));
  if (!world) return;
  const cast = castOf(characters, world.id);
  const said = cast.flatMap((c) => (c.talks || []).flatMap((t) => t.lines.map((l) => ({ ...l, who: characters.find((x) => x.id === l.speakerId)?.name }))))
    .filter((l) => l.who && l.text.toLowerCase().includes(userName.toLowerCase()))
    .map((l) => `${l.who}: ${l.text}`);
  const text = cleanReputation(await dispatch(generateAssistText({ instruction: buildReputationPrompt(world, userName, cast, said), background: true, activity: { at: now, kind: "event", text: `Word about you got around ${world.name}`, name: world.name }, worldId: world.id })).unwrap());
  // Stamped even when nothing came back, so it waits a whole gap.
  await dispatch(patchWorld(world.id, (w) => ({ reputation: { text: text || w.reputation?.text || "", at: now } })));
};

// Introductions (#167): someone you talk to passes your number on to a
// person in their life, who texts you first.
export const introduce: Job = (now) => async (dispatch, getState) => {
  const { worlds, characters, chats, userName } = engineState(getState);
  const world = pickWorld("introductions", worlds, now, (w) => featureOn(w.id, "introductions") && introductionDue(w.lastIntroAt, now, lifeScaled(INTRO_GAP_MS)) && pickIntroduction(castOf(characters, w.id), chats));
  if (!world) return;
  const { by, to } = pickIntroduction(castOf(characters, world.id), chats)!;
  await dispatch(patchWorld(world.id, { lastIntroAt: now }));
  const heard = (by.memory || []).slice(-3);
  const text = cleanFirstText(await dispatch(generateAssistText({
    instruction: buildIntroductionPrompt(by, to, userName, heard, featureOn(world.id, "reputation") ? world.reputation?.text : undefined),
    background: true,
    activity: { at: now, kind: "first-text", text: `${by.name} introduced you to ${to.name}`, characterId: to.id, name: to.name },
  })).unwrap());
  if (!text) return;
  await dispatch(patchCharacter(to.id, (latest) => ({ memory: [...(latest.memory || []), introducedFact(by.name, userName)], knowsAbout: latest.knowsAbout?.includes(by.id) ? latest.knowsAbout : [...(latest.knowsAbout || []), by.id] })));
  const chat = await dispatch(addChat({ title: to.name, characterIds: [to.id] })).unwrap();
  await dispatch(addMessage({ chatId: chat.id, role: AI, text, speakerId: to.id, notes: ["texted-first"], noGreeting: true, at: now }));
  const byChat = engineState(getState).chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === by.id && !c.whatIf);
  if (byChat?.id) await dispatch(addChatNotice({ chatId: byChat.id, text: `${by.name} gave ${to.name} your number` }));
  await dispatch(fetchChats());
  void logToTimeline(world.id, { kind: "you", text: `${by.name} introduced you to ${to.name}`, characterIds: [by.id, to.id], at: now }, world.storyTime);
  toast.message(`${by.name} introduced you to ${to.name}`, { description: text.length > 90 ? `${text.slice(0, 87)}...` : text, action: { label: "Open", onClick: () => { window.location.hash = `#/chat/${chat.id}`; } } });
};

// Secrets between characters (#170): someone starts hiding something from
// a person in their life, and a friend of theirs may let it slip to you.
export const keepSecret: Job = (now) => async (dispatch, getState) => {
  const { worlds, characters, chats, userName } = engineState(getState);
  const world = pickWorld("secrets", worlds, now, (w) => featureOn(w.id, "secrets") && secretDue(w.lastSecretAt, now, lifeScaled(SECRET_GAP_MS)) && pickSecretPair(castOf(characters, w.id)));
  if (!world) return;
  const cast = castOf(characters, world.id);
  const { keeper, from } = pickSecretPair(cast)!;
  const gossip = pickGossip(cast, chats, keeper, from);
  await dispatch(patchWorld(world.id, { lastSecretAt: now }));
  const parsed = parseSecret(await dispatch(generateAssistText({ instruction: buildSecretPrompt(keeper, from, gossip, userName), background: true, activity: { at: now, kind: "other", text: `${keeper.name} started keeping something from ${from.name}`, characterId: keeper.id, name: keeper.name } })).unwrap());
  if (!parsed) return;
  const told = gossip && parsed.gossip ? gossip : undefined;
  await dispatch(patchCharacter(keeper.id, (latest) => addSecret(latest, { id: `sec-${now.toString(36)}`, fromId: from.id, text: parsed.secret, at: now, ...(told ? { heardFrom: told.id } : {}) })));
  if (!told) return;
  const chat = engineState(getState).chats.find((ch) => ch.characterIds?.length === 1 && ch.characterIds[0] === told.id && !ch.whatIf);
  if (!chat?.id) return;
  await dispatch(addMessage({ chatId: chat.id, role: AI, text: parsed.gossip!, speakerId: told.id, notes: ["texted-first"], at: now }));
  await dispatch(fetchChats());
  void logToTimeline(world.id, { kind: "you", text: `${told.name} told you something ${keeper.name} is hiding from ${from.name}`, characterIds: [told.id, keeper.id, from.id], knownBy: [told.id], at: now }, world.storyTime);
  toast.message(`${told.name} texted you`, { description: parsed.gossip!.length > 90 ? `${parsed.gossip!.slice(0, 87)}...` : parsed.gossip, action: { label: "Open", onClick: () => { window.location.hash = `#/chat/${chat.id}`; } } });
};

// Secrets come out on their own (#184); no AI call.
export const surfaceSecret: Job = (now) => async (dispatch, getState) => {
  const { worlds, characters } = engineState(getState);
  const world = pickWorld("secrets-out", worlds, now, (w) => featureOn(w.id, "secrets") && secretReadyToSurface(castOf(characters, w.id), now, lifeScaled(SECRET_OUT_AFTER_MS)));
  if (!world) return;
  const { keeper, secret } = secretReadyToSurface(castOf(characters, world.id), now, lifeScaled(SECRET_OUT_AFTER_MS))!;
  const from = characters.find((c) => c.id === secret.fromId);
  if (!from) return;
  const how = HOW_IT_CAME_OUT[Math.floor(Math.random() * HOW_IT_CAME_OUT.length)]!;
  const facts = surfacedFacts(keeper.name, from.name, secret.text, how);
  await dispatch(patchCharacter(keeper.id, (latest) => ({ memory: [...(latest.memory || []), facts.forKeeper], keptSecrets: (latest.keptSecrets || []).map((s) => (s.id === secret.id ? { ...s, outAt: now, how } : s)) })));
  await dispatch(patchCharacter(from.id, (latest) => ({ memory: [...(latest.memory || []), facts.forFrom] })));
  void logToTimeline(world.id, { kind: "event", text: facts.timeline, characterIds: [keeper.id, from.id], audience: "private", at: now }, world.storyTime);
  toast(`${world.name}: ${facts.timeline}`, { description: secret.text });
  void notifyWorld({ title: `${world.name}: ${facts.timeline}`, body: secret.text, path: `/worlds/${world.id}/timeline` });
  await dispatch(tellTheNews(world, facts.forFrom, [from.id], now));
};

// Plans resolve (#184): a reminder the day before, and how it went once
// the day has passed without you saying.
export const keepPlans: Job = (now) => async (dispatch, getState) => {
  const { characters, chats, worlds, userName } = engineState(getState);
  for (const chat of chats.filter((c) => c.groupPlan && c.id)) {
    const plan = chat.groupPlan!;
    const world = worlds.find((w) => w.id === chat.worldId);
    try {
      if (planReminderDue(plan, now)) {
        const members = characters.filter((c) => plan.memberIds.includes(c.id));
        const who = members[Math.floor(Math.random() * members.length)];
        await dispatch(updateChatOptions({ chatId: chat.id!, patch: { groupPlan: { ...plan, remindedAt: now } } }));
        if (!who) continue;
        const text = cleanFirstText(await dispatch(generateAssistText({ instruction: buildPlanReminderPrompt(plan, who, members.filter((m) => m.id !== who.id).map((m) => m.name), userName), background: true, activity: { at: now, kind: "first-text", text: `${who.name} reminded everyone about ${plan.title}`, characterId: who.id, name: who.name } })).unwrap());
        if (text) await dispatch(addMessage({ chatId: chat.id!, role: AI, text, speakerId: who.id, at: now }));
      } else if (planPassed(plan, now)) {
        await dispatch(writePlanOutcome(chat, characters, world, userName, undefined, true));
        toast(`${plan.title} happened`, { description: "How it went is in its group chat." });
        void notifyWorld({ title: `${plan.title} happened`, body: "How it went is in its group chat.", path: `/chat/${chat.id}` });
      }
    } catch (err) {
      console.warn("Plan follow-up failed (non-fatal):", err);
    }
  }
};

// A busy day's digest (#194), when you're not looking.
export const sendDigest: Job = (now) => async (_dispatch, getState) => {
  if (document.visibilityState !== "hidden") return;
  let count = 0;
  for (const id of [null, ...engineState(getState).worlds.map((w) => w.id)]) {
    count += (await loadTimeline(id)).filter((e) => now - e.at < 86_400_000 && e.kind !== "talk").length;
  }
  if (!digestDue(count, now, lastDigestAt())) return;
  const shown = await notifyWorld({ title: "A busy day in your worlds", body: `${count} things happened today. Tap to see what.`, path: "/", tag: "world-digest" });
  if (shown) markDigest(now);
};

const JOBS: [string, Job][] = [
  ["Storyline", moveStorylines],
  ["Digest", sendDigest],
  ["Places", fillPlaces],
  ["Run-in", runIntoYou],
  ["World event", startOwnEvent],
  ["World life", moveLivesOn],
  ["Newcomer", welcomeNewcomer],
  ["Reputation", refreshReputation],
  ["Introduction", introduce],
  ["Secret", keepSecret],
  ["Secret out", surfaceSecret],
  ["Plans", keepPlans],
];

// One check of a world's life: every job gets its turn, each when its own
// gap has passed (#174). A failing one never stops the rest.
export const worldLifeCheck = (now: number) => async (dispatch: EngineDispatch) => {
  for (const [name, job] of JOBS) {
    try {
      await dispatch(job(now));
    } catch (err) {
      console.warn(`${name} failed (non-fatal):`, err);
    }
  }
};
