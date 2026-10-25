import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus, FaEdit, FaTrash, FaGlobe, FaSearch } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { deleteWorld, switchWorld } from "../features/worldSlice";
import { MY_WORLD, worldOf } from "../features/world/currentWorld";
import { useCurrentWorld } from "../hooks/useWorld";
import { useModal } from "../contexts/ModalContext";
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
  const { showConfirm } = useModal();
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const worlds = useAppSelector((state) => state.world.worlds);
  const adventures = useAppSelector((state) => state.adventure.adventures);
  const characters = useAppSelector((state) => state.character.characters);
  const chats = useAppSelector((state) => state.chat.chats);
  const { currentWorldId } = useCurrentWorld();
  // Who and what lives in each world (#143), for the cards.
  const countIn = (id: number | null) => ({
    people: characters.filter((c) => worldOf(c, worlds) === id).length,
    chats: chats.filter((c) => worldOf(c, worlds) === id).length,
  });
  const goTo = (id: number | null) => {
    dispatch(switchWorld(id));
    navigate("/");
  };
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const loading = useAppSelector((state) => state.world.loading);
  const [search, setSearch] = useState("");

  const filteredWorlds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return worlds;
    return worlds.filter((w) => w.name.toLowerCase().includes(q) || w.premise.toLowerCase().includes(q));
  }, [worlds, search]);

  const handleDelete = async (worldId: number, name: string) => {
    const confirmed = await showConfirm(
      "Delete world",
      `Delete "${name}"? Its people and chats move to ${MY_WORLD}, and adventures set here keep their own history.`
    );
    if (confirmed) dispatch(deleteWorld(worldId));
  };

  return (
    <div className="w-full h-dvh flex flex-col">
      <Header title="Worlds" subtitle="Each world is its own space, with its own people and chats." onBack={() => navigate("/adventures")} />
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="w-full max-w-[1180px] mx-auto">

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
              <Button onClick={() => navigate("/worlds/wizard")} variant="default">
                <FaPlus size={12} /> New world
              </Button>
            </div>
          </div>

          {(() => {
            const mine = countIn(null);
            return (
              <Card className="p-5 mb-5 flex flex-wrap items-center gap-3" aria-label={MY_WORLD}>
                <div className="flex-1 min-w-[180px]">
                  <h4 className="font-serif font-semibold text-lg text-foreground leading-tight flex items-center gap-2"><FaGlobe size={13} className="text-subtle" /> {MY_WORLD}</h4>
                  <p className="text-[11px] text-subtle mt-1">Everyone from before worlds, and anyone you haven't put in one. {plural(mine.people, "person").replace("persons", "people")}, {plural(mine.chats, "chat")}.</p>
                </div>
                {currentWorldId === null ? (
                  <Badge variant="secondary">You're here</Badge>
                ) : (
                  <Button onClick={() => goTo(null)} variant="outline" className="h-9 text-xs font-semibold" aria-label={`Switch to ${MY_WORLD}`}>Switch</Button>
                )}
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
            <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {filteredWorlds.map((world) => {
                const adventureCount = adventures.filter((a) => a.worldId === world.id).length;
                return (
                  <Card key={world.id} className="p-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-serif font-semibold text-lg text-foreground truncate leading-tight flex items-center gap-2">
                        <FaGlobe size={13} className="text-subtle flex-shrink-0" /> {world.name}
                      </h4>
                    </div>
                    {world.tone && (
                      <Badge variant="outline" className="self-start max-w-full truncate border-primary/20 bg-primary/10 font-medium text-primary text-[11px]">
                        {world.tone}
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{world.premise}</p>
                    {world.tags && world.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {world.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-subtle mt-auto">
                      {plural(countIn(world.id).people, "person").replace("persons", "people")}, {plural(countIn(world.id).chats, "chat")}, {plural(adventureCount, "adventure")}
                    </p>
                    <div className="flex gap-1.5">
                      {currentWorldId === world.id ? (
                        <Badge variant="secondary" className="h-9 px-3">You're here</Badge>
                      ) : (
                        <Button onClick={() => goTo(world.id)} variant="default" className="h-9 text-xs font-semibold" aria-label={`Switch to ${world.name}`}>Switch</Button>
                      )}
                      <Button onClick={() => navigate(`/worlds/${world.id}/edit`)} variant="outline" className="flex-1 h-9 text-xs font-semibold">
                        <FaEdit size={11} /> Edit
                      </Button>
                      <Button
                        onClick={() => handleDelete(world.id, world.name)}
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 hover:border-destructive hover:text-destructive"
                        title="Delete world"
                        aria-label="Delete world"
                      >
                        <FaTrash size={13} />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorldGalleryPage;
