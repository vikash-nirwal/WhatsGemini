import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaHistory } from "react-icons/fa";
import Header from "src/components/organisms/Header";
import { useAppSelector } from "src/store/hooks";
import { groupTimeline, KIND_LABEL, loadTimeline, onTimeline, TimelineEntry, TimelineKind } from "src/features/world/timeline";
import { cn } from "src/utils/cn";

// A world's timeline (#161): everything that happened there, newest first,
// grouped by day (or the world's own dates), with chips to narrow by kind.
// "/worlds/mine/timeline" is My world's.
const TimelinePage = () => {
  const navigate = useNavigate();
  const { worldId: param } = useParams();
  const worldId = param && param !== "mine" ? Number(param) : null;
  const world = useAppSelector((state) => state.world.worlds.find((w) => w.id === worldId));
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [only, setOnly] = useState<TimelineKind | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => void loadTimeline(worldId).then((list) => live && setEntries(list));
    load();
    const off = onTimeline(load);
    return () => {
      live = false;
      off();
    };
  }, [worldId]);

  const kinds = useMemo(() => Array.from(new Set(entries.map((e) => e.kind))), [entries]);
  const groups = groupTimeline(only ? entries.filter((e) => e.kind === only) : entries);
  const title = world?.name || "My world";

  return (
    <div className="flex h-dvh w-full flex-col">
      <Header title="Timeline" subtitle={`${title} · ${entries.length} ${entries.length === 1 ? "moment" : "moments"}`} onBack={() => navigate(-1)} />
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-2xl">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-muted-foreground">
              <FaHistory size={28} className="text-subtle" />
              <p className="text-[14px]">Nothing has happened here yet. Arrivals, new relationships, time passing and god-mode changes show up here as they happen.</p>
            </div>
          ) : (
            <>
              {kinds.length > 1 && (
                <div role="group" aria-label="Filter by kind" className="flex gap-2 overflow-x-auto px-4 pb-1 pt-3 [scrollbar-width:none]">
                  {[null, ...kinds].map((k) => (
                    <button key={k ?? "all"} type="button" aria-pressed={only === k} onClick={() => setOnly(k)}
                      className={cn("h-9 flex-none rounded-full px-3.5 text-[13px] font-semibold", only === k ? "bg-primary/15 text-foreground ring-1 ring-inset ring-primary" : "bg-raised text-foreground ring-1 ring-inset ring-border")}>
                      {k ? KIND_LABEL[k] : "All"}
                    </button>
                  ))}
                </div>
              )}
              <ol aria-label="World timeline" className="flex flex-col gap-5 px-4 py-4">
                {groups.map((g) => (
                  <li key={g.label}>
                    <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-subtle">{g.label}</h2>
                    <ul className="flex flex-col gap-2 border-l-2 border-border pl-4">
                      {g.entries.map((e) => (
                        <li key={e.id} className="relative rounded-card bg-raised px-3.5 py-2.5 ring-1 ring-inset ring-border">
                          <span aria-hidden className="absolute -left-[23px] top-4 h-2.5 w-2.5 rounded-full bg-primary" />
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-primary-text">{KIND_LABEL[e.kind]}</span>
                            <span className="flex-none text-[12px] text-subtle">{new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                          </div>
                          <p className="mt-0.5 text-[14px] leading-[20px] text-foreground">{e.text}</p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimelinePage;
