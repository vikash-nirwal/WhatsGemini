import { usePhoneShell, TAB_BAR_HEIGHT } from "src/hooks/usePhoneShell";
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus, FaTrash, FaSearch, FaGlobe } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { deleteAdventure } from "../features/adventureSlice";
import { useModal } from "../contexts/ModalContext";
import { useColorTheme } from "../hooks/useColorTheme";
import { cn } from "../utils/cn";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { Input } from "src/components/atoms/input";
import Header from "src/components/organisms/Header";

// A steady colour per adventure for its tile (#156), from the canvas's set.
const TILE_COLORS = ["#2B3A55", "#4A3B5C", "#8A4A22", "#2F5F55", "#5B3F9E", "#A0396B"];
const tileColor = (id: number) => TILE_COLORS[Math.abs(id) % TILE_COLORS.length];

const AdventureGalleryPage = () => {
  const shell = usePhoneShell();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { showConfirm } = useModal();
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const adventures = useAppSelector((state) => state.adventure.adventures);
  const worlds = useAppSelector((state) => state.world.worlds);
  const characters = useAppSelector((state) => state.character.characters);
  const loading = useAppSelector((state) => state.adventure.loading);
  const [search, setSearch] = useState("");

  const filteredAdventures = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return adventures;
    return adventures.filter((a) => a.title.toLowerCase().includes(q) || a.premise?.toLowerCase().includes(q));
  }, [adventures, search]);

  // The most recent story still being played leads the page.
  const hero = !search.trim() ? [...adventures].filter((a) => a.status !== "completed").sort((a, b) => (b.content[b.content.length - 1]?.timestamp || b.timestamp) - (a.content[a.content.length - 1]?.timestamp || a.timestamp))[0] : undefined;
  const handleDelete = async (adventureId: number, title: string) => {
    const confirmed = await showConfirm("Delete adventure", `Delete "${title}"? This can't be undone.`);
    if (confirmed) dispatch(deleteAdventure(adventureId));
  };

  return (
    <div className="w-full h-dvh flex flex-col">
      {/* A section of its own (#150): reached from the rail or the tabs. */}
      <Header title="Adventures" subtitle="Guided roleplay stories, in worlds you build." />
      {/* The phone shell's tab bar (#150) sits over the bottom of the page. */}
      <div className="flex-1 overflow-auto p-4 md:p-8" style={shell ? { paddingBottom: TAB_BAR_HEIGHT + 16 } : undefined}>
        <div className="w-full max-w-[1180px] mx-auto">

          <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
            <div>
              <h2 className="text-[26px] font-bold tracking-tight text-foreground">Your adventures</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {loading ? "Loading..." : `${adventures.length} adventure${adventures.length === 1 ? "" : "s"}`}
              </p>
            </div>
            {/* Fits a phone's width (#150): the search takes what's left, and
                "New adventure" keeps only its icon there. */}
            <div className="flex w-full gap-2 sm:w-auto">
              {adventures.length > 0 && (
                <div className="relative min-w-0 flex-1 sm:flex-none">
                  <FaSearch size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search adventures" aria-label="Search adventures" className="pl-8 text-[13px] w-full sm:w-[220px] bg-card" />
                </div>
              )}
              <Button onClick={() => navigate("/worlds")} variant="outline" className="flex-shrink-0">
                <FaGlobe size={12} /> Worlds
              </Button>
              <Button onClick={() => navigate("/adventures/new")} variant="default" aria-label="New adventure" className="flex-shrink-0">
                <FaPlus size={12} /> <span className="hidden sm:inline">New adventure</span>
              </Button>
            </div>
          </div>

          {!loading && adventures.length === 0 ? (
            <Card className={cn("p-6 text-center flex flex-col items-center gap-3", neumorphic && "surface-sunken")}>
              <p className="text-muted-foreground">No adventures yet.</p>
              <p className="text-sm text-muted-foreground">Set a world, pull in some characters, and start a guided story.</p>
              <Button onClick={() => navigate("/adventures/new")} variant="default" className="h-auto px-4 py-2.5 font-semibold text-sm">
                Start an adventure
              </Button>
            </Card>
          ) : filteredAdventures.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">No adventures match "{search}".</Card>
          ) : (
            // #156: the latest unfinished story as a "Continue" card, then
            // the rest as rows, as on the canvas.
            <div className="flex flex-col gap-4">
              {hero && (() => {
                const world = worlds.find((w) => w.id === hero.worldId);
                const state = [...hero.content].reverse().find((m) => m.gameState)?.gameState;
                const last = [...hero.content].reverse().find((m) => m.role !== "you")?.txt?.replace(/\s+/g, " ");
                return (
                  <button type="button" onClick={() => navigate(`/adventures/${hero.id}`)} aria-label={`Continue ${hero.title}`}
                    className="flex flex-col overflow-hidden rounded-[20px] bg-raised text-left shadow-soft ring-1 ring-inset ring-border">
                    <span className="flex h-[132px] flex-col justify-between p-3.5" style={{ background: tileColor(hero.id) }}>
                      <span className="w-fit rounded-md bg-black/40 px-2 py-0.5 text-[12px] font-bold text-white">Continue</span>
                      <span className="font-serif text-[24px] leading-7 text-white">{hero.title}</span>
                    </span>
                    <span className="flex flex-col gap-2.5 px-3.5 pb-3.5 pt-3">
                      <span className="line-clamp-2 text-[13.5px] text-muted-foreground">{last || hero.premise || "No premise set yet."}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {world && <span className="rounded-md bg-sunken px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">{world.name}</span>}
                        {state && <span className="rounded-md bg-sunken px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">HP {state.hp}/{state.maxHp}</span>}
                        {state && <span className="rounded-md bg-sunken px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">{state.gold} gold</span>}
                      </span>
                    </span>
                  </button>
                );
              })()}
              <ul aria-label="Adventures" className="flex flex-col gap-2.5">
                {filteredAdventures.filter((a) => a.id !== hero?.id).map((adventure) => {
                  const world = worlds.find((w) => w.id === adventure.worldId);
                  const cast = characters.filter((c) => adventure.characterIds.includes(c.id));
                  return (
                    <li key={adventure.id} className="flex items-center gap-3 rounded-card bg-card p-2.5 ring-1 ring-inset ring-border">
                      <button type="button" onClick={() => navigate(`/adventures/${adventure.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span aria-hidden className="grid h-16 w-16 flex-none place-items-center rounded-xl font-serif text-[26px] text-white/90" style={{ background: tileColor(adventure.id) }}>{adventure.title.trim().charAt(0).toUpperCase()}</span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-bold text-foreground">{adventure.title}</span>
                          <span className="truncate text-[12.5px] text-muted-foreground">{adventure.premise || "No premise set yet."}</span>
                          <span className="truncate text-[12px] text-subtle">{[adventure.status === "completed" ? "Completed" : undefined, world?.name, cast.length ? `with ${cast.map((c) => c.name).join(", ")}` : "solo"].filter(Boolean).join(" · ")}</span>
                        </span>
                      </button>
                      <Button
                        onClick={() => handleDelete(adventure.id, adventure.title)}
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 flex-none hover:text-destructive"
                        title="Delete adventure"
                        aria-label="Delete adventure"
                      >
                        <FaTrash size={13} />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdventureGalleryPage;
