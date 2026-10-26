import { Dispatch } from "@reduxjs/toolkit";
import { World, WorldEvent } from "../../types";
import { updateWorld } from "../worldSlice";
import { changeChannels } from "../channelSlice";
import { addChannelPost, channelId, newChannelPostId } from "../channels/channels";
import { logToTimeline } from "./timeline";
import { addEvent } from "./worldEvents";

// Starting a world event (#162), yours or the world's own: it's saved on the
// world, written into its timeline, and the world's news channel (when you
// follow it) carries it at once.
export const startWorldEvent = (world: World, event: WorldEvent) => async (dispatch: Dispatch) => {
  await dispatch(updateWorld({ ...world, events: addEvent(world.events, event), lastEventCheckAt: event.at }) as any);
  void logToTimeline(world.id, { kind: "event", text: `${event.title}: ${event.text}`, at: event.at }, world.storyTime);
  const id = channelId("world", world.id);
  await dispatch(changeChannels((list) => list.map((c) => (c.id === id ? { ...c, posts: addChannelPost(c.posts, { id: newChannelPostId(), text: `${event.title}. ${event.text}`, at: event.at }) } : c))) as any);
};

export const endWorldEvent = (world: World, id: string, now: number) => async (dispatch: Dispatch) => {
  const event = (world.events || []).find((e) => e.id === id);
  await dispatch(updateWorld({ ...world, events: (world.events || []).map((e) => (e.id === id ? { ...e, endsAt: Math.min(e.endsAt, now) } : e)) }) as any);
  if (event) void logToTimeline(world.id, { kind: "event", text: `${event.title} is over`, at: now }, world.storyTime);
};
