import { Channel, Character, World } from "../../../types";
import { generateAssistText } from "../../aiSlice";
import { changeChannels } from "../../channelSlice";
import { dayLogText } from "../../character/dayLog";
import { GetState, PersonalDispatch, personalState } from "../../character/engine/state";
import { concernsLine } from "../../character/preoccupations";
import { activeEvents, eventsLine } from "../../world/worldEvents";
import { featureOn } from "../../world/worldPrefs";
import { worldOfCharacter, worldTruthsLine } from "../../world/worldTruths";
import { addChannelPost, buildCharacterChannelPrompt, buildWorldChannelPrompt, channelPostDue, cleanChannelPost, newChannelPostId } from "../channels";

// The channel that posts this check: the first that's due whose character
// (still living) or world is still there.
export const pickChannel = (channels: Channel[], characters: Character[], worlds: World[], now: number): Channel | undefined =>
  channels.find((c) => channelPostDue(c, now) && (c.kind === "character" ? characters.some((x) => x.id === c.refId) : worlds.some((w) => w.id === c.refId)));

// A check still under way when another starts is left alone, as the
// component's own flag did.
let busy = false;

// Channels (#127): a followed channel that's due posts once (one channel
// per check) on the helper model. `at`: a catch-up turn back in your
// absence (#130), stamped with it.
export const channelCheck = (at?: number) => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy) return;
  const now = at ?? Date.now();
  const { channels, characters, worlds } = personalState(getState);
  const due = pickChannel(channels, characters, worlds, now);
  if (!due) return;
  busy = true;
  try {
    const recent = due.posts.slice(-4).map((p) => p.text);
    const channelName = (due.kind === "character" ? characters.find((x) => x.id === due.refId)?.name : worlds.find((w) => w.id === due.refId)?.name) || "A channel";
    let instruction: string;
    if (due.kind === "character") {
      const character = characters.find((x) => x.id === due.refId)!;
      instruction = buildCharacterChannelPrompt(character, recent, { dayLog: dayLogText(character, now), concerns: concernsLine(character.concerns), now, worldTruths: worldTruthsLine(worldOfCharacter(character, worlds), [character]) });
    } else {
      const world = worlds.find((w) => w.id === due.refId)!;
      instruction = buildWorldChannelPrompt(world, (world.map?.pins || []).map((p) => p.name), recent, featureOn(world.id, "events") ? eventsLine(activeEvents(world, now)) : undefined, worldTruthsLine(world));
    }
    const text = cleanChannelPost(await dispatch(generateAssistText({ instruction, background: true, worldId: due.kind === "world" ? due.refId : undefined, activity: { at: now, kind: "channel", text: `${channelName} posted to its channel`, characterId: due.kind === "character" ? due.refId : undefined, name: channelName } })).unwrap());
    // Recorded even when nothing usable came back, so it isn't retried every check.
    await dispatch(changeChannels((list) => list.map((c) => (c.id === due.id ? { ...c, lastPostAt: now, posts: text ? addChannelPost(c.posts, { id: newChannelPostId(), text, at: now }) : c.posts } : c))));
  } catch (err) {
    console.warn("Channel post failed (non-fatal):", err);
  } finally {
    busy = false;
  }
};
