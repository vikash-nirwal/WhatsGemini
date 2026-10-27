import { toast } from "sonner";
import { World } from "../../../types";
import { generateAssistText } from "../../aiSlice";
import { patchCharacter } from "../../characterSlice";
import { patchWorld } from "../../worldSlice";
import { lifeScaled } from "../../life/lifeDial";
import { fairOrder, markServed } from "../../life/scheduler";
import { notifyWorld } from "../../notifications/notifications";
import { lifeEventTone, nudgeMood } from "../bonds";
import { audienceOf } from "../knowledge";
import { buildSceneNow } from "../sceneNow";
import { startWorldEvent } from "../startEvent";
import { loadTimeline, logToTimeline } from "../timeline";
import { arcActive, arcLine } from "../worldArcs";
import { activeEvents, EVENT_GAP_MS, eventDue, newEventId } from "../worldEvents";
import { addLifeEvent, LIFE_GAP_MS, lifeEventDue } from "../worldLife";
import { featureOn, talkLengthFor } from "../worldPrefs";
import { parseTieChange, WORLD_TALK_GAP_MS } from "../worldTalk";
import { buildWorldTurnPrompt, dueTalkPairs, eventFromTurn, parseWorldTurn, WORLD_TURN_GAP_MS, worldTurnDue, WorldTurnAsk } from "../worldTurn";
import { afterTalk, tellTheNews } from "./shared";
import { talkSettingFor } from "../talkMedium";
import { bringsBackGone, goneIn, worldContext } from "../canon";
import { addExtras } from "../extras";
import { EngineDispatch, engineState, GetState } from "./state";

const DAY = 24 * 60 * 60 * 1000;

// A world turn (#212), for worlds with the switch on: one call writes the
// talk, the event and the life event that would each have been a call of
// their own, and each lands the way those jobs land them.
export const worldTurn = (now: number) => async (dispatch: EngineDispatch, getState: GetState) => {
  const { worlds, characters, userName } = engineState(getState);
  const castOf = (w: World) => characters.filter((c) => c.worldId === w.id);
  const askFor = (w: World): WorldTurnAsk => {
    const cast = castOf(w);
    const pairs = dueTalkPairs(cast, now, lifeScaled(WORLD_TALK_GAP_MS));
    return {
      pairs,
      settings: pairs.map(([a, b]) => talkSettingFor(a, b, w, now)),
      maxLines: Math.min(8, talkLengthFor(w.id)),
      event: cast.length >= 2 && featureOn(w.id, "events") && eventDue(w, now, lifeScaled(EVENT_GAP_MS)),
      life: cast.length > 0 && featureOn(w.id, "arrivals") && lifeEventDue(w, now, lifeScaled(LIFE_GAP_MS)),
      tie: featureOn(w.id, "drift"),
      people: featureOn(w.id, "extras"),
    };
  };
  const anything = (ask: WorldTurnAsk) => ask.pairs.length > 0 || ask.event || ask.life;
  let ask: WorldTurnAsk | undefined;
  const world = fairOrder("world-turn", worlds, (w) => w.id, now).find((w) => {
    if (!featureOn(w.id, "worldTurn") || !worldTurnDue(w, now, lifeScaled(WORLD_TURN_GAP_MS))) return false;
    ask = askFor(w);
    return anything(ask);
  });
  if (!world || !ask) return;
  markServed("world-turn", world.id, now);
  const cast = castOf(world);
  // Stamped first, so a failed turn waits a whole gap, like the jobs it
  // stands in for.
  await dispatch(patchWorld(world.id, { lastTurnAt: now, ...(ask.event ? { lastEventCheckAt: now } : {}), ...(ask.life ? { lastLifeAt: now } : {}) }));
  const record = await loadTimeline(world.id);
  const recent = record
    .filter((e) => e.kind !== "talk" && e.kind !== "begin" && audienceOf(e) === "public" && now - e.at < 3 * DAY)
    .slice(-8)
    .map((e) => e.text);
  const event = activeEvents(world, now)[0];
  const reply = await dispatch(generateAssistText({
    instruction: buildWorldTurnPrompt(world, cast, ask, { userName, recent, happening: event ? `${event.title}: ${event.text}` : undefined, storyline: arcLine(arcActive(world)), sceneNow: buildSceneNow(world, cast, now), now, context: worldContext(world, [], engineState(getState).everyone.filter((c) => c.worldId === world.id), record) }),
    background: true,
    activity: { at: now, kind: "event", text: `Time moved on in ${world.name}`, name: world.name },
    worldId: world.id,
    replyKind: "world-turn",
  })).unwrap();
  const parsed = parseWorldTurn(reply, cast, ask);
  if (!parsed) return;
  // Anything that puts someone who has died back on stage is dropped (#220).
  const gone = goneIn(engineState(getState).everyone, world.id);
  const back = (text: string) => bringsBackGone(text, gone);
  const turn = {
    ...parsed,
    talks: parsed.talks.filter((t) => !t.lines.some((l) => back(l.text))),
    event: parsed.event && !back(`${parsed.event.title} ${parsed.event.text}`) ? parsed.event : undefined,
    life: parsed.life && !back(parsed.life.text) ? parsed.life : undefined,
  };
  for (const t of turn.talks) {
    await dispatch(afterTalk({ a: t.a, b: t.b, worldId: world.id, world, lines: t.lines, setting: t.setting, change: t.tie ? parseTieChange(`TIE: ${t.tie}`) : undefined, now }));
  }
  // Someone new came up by name (#218).
  if (turn.people?.length) await dispatch(patchWorld(world.id, (w) => ({ extras: addExtras(w.extras, turn.people!, cast, now) })));
  if (turn.event) {
    const fresh = engineState(getState).worlds.find((w) => w.id === world.id);
    const made = eventFromTurn(turn.event, newEventId(), now);
    if (fresh) {
      await dispatch(startWorldEvent(fresh, made));
      toast(`${world.name}: ${made.title}`, { description: made.text });
      void notifyWorld({ title: `${world.name}: ${made.title}`, body: made.text, path: "/worlds" });
      await dispatch(tellTheNews(world, `${made.title}: ${made.text}`, [], now));
    }
  }
  if (turn.life) {
    const { who, text } = turn.life;
    await dispatch(patchCharacter(who.id, (latest) => ({ ...addLifeEvent(latest, text, now), ...nudgeMood(latest, lifeEventTone(text), now, text) })));
    void logToTimeline(world.id, { kind: "event", text, characterIds: [who.id], audience: "private", at: now }, world.storyTime);
    // Only when no event already sent someone to tell you, so a turn
    // brings one text, not two.
    if (!turn.event) await dispatch(tellTheNews(world, text, [who.id], now));
  }
};
