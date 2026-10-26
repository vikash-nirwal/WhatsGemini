import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { patchWorld } from "src/features/worldSlice";
import { buildEventIdeaPrompt, EVENT_GAP_MS, eventDue, parseEvent } from "src/features/world/worldEvents";
import { moveArcOn, startWorldEvent } from "src/features/world/startEvent";
import { advanceArc, arcActive, BEAT_GAP_MS, nextBeatDue } from "src/features/world/worldArcs";
import { lifeScaled } from "src/features/life/lifeDial";
import { catchUpTime } from "src/features/life/away";
import { shareNews } from "src/features/world/shareNews";
import { World } from "src/types";
import { buildHangoutsPrompt, hangoutsDue, parseHangouts } from "src/features/world/places";
import { useLivingCharacters } from "src/hooks/useWorld";
import { featureOn } from "src/features/world/worldPrefs";
import { updateCharacter } from "src/features/characterSlice";
import { addLifeEvent, buildLifeEventPrompt, cleanLifeEvent, LIFE_GAP_MS, lifeEventDue, NEWCOMER_GAP_MS, newcomerDue, pickLifeSubject } from "src/features/world/worldLife";
import { buildCastSuggestionsPrompt, castLiteOf, parseCastSuggestions } from "src/features/world/worldAssist";
import { logToTimeline } from "src/features/world/timeline";
import { toast } from "sonner";
import { selectActivePersona } from "src/features/settingsSlice";
import { buildIntroductionPrompt, introducedFact, INTRO_GAP_MS, introductionDue, pickIntroduction } from "src/features/world/introductions";
import { addChat, addChatNotice, addMessage, fetchChats } from "src/features/chatSlice";
import { cleanFirstText } from "src/features/character/firstTexts";
import { AI } from "src/utils/constants";
import { addSecret, buildSecretPrompt, parseSecret, pickGossip, pickSecretPair, SECRET_GAP_MS, secretDue } from "src/features/world/secrets";
import { buildReputationPrompt, cleanReputation, REPUTATION_GAP_MS, reputationDue } from "src/features/world/reputation";

// Every 20 minutes, each feature on its own gap (#174): one shared turn
// every two hours left a world with everything on doing one thing a visit.
// The gaps and the life dial keep the number of calls where it was.
const CHECK_EVERY_MS = 20 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000;

