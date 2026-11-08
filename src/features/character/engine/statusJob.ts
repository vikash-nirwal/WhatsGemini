import { toast } from "sonner";
import { CharacterStatus } from "../../../types";
import { formatTranscript } from "../../ai/utils/chatHistoryUtils";
import { annotateFacts } from "../../ai/utils/memoryTime";
import { trimToLatestSummary } from "../../ai/utils/transcript";
import { generateAdventureSceneImage, generateAssistText } from "../../aiSlice";
import { patchCharacter, updateCharacter } from "../../characterSlice";
import { statusesOn } from "../../status/statusSwitch";
import { activeEvents, eventsLine } from "../../world/worldEvents";
import { featureOn } from "../../world/worldPrefs";
import { worldOfCharacter, worldTruthsLine } from "../../world/worldTruths";
import { dayMoodFor } from "../badDays";
import { zoneOf } from "../characterClock";
import { dayLogText } from "../dayLog";
import { concernsLine } from "../preoccupations";
import { placeLine } from "../realWorld";
import { currentBlock } from "../schedule";
import { buildFeedReactionsPrompt, feedPeersFor, parseFeedReactions, updateStatus } from "../statusFeed";
import { addStatus, buildStatusPrompt, cleanStatus, liveStatuses, mentionsUser, photoStatusDue, statusDue, statusPhotoScene } from "../statusUpdates";
import { GetState, JobUi, PersonalDispatch, personalState } from "./state";

// A check still under way when another starts is left alone (see dayLogJob).
let busy = false;

// Status updates (#8): now and then a character with statuses on posts one,
// at most one per check and one every ten hours each, on the cheaper helper
// model. Then the characters who know them react to it in the feed (#85),
// in one more helper call. `at`: a catch-up turn back in your absence
// (#130), stamped with it.
export const statusCheck = (ui: JobUi, at?: number) => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy || !statusesOn()) return;
  const now = at ?? Date.now();
  const start = personalState(getState);
  const due = start.characters.find((c) => statusDue(c, now));
  if (!due) return;
  busy = true;
  try {
    // Status mentions (#129): about one status in three from someone you
    // chat with tags you, when you have a name to tag.
    const userName = start.persona?.name?.trim() || "";
    const knowsYou = start.chats.some((c) => c.characterIds?.length === 1 && c.characterIds[0] === due.id);
    const mention = userName && knowsYou && Math.random() < 1 / 3 ? userName : undefined;
    // The timeline: the time now, their latest messages with you, and
    // memories with the dates they were learned, so nothing that already
    // happened gets posted as still ahead.
    const mainChat = start.chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === due.id && !c.whatIf);
    const recent = trimToLatestSummary(mainChat?.content || []).filter((m) => !m.isSystem && !m.isRoomEvent).slice(-12);
    const recentChat = recent.length > 0 ? formatTranscript(recent, { userName: userName || "User", charName: due.name }) : undefined;
    // What happened in their life this past week (#164) comes first.
    const facts = [...(due.lifeEvents || []).filter((e) => now - e.at < 7 * 86_400_000).map((e) => e.text), ...annotateFacts((due.memory || []).slice(-8), due.memoryDates, now)];
    const worlds = start.worlds;
    const prompt = buildStatusPrompt(due, currentBlock(due.schedule, now, zoneOf(due))?.activity, facts, liveStatuses(due, now).map((s) => s.text), dayMoodFor(due, now)?.label, dayLogText(due, now), concernsLine(due.concerns), placeLine(due.home, now), mention, { now, userName, recentChat, language: worlds.find((w) => w.id === due.worldId)?.language?.trim() || undefined, worldEvents: featureOn(due.worldId, "events") ? eventsLine(activeEvents(worlds.find((w) => w.id === due.worldId), now)) : undefined, worldTruths: worldTruthsLine(worldOfCharacter(due, worlds), [due]) });
    const text = cleanStatus(await dispatch(generateAssistText({ instruction: prompt, background: true, activity: { at: now, kind: "status", text: `${due.name} posted a status`, characterId: due.id, name: due.name } })).unwrap());
    if (text) {
      const latest = personalState(getState).characters.find((c) => c.id === due.id) || due;
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
      if (mentioned) toast.message(`${latest.name} mentioned you in a status`, { description: text, action: { label: "View", onClick: () => ui.navigate("/updates") } });
      // The feed (#85): the others who know them like it and comment.
      const after = personalState(getState);
      const peers = feedPeersFor(latest, after.characters, after.chats);
      if (peers.length > 0) {
        const reply = await dispatch(generateAssistText({ instruction: buildFeedReactionsPrompt(latest, status, peers, worldTruthsLine(worldOfCharacter(latest, after.worlds), [latest, ...peers.map((p) => p.character).filter((c) => c.worldId === latest.worldId)])), background: true, activity: { at: now, kind: "status", text: `Friends reacted to ${latest.name}'s status`, characterId: latest.id, name: latest.name } })).unwrap();
        const { likes, comments } = parseFeedReactions(reply, peers, Date.now());
        const posted = personalState(getState).characters.find((c) => c.id === due.id);
        if (posted && (likes.length > 0 || comments.length > 0)) {
          await dispatch(patchCharacter(posted.id, (fresh) => ({ statuses: updateStatus(fresh.statuses, status.id, (s) => ({ ...s, likes, comments: [...(s.comments || []), ...comments] })) })));
        }
      }
    }
  } catch (err) {
    console.warn("Status update failed (non-fatal):", err);
  } finally {
    busy = false;
  }
};
