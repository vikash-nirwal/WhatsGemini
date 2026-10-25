import React, { useEffect, useState } from "react";
import { cn } from "src/utils/cn";
import { happenedVotes, voteCounts } from "src/features/chat/groupLife";
import { Poll } from "src/types";

// A group chat poll (#124), WhatsApp-style: the question, each option with
// its votes so far and who cast them, and your own vote by tapping.
export const PollCard = ({ poll, onVote, nameOf }: { poll: Poll; onVote?: (option: number) => void; nameOf: (voter: "you" | number) => string }) => {
  // Votes come in over a minute or two; re-render until they all have.
  const [now, setNow] = useState(Date.now());
  const pending = poll.votes.some((v) => v.at > now);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 3000);
    return () => window.clearInterval(timer);
  }, [pending]);
  const counts = voteCounts(poll, now);
  const total = counts.reduce((a, b) => a + b, 0);
  const mine = poll.votes.find((v) => v.voter === "you")?.option;
  const votes = happenedVotes(poll, now);

  return (
    <div data-slot="poll" className="w-[min(320px,100%)] min-w-0 font-sans" role="group" aria-label={`Poll: ${poll.question}`}>
      <div className="text-[15px] font-semibold leading-[21px]">{poll.question}</div>
      <div className="mb-1 text-[12.5px] opacity-75">Select one{total > 0 ? ` · ${total} ${total === 1 ? "vote" : "votes"}` : ""}</div>
      {/* #149: the canvas's poll - a 20 px radio, the count, then a 6 px bar
          and who voted, indented under the option. */}
      <ul className="flex flex-col">
        {poll.options.map((option, i) => {
          const share = total > 0 ? counts[i] / total : 0;
          const voters = votes.filter((v) => v.option === i).map((v) => nameOf(v.voter));
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onVote?.(i)}
                disabled={!onVote}
                aria-pressed={mine === i}
                aria-label={`${option}, ${counts[i]} ${counts[i] === 1 ? "vote" : "votes"}`}
                className="w-full py-2 text-left"
              >
                <span className="flex items-center gap-2.5">
                  <span aria-hidden className={cn("grid h-5 w-5 flex-shrink-0 place-items-center rounded-full", mine === i ? "bg-primary text-primary-foreground" : "ring-[1.75px] ring-inset ring-subtle")}>
                    {mine === i && (
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4 10-10" /></svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-[14px]">{option}</span>
                  <span className="text-[13px] font-semibold tabular-nums opacity-80">{counts[i]}</span>
                </span>
                <span aria-hidden className="mt-1.5 ml-[30px] block h-1.5 overflow-hidden rounded-[3px] bg-foreground/[0.18]">
                  <span className="block h-full rounded-[3px] bg-primary transition-[width] duration-500" style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
                {voters.length > 0 && <span className="ml-[30px] mt-1 block text-[12px] opacity-75">{voters.join(", ")}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PollCard;
