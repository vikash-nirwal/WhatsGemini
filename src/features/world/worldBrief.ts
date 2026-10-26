import { World } from "../../types";
import { formatStoryDate } from "./storyTime";
import { activeEvents } from "./worldEvents";
import { arcActive } from "./worldArcs";

// What's true in a world right now, in a few lines, for anything written in
// the background about someone who lives there (statuses, first texts,
// letters, their day, rumors...). Before this each of those prompts knew a
// different slice of the world - most didn't know god-mode truths at all -
// so a status could contradict what you'd made true. Built in one place and
// added to every background call that names a character or world.
export const buildWorldBrief = (world: World | undefined, now: number, opts: { events: boolean }): string | undefined => {
  if (!world) return undefined;
  const lines = [
    world.storyTime ? `It's ${formatStoryDate(world.storyTime, now)} there.` : "",
    world.godTruths?.length ? `Simply true there (never question it): ${world.godTruths.join("; ")}.` : "",
    opts.events ? activeEvents(world, now).map((e) => `Going on: ${e.title} (${e.text}).`).join(" ") : "",
    arcActive(world) ? `The story there right now: ${arcActive(world)!.beats[arcActive(world)!.step]}` : "",
  ].filter(Boolean);
  return lines.length ? `Context: ${world.name}. ${lines.join(" ")} Keep to it.` : undefined;
};

// Prepended, so it never sits after a prompt's "reply with only..." line.
// Skipped when the prompt already carries the truths.
export const withWorldBrief = (instruction: string, brief: string | undefined) =>
  brief && !instruction.includes("Simply true in this world") ? `${brief}\n\n${instruction}` : instruction;
