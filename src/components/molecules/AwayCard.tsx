import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaTimes } from "react-icons/fa";
import { CharacterAvatar } from "./CharacterAvatar";
import { awaySession, wasAway } from "src/features/life/away";
import { ActivityEntry, loadActivity, onActivity } from "src/features/life/activityLog";
import { formatStoryDate, storyDaysBetween } from "src/features/world/storyTime";
import { catchUpTitle } from "src/features/world/catchUp";
import { useCurrentWorld } from "src/hooks/useWorld";

// While you were away (#130): on the chat list after an absence, what
// happened meanwhile, from the catch-up turns in the activity log.
export const awayEntries = (entries: ActivityEntry[], lastSeen: number, openedAt: number): ActivityEntry[] =>
  entries.filter((e) => e.at > lastSeen && e.at < openedAt);

export const AwayCard = () => {
  const [entries, setEntries] = useState<ActivityEntry[]>(() => loadActivity());
  const [dismissed, setDismissed] = useState(false);
  const { current } = useCurrentWorld();
  useEffect(() => onActivity(() => setEntries(loadActivity())), []);
  if (dismissed || !wasAway()) return null;
  const { lastSeen, openedAt } = awaySession();
  const away = awayEntries(entries, lastSeen, openedAt);
  // Story time (#147): how far this world's own calendar moved meanwhile.
  const story = current?.storyTime;
  const storyDays = story ? storyDaysBetween(story, lastSeen, openedAt) : 0;
  const storyLine = story && storyDays > 0 ? `In ${current!.name}, ${storyDays} ${storyDays === 1 ? "day" : "days"} passed. It's now ${formatStoryDate(story, openedAt)}.` : undefined;
  // What you missed, told as a story (#213), once the world has written it
  // for this absence.
  const told = current?.catchUp?.from === lastSeen && current.catchUp.text ? current.catchUp.text : undefined;
  if (away.length === 0 && !storyLine && !told) return null;
  const names = Array.from(new Set(away.map((e) => e.name).filter(Boolean))) as string[];
  return (
    <section aria-label="While you were away" data-slot="away-card" className="mx-2 mb-2 flex items-start gap-3 rounded-card bg-raised p-3 ring-1 ring-inset ring-border">
      <span className="flex flex-shrink-0 -space-x-2.5 pt-0.5">
        {names.slice(0, 3).map((n) => <CharacterAvatar key={n} name={n} size={28} className="ring-2 ring-raised" />)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-foreground">{told ? catchUpTitle(current!, lastSeen, openedAt) : "While you were away"}</div>
        {storyLine && <p className="text-[12.5px] leading-[17px] text-foreground">{storyLine}</p>}
        {told && <p data-slot="catch-up" className="text-[12.5px] leading-[17px] text-foreground">{told}</p>}
        <p className="line-clamp-2 text-[12.5px] leading-[17px] text-muted-foreground">{away.slice(0, 3).map((e) => e.text).join(" · ")}{away.length > 3 ? ` · ${away.length - 3} more` : ""}</p>
        <Link to="/settings/spending" className="mt-1 inline-block text-[12.5px] font-semibold text-primary-text hover:underline">See everything</Link>
      </div>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" data-hit className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-subtle hover:bg-sunken hover:text-foreground">
        <FaTimes size={11} />
      </button>
    </section>
  );
};

export default AwayCard;