// A world's own life, while the app is open, on the helper model: its
// storyline moves on (#169), it starts events (#162), lives move on and
// newcomers arrive (#164), word about you gets around (#166), people
// introduce you (#167) and keep secrets (#170). Each check gives every one
// of them its turn, each when its own gap has passed; the first check after
// time away is stamped inside that absence, as the other jobs do.
const WorldEventWatcher = () => {
  const dispatch = useAppDispatch();
  const worlds = useAppSelector((state) => state.world.worlds);
  const characters = useLivingCharacters();
  const persona = useAppSelector(selectActivePersona);
  const chats = useAppSelector((state) => state.chat.chats);
  const latest = useRef({ worlds, characters, persona, chats });
  latest.current = { worlds, characters, persona, chats };
  const busy = useRef(false);

  useEffect(() => {
    const check = async (at?: number) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const now = at ?? Date.now();
        // Storylines (#169) move to their next beat on their own; no AI call.
        for (const w of latest.current.worlds) {
          const arc = arcActive(w);
          if (arc && nextBeatDue(arc, now, lifeScaled(BEAT_GAP_MS))) {
            await dispatch(moveArcOn(w, now));
            // A notice (#175), so a new chapter isn't only in the timeline.
            const next = advanceArc(arc, now);
            toast(`${w.name} · ${arc.title}`, { description: next.doneAt ? "The storyline has ended." : next.beats[next.step] });
            if (!next.doneAt) await tellTheNews(w, `${arc.title}: ${next.beats[next.step]}`, [], now);
          }
        }
        for (const job of [fillPlaces, startOwnEvent, moveLivesOn, welcomeNewcomer, refreshReputation, introduce, keepSecret]) await job(now);
      } finally {
        busy.current = false;
      }
    };
    // Places fill up (#177): everyone gets a usual spot on the map.
    const fillPlaces = async (now: number) => {
      const { worlds, characters } = latest.current;
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const world = worlds.find((w) => featureOn(w.id, "places") && hangoutsDue(w, castOf(w.id), now));
      if (!world) return;
      const pins = world.map!.pins;
      const people = castOf(world.id).filter((c) => !c.hangout || !pins.some((p) => p.id === c.hangout));
      try {
        await dispatch(patchWorld(world.id, { lastHangoutsAt: now }));
        const picked = parseHangouts(await dispatch(generateAssistText({ instruction: buildHangoutsPrompt(world.name, pins, people), background: true, activity: { at: now, kind: "other", text: `People in ${world.name} found their places`, name: world.name }, worldId: world.id })).unwrap(), people, pins);
        for (const c of people) {
          const fresh = latest.current.characters.find((x) => x.id === c.id);
          if (fresh && picked[c.id]) await dispatch(updateCharacter({ ...fresh, hangout: picked[c.id] }));
        }
      } catch (err) {
        console.warn("Places failed (non-fatal):", err);
      }
    };
    // The news reaches you (#178): one or two people close to it text you.
    const tellTheNews = async (world: World, news: string, about: number[], now: number) => {
      const { characters, chats, persona } = latest.current;
      await dispatch(shareNews({ world, cast: characters.filter((c) => c.worldId === world.id), chats, userName: persona?.name?.trim() || "the user", news, about, now }));
    };
    const startOwnEvent = async (now: number) => {
      const { worlds, characters } = latest.current;
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const world = worlds.find((w) => castOf(w.id).length >= 2 && featureOn(w.id, "events") && eventDue(w, now, lifeScaled(EVENT_GAP_MS)));
      if (!world) return;
      try {
        // The check is recorded first, so a failed one waits a whole gap.
        await dispatch(patchWorld(world.id, { lastEventCheckAt: now }));
        const reply = await dispatch(generateAssistText({
          instruction: buildEventIdeaPrompt(world, castOf(world.id).map((c) => c.name), world.events || []),
          background: true,
          activity: { at: now, kind: "event", text: `Something happened in ${world.name}`, name: world.name },
          worldId: world.id,
        })).unwrap();
        const event = parseEvent(reply, now);
        const fresh = latest.current.worlds.find((w) => w.id === world.id);
        if (event && fresh) {
          await dispatch(startWorldEvent(fresh, event));
          toast(`${world.name}: ${event.title}`, { description: event.text });
          await tellTheNews(world, `${event.title}: ${event.text}`, [], now);
        }
      } catch (err) {
        console.warn("World event failed (non-fatal):", err);
      }
    };
    const moveLivesOn = async (now: number) => {
      const { worlds, characters } = latest.current;
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const world = worlds.find((w) => castOf(w.id).length > 0 && featureOn(w.id, "arrivals") && lifeEventDue(w, now, lifeScaled(LIFE_GAP_MS)));
      if (!world) return;
      try {
        const cast = castOf(world.id);
        await dispatch(patchWorld(world.id, { lastLifeAt: now }));
        const who = pickLifeSubject(cast, now);
        if (!who) return;
        const people = (who.ties || []).map((t) => characters.find((c) => c.id === t.withId)?.name).filter((n): n is string => Boolean(n));
        const text = cleanLifeEvent(await dispatch(generateAssistText({ instruction: buildLifeEventPrompt(who, world, people), background: true, activity: { at: now, kind: "event", text: `Something happened in ${who.name}'s life`, characterId: who.id, name: who.name } })).unwrap());
        const fresh = latest.current.characters.find((c) => c.id === who.id);
        if (!text || !fresh) return;
        await dispatch(updateCharacter(addLifeEvent(fresh, text, now)));
        void logToTimeline(world.id, { kind: "event", text, characterIds: [who.id], at: now }, world.storyTime);
        await tellTheNews(world, text, [who.id], now);
      } catch (err) {
        console.warn("World life failed (non-fatal):", err);
      }
    };
    const welcomeNewcomer = async (now: number) => {
      const { worlds, characters } = latest.current;
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const world = worlds.find((w) => featureOn(w.id, "arrivals") && newcomerDue(w, castOf(w.id).length, now, lifeScaled(NEWCOMER_GAP_MS)));
      if (!world) return;
      try {
        const cast = castOf(world.id);
        await dispatch(patchWorld(world.id, { lastNewcomerAt: now }));
        const reply = await dispatch(generateAssistText({ instruction: buildCastSuggestionsPrompt(world, cast.map(castLiteOf), [], 1), background: true, activity: { at: now, kind: "event", text: `Someone new came to ${world.name}`, name: world.name }, worldId: world.id })).unwrap();
        const sg = parseCastSuggestions(reply, cast.map((c) => ({ name: c.name, description: c.description })))[0];
        const fresh = latest.current.worlds.find((w) => w.id === world.id);
        if (!sg || !fresh) return;
        await dispatch(patchWorld(fresh.id, { newcomer: { ...sg, at: now } }));
        toast(`Someone new in ${world.name}`, { description: `${sg.name}${sg.tieWith ? `, ${sg.tieWith}'s ${sg.tie}` : ""}. Welcome them on the Worlds page.` });
      } catch (err) {
        console.warn("World life failed (non-fatal):", err);
      }
    };
    // Your reputation (#166).
    const refreshReputation = async (now: number) => {
      const { worlds, characters, persona } = latest.current;
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const world = worlds.find((w) => castOf(w.id).length > 0 && featureOn(w.id, "reputation") && reputationDue(w, now, lifeScaled(REPUTATION_GAP_MS)));
      if (!world) return;
      const userName = persona?.name?.trim() || "the user";
      try {
        const cast = castOf(world.id);
        const said = cast.flatMap((c) => (c.talks || []).flatMap((t) => t.lines.map((l) => ({ ...l, who: characters.find((x) => x.id === l.speakerId)?.name }))))
          .filter((l) => l.who && l.text.toLowerCase().includes(userName.toLowerCase()))
          .map((l) => `${l.who}: ${l.text}`);
        const text = cleanReputation(await dispatch(generateAssistText({ instruction: buildReputationPrompt(world, userName, cast, said), background: true, activity: { at: now, kind: "event", text: `Word about you got around ${world.name}`, name: world.name }, worldId: world.id })).unwrap());
        const fresh = latest.current.worlds.find((w) => w.id === world.id);
        // Stamped even when nothing came back, so it waits a whole gap.
        if (fresh) await dispatch(patchWorld(fresh.id, (w) => ({ reputation: { text: text || w.reputation?.text || "", at: now } })));
      } catch (err) {
        console.warn("Reputation failed (non-fatal):", err);
      }
    };
    // Introductions (#167): someone you talk to passes your number on to a
    // person in their life, who texts you first.
    const introduce = async (now: number) => {
      const { worlds, characters, persona, chats } = latest.current;
      const userName = persona?.name?.trim() || "the user";
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const world = worlds.find((w) => featureOn(w.id, "introductions") && introductionDue(w.lastIntroAt, now, lifeScaled(INTRO_GAP_MS)) && pickIntroduction(castOf(w.id), chats));
      if (!world) return;
      const pair = pickIntroduction(castOf(world.id), chats)!;
      try {
        await dispatch(patchWorld(world.id, { lastIntroAt: now }));
        const { by, to } = pair;
        const heard = (by.memory || []).slice(-3);
        const text = cleanFirstText(await dispatch(generateAssistText({
          instruction: buildIntroductionPrompt(by, to, userName, heard, featureOn(world.id, "reputation") ? world.reputation?.text : undefined),
          background: true,
          activity: { at: now, kind: "first-text", text: `${by.name} introduced you to ${to.name}`, characterId: to.id, name: to.name },
        })).unwrap());
        if (!text) return;
        const fresh = latest.current.characters.find((c) => c.id === to.id) || to;
        await dispatch(updateCharacter({ ...fresh, memory: [...(fresh.memory || []), introducedFact(by.name, userName)], knowsAbout: fresh.knowsAbout?.includes(by.id) ? fresh.knowsAbout : [...(fresh.knowsAbout || []), by.id] }));
        const chat = await dispatch(addChat({ title: to.name, characterIds: [to.id] })).unwrap();
        await dispatch(addMessage({ chatId: chat.id, role: AI, text, speakerId: to.id, notes: ["texted-first"], noGreeting: true, at: now }));
        const byChat = latest.current.chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === by.id && !c.whatIf);
        if (byChat?.id) await dispatch(addChatNotice({ chatId: byChat.id, text: `${by.name} gave ${to.name} your number` }));
        await dispatch(fetchChats());
        void logToTimeline(world.id, { kind: "you", text: `${by.name} introduced you to ${to.name}`, characterIds: [by.id, to.id], at: now }, world.storyTime);
        toast.message(`${by.name} introduced you to ${to.name}`, { description: text.length > 90 ? `${text.slice(0, 87)}...` : text, action: { label: "Open", onClick: () => { window.location.hash = `#/chat/${chat.id}`; } } });
      } catch (err) {
        console.warn("Introduction failed (non-fatal):", err);
      }
    };
    // Secrets between characters (#170): someone starts hiding something
    // from a person in their life, and a friend of theirs may let it slip
    // to you.
    const keepSecret = async (now: number) => {
      const { worlds, characters, persona, chats } = latest.current;
      const userName = persona?.name?.trim() || "the user";
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const world = worlds.find((w) => featureOn(w.id, "secrets") && secretDue(w.lastSecretAt, now, lifeScaled(SECRET_GAP_MS)) && pickSecretPair(castOf(w.id)));
      if (!world) return;
      const cast = castOf(world.id);
      const { keeper, from } = pickSecretPair(cast)!;
      const gossip = pickGossip(cast, chats, keeper, from);
      try {
        await dispatch(patchWorld(world.id, { lastSecretAt: now }));
        const parsed = parseSecret(await dispatch(generateAssistText({ instruction: buildSecretPrompt(keeper, from, gossip, userName), background: true, activity: { at: now, kind: "other", text: `${keeper.name} started keeping something from ${from.name}`, characterId: keeper.id, name: keeper.name } })).unwrap());
        const fresh = latest.current.characters.find((c) => c.id === keeper.id);
        if (!parsed || !fresh) return;
        const told = gossip && parsed.gossip ? gossip : undefined;
        await dispatch(updateCharacter(addSecret(fresh, { id: `sec-${now.toString(36)}`, fromId: from.id, text: parsed.secret, at: now, ...(told ? { heardFrom: told.id } : {}) })));
        if (!told) return;
        const chat = latest.current.chats.find((ch) => ch.characterIds?.length === 1 && ch.characterIds[0] === told.id && !ch.whatIf);
        if (!chat?.id) return;
        await dispatch(addMessage({ chatId: chat.id, role: AI, text: parsed.gossip!, speakerId: told.id, notes: ["texted-first"], at: now }));
        await dispatch(fetchChats());
        void logToTimeline(world.id, { kind: "you", text: `${told.name} told you something ${keeper.name} is hiding from ${from.name}`, characterIds: [told.id, keeper.id, from.id], at: now }, world.storyTime);
        toast.message(`${told.name} texted you`, { description: parsed.gossip!.length > 90 ? `${parsed.gossip!.slice(0, 87)}...` : parsed.gossip, action: { label: "Open", onClick: () => { window.location.hash = `#/chat/${chat.id}`; } } });
      } catch (err) {
        console.warn("Secret failed (non-fatal):", err);
      }
    };
    // The catch-up turn is claimed when the timer fires, not at mount.
    const first = window.setTimeout(() => void check(catchUpTime("world-life")), FIRST_CHECK_MS);
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch]);

  return null;
};

export default WorldEventWatcher;
