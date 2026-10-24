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
    <div data-slot="poll" className="font-sans" role="group" aria-label={`Poll: ${poll.question}`}>
      <div className="text-[15px] font-semibold text-foreground">{poll.question}</div>
      <div className="mb-2 text-[12px] text-subtle">Select one</div>
      <ul className="flex flex-col gap-2">
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
                className="w-full text-left"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden className={cn("flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2", mine === i ? "border-primary bg-primary" : "border-subtle")}>
                    {mine === i && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                  </span>
                  <span className="flex-1 text-[14px] text-foreground">{option}</span>
                  <span className="text-[13px] text-muted-foreground">{counts[i]}</span>
                </span>
                <span aria-hidden className="mt-1 ml-6 block h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
                {voters.length > 0 && <span className="ml-6 mt-0.5 block text-[11.5px] text-subtle">{voters.join(", ")}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PollCard;
