import React, { useMemo, useRef, useState } from "react";
import { MoodPoint, summarizeMoods } from "src/features/chat/moodTimeline";

// Relationship timeline (#51): the character's mood over the chat as one
// line against a neutral baseline (warm above, cold below). Hovering or the
// arrow keys move a crosshair to the nearest reply and show its mood; the
// same data is available as a list.

const W = 300;
const H = 96;
const PAD_X = 6;
const PAD_Y = 10;
const MAX_POINTS = 60;

const formatWhen = (t: number) =>
  t ? new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

export const MoodTimeline = ({ points, name }: { points: MoodPoint[]; name: string }) => {
  const shown = useMemo(() => points.slice(-MAX_POINTS), [points]);
  const summary = useMemo(() => summarizeMoods(shown), [shown]);
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (shown.length < 2) {
    return <p className="text-[12.5px] text-subtle">Not enough moods yet. Turn on emotion portraits for {name}, and their mood over the chat shows here.</p>;
  }

  const x = (i: number) => PAD_X + (i * (W - 2 * PAD_X)) / (shown.length - 1);
  const y = (score: number) => H / 2 - (score / 3) * (H / 2 - PAD_Y);
  const path = shown.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");

  const pick = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (clientX - rect.left) / rect.width;
    const i = Math.round(((ratio * W - PAD_X) / (W - 2 * PAD_X)) * (shown.length - 1));
    setActive(Math.max(0, Math.min(shown.length - 1, i)));
  };

  const activePoint = active != null ? shown[active] : undefined;
  const trendText = summary.trend === "warmer" ? ", warming up lately" : summary.trend === "cooler" ? ", cooling off lately" : summary.trend === "steady" ? ", steady lately" : "";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-foreground">
        Mostly <span className="font-medium">{summary.topMood}</span> ({Math.round(summary.topShare * 100)}%){trendText}.
      </p>
      {/* Room above the plot for the tooltip, so it never covers the summary. */}
      <div className="relative pt-7">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-24 touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          role="img"
          aria-label={`${name}'s mood over the last ${shown.length} replies: mostly ${summary.topMood}${trendText}.${activePoint ? ` Selected: ${activePoint.emotion}, ${formatWhen(activePoint.time)}.` : ""}`}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const step = e.key === "ArrowLeft" ? -1 : 1;
              setActive((a) => Math.max(0, Math.min(shown.length - 1, (a ?? shown.length - 1) + (a == null ? 0 : step))));
            }
          }}
        >
          <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={path} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {activePoint && active != null && (
            <line x1={x(active)} x2={x(active)} y1={0} y2={H} className="stroke-muted-foreground" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* Drawn in HTML so they keep their size while the plot stretches. */}
        <span aria-hidden className="pointer-events-none absolute left-1 top-7 text-[10px] leading-none text-subtle">warm</span>
        <span aria-hidden className="pointer-events-none absolute left-1 bottom-0.5 text-[10px] leading-none text-subtle">cold</span>
        {activePoint && active != null && (
          <span
            aria-hidden
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
            style={{ left: `${(x(active) / W) * 100}%`, top: `calc(1.75rem + ${(y(activePoint.score) / H) * 6}rem)` }}
          />
        )}
        {activePoint && active != null && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground shadow-soft"
            style={{ left: `${Math.min(85, Math.max(15, (x(active) / W) * 100))}%` }}
          >
            <span className="font-medium capitalize">{activePoint.emotion}</span>
            {activePoint.time ? <span className="text-muted-foreground"> · {formatWhen(activePoint.time)}</span> : null}
          </div>
        )}
      </div>
      <details className="text-[12px]">
        <summary className="cursor-pointer text-muted-foreground">Show as a list</summary>
        <ol className="mt-1.5 flex flex-col gap-0.5" aria-label="Recent moods">
          {shown.slice(-12).reverse().map((p) => (
            <li key={p.id} className="flex justify-between gap-3">
              <span className="capitalize text-foreground">{p.emotion}</span>
              <span className="text-subtle tabular-nums">{formatWhen(p.time)}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
};
