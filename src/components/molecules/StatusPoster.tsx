import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { updateCharacter } from "src/features/characterSlice";
import { addStatus, buildStatusPrompt, cleanStatus, liveStatuses, statusDue } from "src/features/character/statusUpdates";
import { buildFeedReactionsPrompt, feedPeersFor, parseFeedReactions, updateStatus } from "src/features/character/statusFeed";
import { CharacterStatus } from "src/types";
import { currentBlock } from "src/features/character/schedule";
import { dayMoodFor } from "src/features/character/badDays";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 15 * 1000;

// Status updates (#8): while the app is open, now and then a character with
// statuses on posts one, at most one per check and one every ten hours each,
// on the cheaper helper model. Then the characters who know them react to it
// in the feed (#85), in one more helper call.
const StatusPoster = () => {
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.character.characters);
  const charactersRef = useRef(characters);
  charactersRef.current = characters;
  const chats = useAppSelector((state) => state.chat.chats);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const due = charactersRef.current.find((c) => statusDue(c, now));
      if (!due) return;
      busy.current = true;
      try {
        const prompt = buildStatusPrompt(due, currentBlock(due.schedule, now)?.activity, (due.memory || []).slice(-8), liveStatuses(due, now).map((s) => s.text), dayMoodFor(due, now)?.label);
        const text = cleanStatus(await dispatch(generateAssistText({ instruction: prompt, background: true })).unwrap());
        if (text) {
          const latest = charactersRef.current.find((c) => c.id === due.id) || due;
          const status: CharacterStatus = { id: `st-${now.toString(36)}`, text, createdAt: now };
          await dispatch(updateCharacter({ ...latest, statuses: addStatus(latest.statuses, status) }));
          // The feed (#85): the others who know them like it and comment.
          const peers = feedPeersFor(latest, charactersRef.current, chatsRef.current);
          if (peers.length > 0) {
            const reply = await dispatch(generateAssistText({ instruction: buildFeedReactionsPrompt(latest, status, peers), background: true })).unwrap();
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
    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch]);

  return null;
};

export default StatusPoster;
