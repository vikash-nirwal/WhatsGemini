import { Character, World } from "../../types";
import { announcementsLine } from "./announcements";
import { arcActive, arcLine } from "./worldArcs";

// What's true reaches letters and the feed (#245). God mode's truths,
// announcements and the storyline under way reached every reply, but a
// letter, a status, a channel post or a friend's comment was written as if
// none of it had happened. Now those prompts hear it too, as one short line,
// and only for someone who lives in that world (Default has none of it).

const MAX_TRUTHS = 6;

export const worldTruthsLine = (world: Pick<World, "name" | "godTruths" | "announcements" | "arc"> | undefined, people: Pick<Character, "id" | "name">[] = []): string | undefined => {
  if (!world) return undefined;
  const truths = (world.godTruths || []).slice(-MAX_TRUTHS).map((t) => t.trim().replace(/[.!]+$/, "")).filter(Boolean);
  const arc = arcLine(arcActive(world));
  const parts = [
    truths.length ? `Simply true there (never question it): ${truths.join("; ")}.` : "",
    announcementsLine(world, people),
    arc ? `The story under way there: ${arc.replace(/[.!\s]+$/, "")}.` : "",
  ].filter(Boolean);
  return parts.length ? `What's true in ${world.name} (keep to it; bring it up only if it fits): ${parts.join(" ")}` : undefined;
};

// The world someone lives in, for the line above: none outside a world.
export const worldOfCharacter = <W extends Pick<World, "id">>(character: Pick<Character, "worldId"> | undefined, worlds: W[]): W | undefined =>
  character?.worldId === undefined ? undefined : worlds.find((w) => w.id === character.worldId);
