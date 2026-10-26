import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { updateWorld } from "src/features/worldSlice";
import { buildEventIdeaPrompt, EVENT_GAP_MS, eventDue, parseEvent } from "src/features/world/worldEvents";
import { moveArcOn, startWorldEvent } from "src/features/world/startEvent";
import { arcActive, BEAT_GAP_MS, nextBeatDue } from "src/features/world/worldArcs";
import { lifeScaled } from "src/features/life/lifeDial";
import { useLivingCharacters } from "src/hooks/useWorld";
import { featureOn } from "src/features/world/worldPrefs";
import { updateCharacter } from "src/features/characterSlice";
import { addLifeEvent, buildLifeEventPrompt, cleanLifeEvent, LIFE_GAP_MS, lifeEventDue, NEWCOMER_GAP_MS, newcomerDue, pickLifeSubject } from "src/features/world/worldLife";
import { buildCastSuggestionsPrompt, parseCastSuggestions } from "src/features/world/worldAssist";
import { logToTimeline } from "src/features/world/timeline";
import { toast } from "sonner";
import { selectActivePersona } from "src/features/settingsSlice";
import { buildIntroductionPrompt, introducedFact, INTRO_GAP_MS, introductionDue, pickIntroduction } from "src/features/world/introductions";
import { addChat, addChatNotice, addMessage, fetchChats } from "src/features/chatSlice";
import { cleanFirstText } from "src/features/character/firstTexts";
import { AI } from "src/utils/constants";
import { addSecret, buildSecretPrompt, parseSecret, pickGossip, pickSecretPair, SECRET_GAP_MS, secretDue } from "src/features/world/secrets";
import { buildReputationPrompt, cleanReputation, REPUTATION_GAP_MS, reputationDue } from "src/features/world/reputation";

const CHECK_EVERY_MS = 2 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000;

