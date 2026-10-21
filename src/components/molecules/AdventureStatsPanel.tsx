import React from "react";
import { FaCheck, FaCoins, FaDiceD20, FaHeart } from "react-icons/fa";
import { AdventureGameState, SkillCheck } from "src/types";
import { describeCheck } from "src/features/adventure/skillChecks";
import { cn } from "src/utils/cn";

// The player's stats, inventory and quest log in an adventure (#25). Read
// only: the narrator's reported changes are the one way the state moves.
export const AdventureStatsPanel: React.FC<{ state: AdventureGameState; className?: string }> = ({ state, className }) => {
  const active = state.quests.filter((q) => !q.done);
  const done = state.quests.filter((q) => q.done);
  const hpShare = state.maxHp > 0 ? Math.round((state.hp / state.maxHp) * 100) : 0;
  return (
    <div role="region" aria-label="Stats, inventory and quests" className={cn("flex flex-col gap-5 text-[13px]", className)}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><FaHeart size={11} className="text-destructive" /> HP</span>
          <span className="tabular-nums text-muted-foreground">{state.hp} / {state.maxHp}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden" title={`HP: ${state.hp} of ${state.maxHp}`}>
          <div className={cn("h-full rounded-full transition-all", hpShare <= 30 ? "bg-destructive" : "bg-emerald-500")} style={{ width: `${hpShare}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><FaCoins size={11} className="text-amber-500" /> Gold</span>
        <span className="tabular-nums text-muted-foreground">{state.gold}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Inventory</span>
        {state.items.length === 0 ? (
          <p className="text-[12.5px] text-subtle">Nothing yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {state.items.map((item, i) => (
              <li key={i} className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[12px] text-foreground">{item}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Quests</span>
        {state.quests.length === 0 && <p className="text-[12.5px] text-subtle">No quests yet.</p>}
        <ul className="flex flex-col gap-1">
          {active.map((q, i) => <li key={`a${i}`} className="text-foreground">{q.title}</li>)}
          {done.map((q, i) => (
            <li key={`d${i}`} className="inline-flex items-center gap-1.5 text-subtle line-through">
              <FaCheck size={9} className="no-underline" /> {q.title}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// One line for the narrow-screen button that opens the panel.
export const statsSummary = (state: AdventureGameState): string =>
  `HP ${state.hp}/${state.maxHp} · ${state.gold} gold · ${state.items.length} item${state.items.length === 1 ? "" : "s"}`;

// Skill checks (#26) and stat changes (#25) as they show in the story.
export const SkillCheckBadge: React.FC<{ check: SkillCheck }> = ({ check }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
      check.success ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-destructive/40 bg-destructive/10 text-destructive"
    )}
  >
    <FaDiceD20 size={10} /> {describeCheck(check)}
  </span>
);

export const GameChanges: React.FC<{ changes: string[] }> = ({ changes }) => (
  <ul aria-label="What changed" className="flex flex-wrap gap-1.5">
    {changes.map((c, i) => (
      <li key={i} className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px] text-foreground">{c}</li>
    ))}
  </ul>
);

export const CheckChip: React.FC<{ check: { skill?: string; dc: number } }> = ({ check }) => (
  <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary whitespace-nowrap">
    <FaDiceD20 size={8} /> {check.skill ? `${check.skill} ` : ""}DC {check.dc}
  </span>
);
