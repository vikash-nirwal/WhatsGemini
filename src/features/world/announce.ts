import { Character, Chat, World } from "../../types";
import { AppDispatch } from "../../store/store";
import { generateAssistText } from "../aiSlice";
import { patchCharacter } from "../characterSlice";
import { patchWorld } from "../worldSlice";
import { changeChannels } from "../channelSlice";
import { addChannelPost, channelId, newChannelPostId } from "../channels/channels";
import { rememberFacts } from "../memory/sharedMoments";
import { addStatus } from "../character/statusUpdates";
import { isGone } from "./canon";
import { logToTimeline } from "./timeline";
import { shareNews } from "./shareNews";
import { addAnnouncement, buildTakesPrompt, newAnnouncementId, parseTakes, TAKES_PER_CALL, withTakes } from "./announcements";

// Announcing something to a whole world (announcements.ts): it's saved and
// written into the timeline and the news at once, so it's real before any
// AI answers. Then each person's take is asked for, a few at a time; they
// remember it, those who post statuses may post about it, and one or two
// close to you text you. A take that fails to come back leaves that person
// knowing the news without a take of their own.
export const announceToWorld = (
  { world, cast, chats, userName, text, now = Date.now() }: { world: World; cast: Character[]; chats: Chat[]; userName: string; text: string; now?: number }
) => async (dispatch: AppDispatch) => {
  const said = text.trim().replace(/\s+/g, " ");
  if (!said) return { heard: 0 };
  const id = newAnnouncementId(now);
  await dispatch(patchWorld(world.id, (w) => ({ announcements: addAnnouncement(w.announcements, { id, text: said, at: now }) })));
  void logToTimeline(world.id, { kind: "god", text: `Announced to everyone: ${said}`, at: now, audience: "public" }, world.storyTime);
  const channel = channelId("world", world.id);
  await dispatch(changeChannels((list) => list.map((c) => (c.id === channel ? { ...c, posts: addChannelPost(c.posts, { id: newChannelPostId(), text: said, at: now }) } : c))));

  const people = cast.filter((c) => c.id !== undefined && c.worldId === world.id && !isGone(c));
  let heard = 0;
  for (let i = 0; i < people.length; i += TAKES_PER_CALL) {
    const batch = people.slice(i, i + TAKES_PER_CALL);
    try {
      const reply = await dispatch(generateAssistText({ instruction: buildTakesPrompt(world, said, batch), replyKind: "announcement" })).unwrap();
      const { takes, statuses } = parseTakes(reply, batch as (Character & { id: number })[]);
      if (!Object.keys(takes).length) continue;
      await dispatch(patchWorld(world.id, (w) => ({ announcements: withTakes(w.announcements, id, takes) })));
      for (const c of batch) {
        const take = takes[c.id!];
        if (!take) continue;
        heard++;
        const status = c.postsStatuses ? statuses[c.id!] : undefined;
        await dispatch(patchCharacter(c.id!, (latest) => ({
          ...rememberFacts(latest, [`It was announced to everyone in ${world.name}: ${said}. How you took it: ${take}`], undefined, now),
          ...(status ? { statuses: addStatus(latest.statuses, { id: `st-${now.toString(36)}-${c.id}`, text: status, createdAt: now }) } : {}),
        })));
      }
    } catch (err) {
      console.warn("Some takes on the announcement didn't come back (non-fatal):", err);
    }
  }
  // People close to you may text you about it (#178).
  void dispatch(shareNews({ world, cast: people, chats, userName, news: `It's just been announced to everyone: ${said}`, now }));
  return { heard };
};