// World events (#162): while the app is open, a world with people in it
// that's been quiet for a few days starts an event of its own, one world
// per check, on the helper model. The same check moves lives on (#164):
// something happens in someone's life, or a newcomer turns up for you to
// welcome. One thing per check.
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
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const { worlds, characters } = latest.current;
      // Storylines (#169) move to their next beat on their own; no AI call.
      for (const w of worlds) {
        const arc = arcActive(w);
        if (arc && nextBeatDue(arc, now, lifeScaled(BEAT_GAP_MS))) await dispatch(moveArcOn(w, now));
      }
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const world = worlds.find((w) => castOf(w.id).length >= 2 && featureOn(w.id, "events") && eventDue(w, now, lifeScaled(EVENT_GAP_MS)));
      if (!world) {
        await moveLivesOn(now);
        return;
      }
      busy.current = true;
      try {
        // The check is recorded first, so a failed one waits a whole gap.
        await dispatch(updateWorld({ ...world, lastEventCheckAt: now }));
        const reply = await dispatch(generateAssistText({
          instruction: buildEventIdeaPrompt(world, castOf(world.id).map((c) => c.name), world.events || []),
          background: true,
          activity: { at: now, kind: "event", text: `Something happened in ${world.name}`, name: world.name },
        })).unwrap();
        const event = parseEvent(reply, now);
        const fresh = latest.current.worlds.find((w) => w.id === world.id);
        if (event && fresh) await dispatch(startWorldEvent(fresh, event));
      } catch (err) {
        console.warn("World event failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    const moveLivesOn = async (now: number) => {
      const { worlds, characters } = latest.current;
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const living = worlds.find((w) => castOf(w.id).length > 0 && featureOn(w.id, "arrivals") && lifeEventDue(w, now, lifeScaled(LIFE_GAP_MS)));
      const arriving = living ? undefined : worlds.find((w) => featureOn(w.id, "arrivals") && newcomerDue(w, castOf(w.id).length, now, lifeScaled(NEWCOMER_GAP_MS)));
      const world = living || arriving;
      if (!world) {
        await refreshReputation(now);
        return;
      }
      busy.current = true;
      try {
        const cast = castOf(world.id);
        if (living) {
          await dispatch(updateWorld({ ...world, lastLifeAt: now }));
          const who = pickLifeSubject(cast, now);
          if (!who) return;
          const people = (who.ties || []).map((t) => characters.find((c) => c.id === t.withId)?.name).filter((n): n is string => Boolean(n));
          const text = cleanLifeEvent(await dispatch(generateAssistText({ instruction: buildLifeEventPrompt(who, world, people), background: true, activity: { at: now, kind: "event", text: `Something happened in ${who.name}'s life`, characterId: who.id, name: who.name } })).unwrap());
          const fresh = latest.current.characters.find((c) => c.id === who.id);
          if (!text || !fresh) return;
          await dispatch(updateCharacter(addLifeEvent(fresh, text, now)));
          void logToTimeline(world.id, { kind: "event", text, characterIds: [who.id], at: now }, world.storyTime);
        } else {
          await dispatch(updateWorld({ ...world, lastNewcomerAt: now }));
          const reply = await dispatch(generateAssistText({ instruction: buildCastSuggestionsPrompt(world, cast.map((c) => ({ name: c.name, description: c.description })), [], 1), background: true, activity: { at: now, kind: "event", text: `Someone new came to ${world.name}`, name: world.name } })).unwrap();
          const sg = parseCastSuggestions(reply, cast.map((c) => ({ name: c.name, description: c.description })))[0];
          const fresh = latest.current.worlds.find((w) => w.id === world.id);
          if (!sg || !fresh) return;
          await dispatch(updateWorld({ ...fresh, newcomer: { ...sg, at: now } }));
          toast(`Someone new in ${world.name}`, { description: `${sg.name}${sg.tieWith ? `, ${sg.tieWith}'s ${sg.tie}` : ""}. Welcome them on the Worlds page.` });
        }
      } catch (err) {
        console.warn("World life failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    // Your reputation (#166), when nothing else happened this check.
    const refreshReputation = async (now: number) => {
      const { worlds, characters, persona } = latest.current;
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const world = worlds.find((w) => castOf(w.id).length > 0 && featureOn(w.id, "reputation") && reputationDue(w, now, lifeScaled(REPUTATION_GAP_MS)));
      if (!world) {
        await introduce(now);
        return;
      }
      const userName = persona?.name?.trim() || "the user";
      busy.current = true;
      try {
        const cast = castOf(world.id);
        const said = cast.flatMap((c) => (c.talks || []).flatMap((t) => t.lines.map((l) => ({ ...l, who: characters.find((x) => x.id === l.speakerId)?.name }))))
          .filter((l) => l.who && l.text.toLowerCase().includes(userName.toLowerCase()))
          .map((l) => `${l.who}: ${l.text}`);
        const text = cleanReputation(await dispatch(generateAssistText({ instruction: buildReputationPrompt(world, userName, cast, said), background: true, activity: { at: now, kind: "event", text: `Word about you got around ${world.name}`, name: world.name } })).unwrap());
        const fresh = latest.current.worlds.find((w) => w.id === world.id);
        // Stamped even when nothing came back, so it waits a whole gap.
        if (fresh) await dispatch(updateWorld({ ...fresh, reputation: { text: text || fresh.reputation?.text || "", at: now } }));
      } catch (err) {
        console.warn("Reputation failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    // Introductions (#167): someone you talk to passes your number on to a
    // person in their life, who texts you first.
    const introduce = async (now: number) => {
      const { worlds, characters, persona, chats } = latest.current;
      const userName = persona?.name?.trim() || "the user";
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const world = worlds.find((w) => featureOn(w.id, "introductions") && introductionDue(w.lastIntroAt, now, lifeScaled(INTRO_GAP_MS)) && pickIntroduction(castOf(w.id), chats));
      if (!world) {
        await keepSecret(now);
        return;
      }
      const pair = pickIntroduction(castOf(world.id), chats)!;
      busy.current = true;
      try {
        await dispatch(updateWorld({ ...world, lastIntroAt: now }));
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
      } finally {
        busy.current = false;
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
      busy.current = true;
      try {
        await dispatch(updateWorld({ ...world, lastSecretAt: now }));
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
      } finally {
        busy.current = false;
      }
    };
    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch]);

  return null;
};

export default WorldEventWatcher;
