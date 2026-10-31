import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus, FaEdit, FaTrash, FaGlobe, FaSearch, FaHistory, FaFileExport, FaFileImport, FaLink, FaShareAlt } from "react-icons/fa";
import { ShareWorldDialog } from "src/components/organisms/ShareWorldDialog";
import { toast } from "sonner";
import { exportWorld, readWorldFile, worldFileName } from "../features/world/worldFile";
import { importWorld } from "../features/world/importWorld";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { switchWorld } from "../features/worldSlice";
import { DeleteWorldDialog } from "src/components/organisms/DeleteWorldDialog";
import { MY_WORLD, worldOf } from "../features/world/currentWorld";
import { formatStoryDate } from "../features/world/storyTime";
import { useCurrentWorld } from "../hooks/useWorld";
import { WorldLifeControls } from "src/components/organisms/WorldLifeControls";
import { ResetDialog } from "src/components/organisms/ResetDialog";
import { CurrentWorldHero } from "src/components/organisms/CurrentWorldHero";
import { resetWorldLife } from "../features/life/reset";
import { useColorTheme } from "../hooks/useColorTheme";
import { cn } from "../utils/cn";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { Badge } from "src/components/atoms/badge";
import { Input } from "src/components/atoms/input";
import Header from "src/components/organisms/Header";

const WorldGalleryPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const worlds = useAppSelector((state) => state.world.worlds);
  const adventures = useAppSelector((state) => state.adventure.adventures);
  const characters = useAppSelector((state) => state.character.characters);
  const chats = useAppSelector((state) => state.chat.chats);
  const { currentWorldId } = useCurrentWorld();
  // World files (#172): download a world as written; bring one in as new.
  const importInput = React.useRef<HTMLInputElement>(null);
  const [sharing, setSharing] = useState<(typeof worlds)[number] | null>(null);
  const onExport = (world: (typeof worlds)[number]) => {
    const file = exportWorld(world, characters.filter((c) => c.worldId === world.id));
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = worldFileName(world.name);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const onImport = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      const world = await dispatch(importWorld(readWorldFile(await picked.text())));
      toast.success(`${world.name} imported, with its people`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't import that world.");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };
  // Who and what lives in each world (#143), for the cards.
  const countIn = (id: number | null) => ({
    people: characters.filter((c) => worldOf(c, worlds) === id).length,
    chats: chats.filter((c) => worldOf(c, worlds) === id).length,
  });
  const goTo = (id: number | null) => {
    dispatch(switchWorld(id));
    navigate("/");
  };
  // Reset (#158): which world's progress is about to go.
  const [resetting, setResetting] = useState<{ id: number | null; name: string } | null>(null);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const loading = useAppSelector((state) => state.world.loading);
  const [search, setSearch] = useState("");

  const filteredWorlds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return worlds;
    return worlds.filter((w) => w.name.toLowerCase().includes(q) || w.premise.toLowerCase().includes(q));
  }, [worlds, search]);

  // Asks who to keep first (DeleteWorldDialog).
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);
  const handleDelete = (worldId: number, name: string) => setDeleting({ id: worldId, name });

  return (
    <div className="w-full h-dvh flex flex-col">
      <DeleteWorldDialog world={deleting} onClose={() => setDeleting(null)} />
      <ResetDialog
        open={Boolean(resetting)}
        onOpenChange={(open) => !open && setResetting(null)}
        title={`Reset ${resetting?.name || ""}?`}
        description="Its progress goes: story time back to its start, its news and what its people texted each other."
        options={[{ id: "people", label: "Also reset everyone who lives here", defaultOn: true }, { id: "chats", label: "Also delete your chats here" }]}
        onReset={async (choices) => {
          if (resetting) await dispatch(resetWorldLife({ worldId: resetting.id, people: choices.people, deleteChats: choices.people && choices.chats }));
        }}
      />
      <Header title="Worlds" subtitle="Each world is its own space, with its own people and chats." onBack={() => navigate("/adventures")} />
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="w-full max-w-[1180px] mx-auto">
          <CurrentWorldHero />

          <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
            <div>
              <h2 className="text-[26px] font-bold tracking-tight text-foreground">Your worlds</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {loading ? "Loading..." : `${worlds.length} world${worlds.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="flex gap-2">
              {worlds.length > 0 && (
                <div className="relative">
                  <FaSearch size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search worlds" aria-label="Search worlds" className="pl-8 text-[13px] w-[220px] bg-card" />
                </div>
              )}
              <Button onClick={() => importInput.current?.click()} variant="outline">
                <FaFileImport size={12} /> Import
              </Button>
              <Button onClick={() => navigate("/worlds/import")} variant="outline">
                <FaLink size={12} /> From a link
              </Button>
              <input ref={importInput} type="file" accept=".json,application/json" aria-label="Import a world file" className="hidden" onChange={(e) => void onImport(e.target.files?.[0])} />
              <Button onClick={() => navigate("/worlds/wizard")} variant="default">
                <FaPlus size={12} /> New world
              </Button>
            </div>
          </div>

          {(() => {
            const mine = countIn(null);
            return (
              <Card className="p-5 mb-5 flex flex-col gap-3" aria-label={MY_WORLD}>
                <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <h4 className="font-serif font-semibold text-lg text-foreground leading-tight flex items-center gap-2"><FaGlobe size={13} className="text-subtle" /> {MY_WORLD}</h4>
                  <p className="text-[11px] text-subtle mt-1">Everyone from before worlds, and anyone you haven't put in one. {plural(mine.people, "person").replace("persons", "people")}, {plural(mine.chats, "chat")}.</p>
                </div>
                {currentWorldId === null ? (
                  <Badge variant="secondary">You're here</Badge>
                ) : (
                  <Button onClick={() => goTo(null)} variant="outline" className="h-9 text-xs font-semibold" aria-label={`Switch to ${MY_WORLD}`}>Switch</Button>
                )}
                </div>
                <WorldLifeControls worldId={null} name={MY_WORLD} />
                <Button onClick={() => setResetting({ id: null, name: MY_WORLD })} variant="ghost" size="sm" className="self-start text-muted-foreground" aria-label={`Reset ${MY_WORLD}`}>Reset...</Button>
              </Card>
            );
          })()}

          {!loading && worlds.length === 0 ? (
            <Card className={cn("p-6 text-center flex flex-col items-center gap-3", neumorphic && "surface-sunken")}>
              <p className="text-muted-foreground">No worlds yet.</p>
              <p className="text-sm text-muted-foreground">A world is its own space: its own people, chats and news. Adventures can be set in one too.</p>
              <Button onClick={() => navigate("/worlds/wizard")} variant="default" className="h-auto px-4 py-2.5 font-semibold text-sm">
                Create a world
              </Button>
            </Card>
          ) : filteredWorlds.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">No worlds match "{search}".</Card>
          ) : (
            // Full width, like My world above (the user's report, 2026-10-26):
            // in a grid each card got one 260px column, too narrow for its
            // switches and buttons.
            <div className="flex flex-col gap-5">
              {filteredWorlds.map((world) => {
                const adventureCount = adventures.filter((a) => a.worldId === world.id).length;
                return (
                  <Card key={world.id} className="p-5 flex flex-col gap-3" aria-label={world.name}>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex-1 min-w-[220px] flex flex-col gap-1.5">
                        <h4 className="font-serif font-semibold text-lg text-foreground leading-tight flex items-center gap-2">
                          <FaGlobe size={13} className="text-subtle flex-shrink-0" /> {world.name}
                          {world.tone && (
                            <Badge variant="outline" className="max-w-[220px] truncate border-primary/20 bg-primary/10 font-sans font-medium text-primary text-[11px]">{world.tone}</Badge>
                          )}
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{world.premise}</p>
                        {world.storyTime && <p className="text-xs text-foreground">Today here: {formatStoryDate(world.storyTime, Date.now())}</p>}
                        {world.tags && world.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {world.tags.slice(0, 4).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                            ))}
                          </div>
                        )}
                        <p className="text-[11px] text-subtle">
                          {plural(countIn(world.id).people, "person").replace("persons", "people")}, {plural(countIn(world.id).chats, "chat")}, {plural(adventureCount, "adventure")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {currentWorldId === world.id ? (
                          <Badge variant="secondary" className="h-9 px-3">You're here</Badge>
                        ) : (
                          <Button onClick={() => goTo(world.id)} variant="default" className="h-9 text-xs font-semibold" aria-label={`Switch to ${world.name}`}>Switch</Button>
                        )}
                        <Button onClick={() => navigate(`/worlds/${world.id}/edit`)} variant="outline" className="h-9 text-xs font-semibold">
                          <FaEdit size={11} /> Edit
                        </Button>
                        <Button onClick={() => setSharing(world)} variant="outline" size="icon" className="h-9 w-9" title="Share" aria-label={`Share ${world.name}`}>
                          <FaShareAlt size={13} />
                        </Button>
                        <Button onClick={() => onExport(world)} variant="outline" size="icon" className="h-9 w-9" title="Export" aria-label={`Export ${world.name}`}>
                          <FaFileExport size={13} />
                        </Button>
                        <Button onClick={() => navigate(`/worlds/${world.id}/timeline`)} variant="outline" size="icon" className="h-9 w-9" title="Timeline" aria-label={`Timeline of ${world.name}`}>
                          <FaHistory size={13} />
                        </Button>
                      </div>
                    </div>
                    <WorldLifeControls worldId={world.id} name={world.name} />
                    {/* The two that undo things sit together, away from the everyday buttons. */}
                    <div className="flex gap-2">
                      <Button onClick={() => setResetting({ id: world.id, name: world.name })} variant="ghost" size="sm" className="text-muted-foreground" aria-label={`Reset ${world.name}`}>Reset...</Button>
                      <Button onClick={() => handleDelete(world.id, world.name)} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" title="Delete world" aria-label="Delete world">
                        <FaTrash size={11} /> Delete
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ShareWorldDialog world={sharing} onOpenChange={(o) => !o && setSharing(null)} />
    </div>
  );
};

export default WorldGalleryPage;
