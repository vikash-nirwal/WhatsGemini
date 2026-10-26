import { Dispatch } from "@reduxjs/toolkit";
import { World, WorldArc, WorldEvent } from "../../types";
import { patchWorld } from "../worldSlice";
import { changeChannels } from "../channelSlice";
import { addChannelPost, channelId, newChannelPostId } from "../channels/channels";
import { logToTimeline } from "./timeline";
import { addEvent } from "./worldEvents";
import { advanceArc } from "./worldArcs";

// Posts to the world's news channel, when you follow it.
const postNews = (world: World, text: string, at: number) => (dispatch: Dispatch) => {
  const id = channelId("world", world.id);
  return dispatch(changeChannels((list) => list.map((c) => (c.id === id ? { ...c, posts: addChannelPost(c.posts, { id: newChannelPostId(), text, at }) } : c))) as any);
};

// World arcs (#169): starting one, and moving it to its next beat (or its
// end). Each beat goes into the timeline and the news.
export const startWorldArc = (world: World, arc: WorldArc) => async (dispatch: Dispatch) => {
  await dispatch(patchWorld(world.id, { arc }) as any);
  void logToTimeline(world.id, { kind: "arc", text: `${arc.title} began: ${arc.beats[0]}`, at: arc.startedAt }, world.storyTime);
  await dispatch(postNews(world, arc.beats[0], arc.startedAt) as any);
};

export const moveArcOn = (world: World, now: number) => async (dispatch: Dispatch) => {
  if (!world.arc || world.arc.doneAt) return;
  const next = advanceArc(world.arc, now);
  // Only if nobody moved it meanwhile, so one chapter never counts twice.
  await dispatch(patchWorld(world.id, (w) => (w.arc && w.arc.step === world.arc!.step && !w.arc.doneAt ? { arc: next } : {})) as any);
  const text = next.doneAt ? `${next.title} came to an end` : next.beats[next.step];
  void logToTimeline(world.id, { kind: "arc", text, at: now }, world.storyTime);
  if (!next.doneAt) await dispatch(postNews(world, text, now) as any);
};

export const endWorldArc = (world: World, now: number) => async (dispatch: Dispatch) => {
  if (!world.arc) return;
  await dispatch(patchWorld(world.id, (w) => ({ arc: w.arc ? { ...w.arc, doneAt: now } : w.arc })) as any);
  void logToTimeline(world.id, { kind: "arc", text: `${world.arc.title} came to an end`, at: now }, world.storyTime);
};

// Starting a world event (#162), yours or the world's own: it's saved on the
// world, written into its timeline, and the world's news channel (when you
// follow it) carries it at once.
export const startWorldEvent = (world: World, event: WorldEvent) => async (dispatch: Dispatch) => {
  await dispatch(patchWorld(world.id, (w) => ({ events: addEvent(w.events, event), lastEventCheckAt: event.at })) as any);
  void logToTimeline(world.id, { kind: "event", text: `${event.title}: ${event.text}`, at: event.at }, world.storyTime);
  const id = channelId("world", world.id);
  await dispatch(changeChannels((list) => list.map((c) => (c.id === id ? { ...c, posts: addChannelPost(c.posts, { id: newChannelPostId(), text: `${event.title}. ${event.text}`, at: event.at }) } : c))) as any);
};

export const endWorldEvent = (world: World, id: string, now: number) => async (dispatch: Dispatch) => {
  const event = (world.events || []).find((e) => e.id === id);
  await dispatch(patchWorld(world.id, (w) => ({ events: (w.events || []).map((e) => (e.id === id ? { ...e, endsAt: Math.min(e.endsAt, now) } : e)) })) as any);
  if (event) void logToTimeline(world.id, { kind: "event", text: `${event.title} is over`, at: now }, world.storyTime);
};
