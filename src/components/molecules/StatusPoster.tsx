import { catchUpTime } from "src/features/life/away";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { selectActivePersona } from "src/features/settingsSlice";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAdventureSceneImage, generateAssistText } from "src/features/aiSlice";
import { updateCharacter } from "src/features/characterSlice";
import { addStatus, buildStatusPrompt, cleanStatus, liveStatuses, mentionsUser, photoStatusDue, statusDue, statusPhotoScene } from "src/features/character/statusUpdates";
import { buildFeedReactionsPrompt, feedPeersFor, parseFeedReactions, updateStatus } from "src/features/character/statusFeed";
import { CharacterStatus } from "src/types";
import { currentBlock } from "src/features/character/schedule";
import { dayMoodFor } from "src/features/character/badDays";
import { dayLogText } from "src/features/character/dayLog";
import { concernsLine } from "src/features/character/preoccupations";
import { placeLine } from "src/features/character/realWorld";
import { formatTranscript } from "src/features/ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "src/features/ai/utils/transcript";
import { annotateFacts } from "src/features/ai/utils/memoryTime";
import { useLivingCharacters } from "src/hooks/useWorld";
import { activeEvents, eventsLine } from "src/features/world/worldEvents";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 15 * 1000;

// Status updates (#8): while the app is open, now and then a character with
// statuses on posts one, at most one per check and one every ten hours each,
// on the cheaper helper model. Then the characters who know them react to it
// in the feed (#85), in one more helper call.
const StatusPoster = () => {
  const dispatch = useAppDispatch();
  const characters = useLivingCharacters();
  const charactersRef = useRef(characters);
  charactersRef.current = characters;
  const chats = useAppSelector((state) => state.chat.chats);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const persona = useAppSelector(selectActivePersona);
  const userNameRef = useRef(persona?.name?.trim() || "");
  userNameRef.current = persona?.name?.trim() || "";
  const worlds = useAppSelector((state) => state.world.worlds);
  const worldsRef = useRef(worlds);
  worldsRef.current = worlds;
  const navigate = useNavigate();
  const busy = useRef(false);

  useEffect(() => {
    // `at`: a catch-up turn back in your absence (#130), stamped with it.
    const check = async (at?: number) => {
      if (busy.current) return;
      const now = at ?? Date.now();
      const due = charactersRef.current.find((c) => statusDue(c, now));
      if (!due) return;
      busy.current = true;
      try {
        // Status mentions (#129): about one status in three from someone you
        // chat with tags you, when you have a name to tag.
        const userName = userNameRef.current;
        const knowsYou = chatsRef.current.some((c) => c.characterIds?.length === 1 && c.characterIds[0] === due.id);
        const mention = userName && knowsYou && Math.random() < 1 / 3 ? userName : undefined;
        // The timeline: the time now, their latest messages with you, and
        // memories with the dates they were learned, so nothing that already
        // happened gets posted as still ahead.
        const mainChat = chatsRef.current.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === due.id && !c.whatIf);
        const recent = trimToLatestSummary(mainChat?.content || []).filter((m) => !m.isSystem && !m.isRoomEvent).slice(-12);
        const recentChat = recent.length > 0 ? formatTranscript(recent, { userName: userName || "User", charName: due.name }) : undefined;
        // What happened in their life this past week (#164) comes first.
        const facts = [...(due.lifeEvents || []).filter((e) => now - e.at < 7 * 86_400_000).map((e) => e.text), ...annotateFacts((due.memory || []).slice(-8), due.memoryDates, now)];
        const prompt = buildStatusPrompt(due, currentBlock(due.schedule, now)?.activity, facts, liveStatuses(due, now).map((s) => s.text), dayMoodFor(due, now)?.label, dayLogText(due, now), concernsLine(due.concerns), placeLine(due.home, now), mention, { now, userName, recentChat, worldEvents: eventsLine(activeEvents(worldsRef.current.find((w) => w.id === due.worldId), now)) });
        const text = cleanStatus(await dispatch(generateAssistText({ instruction: prompt, background: true, activity: { at: now, kind: "status", text: `${due.name} posted a status`, characterId: due.id, name: due.name } })).unwrap());
        if (text) {
          const latest = charactersRef.current.find((c) => c.id === due.id) || due;
          // A photo status (#118): drawn before posting, so it appears with
          // the text; a failed picture still posts the text.
          let image: string | undefined;
          if (photoStatusDue(latest)) {
            try {
              const drawn = await dispatch(generateAdventureSceneImage({ narration: statusPhotoScene(latest.name, text), cast: [latest], artStyle: latest.artStyle })).unwrap();
              image = drawn.images?.[0];
            } catch (err) {
              console.warn("Status photo failed (non-fatal):", err);
            }
          }
          const mentioned = Boolean(userName) && mentionsUser(text, userName);
          const status: CharacterStatus = { id: `st-${now.toString(36)}`, text, createdAt: now, ...(image ? { image } : {}), ...(mentioned ? { mentionsYou: true } : {}) };
          await dispatch(updateCharacter({ ...latest, statuses: addStatus(latest.statuses, status) }));
          if (mentioned) toast.message(`${latest.name} mentioned you in a status`, { description: text, action: { label: "View", onClick: () => navigate("/updates") } });
          // The feed (#85): the others who know them like it and comment.
          const peers = feedPeersFor(latest, charactersRef.current, chatsRef.current);
          if (peers.length > 0) {
            const reply = await dispatch(generateAssistText({ instruction: buildFeedReactionsPrompt(latest, status, peers), background: true, activity: { at: now, kind: "status", text: `Friends reacted to ${latest.name}'s status`, characterId: latest.id, name: latest.name } })).unwrap();
            const { likes, comments } = parseFeedReactions(reply, peers, Date.now());
            const posted = charactersRef.current.find((c) => c.id === due.id);
            if (posted && (likes.length > 0 || comments.length > 0)) {
              await dispatch(updateCharacter({ ...posted, statuses: updateStatus(posted.statuses, status.id, (s) => ({ ...s, likes, comments: [...(s.comments || []), ...comments] })) }));
            }
          }
        }
      } catch (err) {
        console.warn("Status update failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    // The catch-up turn is claimed when the timer fires, not at mount (a
    // remount would otherwise lose it).
    const first = window.setTimeout(() => check(catchUpTime("status")), FIRST_CHECK_MS);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch, navigate]);

  return null;
};

export default StatusPoster;
