import { toast } from "sonner";
import { Character, World } from "../../../types";
import { patchCharacter } from "../../characterSlice";
import { withTie } from "../../character/ties";
import { BECAME_FRIENDS, nudgeBond, TALKED, tieShift } from "../bonds";
import { shareNews } from "../shareNews";
import { logToTimeline } from "../timeline";
import { addWorldTalk, becameFriends } from "../worldTalk";
import { EngineDispatch, engineState, GetState } from "./state";
import type { TalkSetting } from "../talkMedium";

// What the world engine's jobs share (#209, #212): the news reaching you,
// and what a talk between two people leaves behind - whether it came from
// a talk of its own or from a whole world turn - so both agree.

// The news reaches you (#178): one or two people close to it text you.
export const tellTheNews = (world: World, news: string, about: number[], now: number) => async (dispatch: EngineDispatch, getState: GetState) => {
  const { characters, chats, userName } = engineState(getState);
  await dispatch(shareNews({ world, cast: characters.filter((c) => c.worldId === world.id), chats, userName, news, about, now }));
};

const bare = (tie: string) => tie.replace(/^your\s+/i, "");

// After a talk: it's kept (on the lower id of the two, #145), it brings
// them a little closer (#211), strangers who keep talking become friends
// (#181), and a tie the talk changed is changed both ways (#163). `a` is
// the one the talk is stored on.
export const afterTalk = (
  { a, b, worldId, world, lines, setting, change, now }: { a: Character; b: Character; worldId: number | null; world?: World; lines: { speakerId: number; text: string }[]; setting?: TalkSetting; change?: { bToA: string; aToB: string }; now: number }
) => async (dispatch: EngineDispatch, getState: GetState) => {
  const fresh = (id: number) => engineState(getState).characters.find((c) => c.id === id);
  // Saved even when empty, so a failed attempt waits for the next gap.
  await dispatch(patchCharacter(a.id, (latest) => ({ ...addWorldTalk(latest, { id: `wt-${now.toString(36)}`, withId: b.id, at: now, lines, ...(setting && setting.kind !== "texts" ? { medium: setting.kind, ...(setting.place ? { place: setting.place } : {}) } : {}) }), ...(lines.length ? nudgeBond(latest, b.id, TALKED, now) : {}) })));
  if (!lines.length) return;
  await dispatch(patchCharacter(b.id, (latest) => nudgeBond(latest, a.id, TALKED, now)));
  const nowA = fresh(a.id);
  const nowB = fresh(b.id);
  if (nowA && nowB && becameFriends(engineState(getState).characters, nowA, nowB)) {
    await dispatch(patchCharacter(a.id, (latest) => ({ ...withTie(latest, nowB, "your friend", "your friend")[0], ...nudgeBond(latest, b.id, BECAME_FRIENDS, now) })));
    await dispatch(patchCharacter(b.id, (latest) => ({ ...withTie(nowA, latest, "your friend", "your friend")[1], ...nudgeBond(latest, a.id, BECAME_FRIENDS, now) })));
    void logToTimeline(worldId, { kind: "tie", text: `${a.name} and ${b.name} became friends`, characterIds: [a.id, b.id], at: now }, world?.storyTime);
  }
  const freshA = fresh(a.id);
  const freshB = fresh(b.id);
  const before = freshA?.ties?.find((t) => t.withId === b.id)?.tie;
  if (!change || !freshA || !freshB || bare(change.bToA).toLowerCase() === bare(before || "").toLowerCase()) return;
  // The change moves the numbers too (#211): towards the new tie, with
  // tension left behind when it's for the worse.
  const beforeB = freshB.ties?.find((t) => t.withId === a.id)?.tie;
  await dispatch(patchCharacter(a.id, (latest) => ({ ...withTie(latest, freshB, change.bToA, change.aToB)[0], ...nudgeBond(latest, b.id, tieShift(before, change.bToA), now) })));
  await dispatch(patchCharacter(b.id, (latest) => ({ ...withTie(freshA, latest, change.bToA, change.aToB)[1], ...nudgeBond(latest, a.id, tieShift(beforeB, change.aToB || change.bToA), now) })));
  const what = `${b.name} is now ${a.name}'s ${bare(change.bToA)}${before ? ` (was ${bare(before)})` : ""}`;
  void logToTimeline(worldId, { kind: "tie", text: what, characterIds: [a.id, b.id], at: now }, world?.storyTime);
  toast(`${a.name} and ${b.name}`, { description: what });
};
