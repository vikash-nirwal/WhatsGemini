import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus, FaTrash, FaDiceD20, FaSearch, FaGlobe } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { deleteAdventure } from "../features/adventureSlice";
import { useModal } from "../contexts/ModalContext";
import { useColorTheme } from "../hooks/useColorTheme";
import { cn } from "../utils/cn";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { Badge } from "src/components/atoms/badge";
import { Input } from "src/components/atoms/input";
import Header from "src/components/organisms/Header";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";

const AdventureGalleryPage = () => {
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

  const handleDelete = async (adventureId: number, title: string) => {
    const confirmed = await showConfirm("Delete adventure", `Delete "${title}"? This can't be undone.`);
    if (confirmed) dispatch(deleteAdventure(adventureId));
  };

  return (
    <div className="w-full h-screen flex flex-col">
      <Header title="Adventures" subtitle="Guided roleplay stories, in worlds you build." onBack={() => navigate("/")} />
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="w-full max-w-[1180px] mx-auto">

          <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
            <div>
              <h2 className="text-[26px] font-bold tracking-tight text-foreground">Your adventures</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {loading ? "Loading..." : `${adventures.length} adventure${adventures.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="flex gap-2">
              {adventures.length > 0 && (
                <div className="relative">
                  <FaSearch size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search adventures" aria-label="Search adventures" className="pl-8 text-[13px] w-[220px] bg-card" />
                </div>
              )}
              <Button onClick={() => navigate("/worlds")} variant="outline">
                <FaGlobe size={12} /> Worlds
              </Button>
              <Button onClick={() => navigate("/adventures/new")} variant="default">
                <FaPlus size={12} /> New adventure
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
            <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {filteredAdventures.map((adventure) => {
                const world = worlds.find((w) => w.id === adventure.worldId);
                const cast = characters.filter((c) => adventure.characterIds.includes(c.id));
                return (
                  <Card
                    key={adventure.id}
                    className="p-5 flex flex-col gap-3 cursor-pointer hover:border-primary/40 border border-transparent transition"
                    onClick={() => navigate(`/adventures/${adventure.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-serif font-semibold text-lg text-foreground truncate leading-tight flex items-center gap-2">
                        <FaDiceD20 size={13} className="text-subtle flex-shrink-0" /> {adventure.title}
                      </h4>
                      {adventure.status === "completed" && <Badge variant="secondary" className="text-[10px] flex-shrink-0">Completed</Badge>}
                    </div>
                    {world && (
                      <Badge variant="outline" className="self-start max-w-full truncate border-primary/20 bg-primary/10 font-medium text-primary text-[11px]">
                        <FaGlobe size={9} className="mr-1" /> {world.name}
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{adventure.premise || "No premise set yet."}</p>
                    {cast.length > 0 && (
                      <div className="flex items-center -space-x-2 mt-1">
                        {cast.slice(0, 5).map((c) => (
                          <CharacterAvatar key={c.id} name={c.name} accent={c.accent} imageSrc={c.appearanceImages?.[0]} size={26} className="border-2 border-card" />
                        ))}
                        {cast.length > 5 && <span className="text-[10px] text-subtle pl-3">+{cast.length - 5}</span>}
                      </div>
                    )}
                    <div className="flex gap-1.5 mt-auto pt-1">
                      <Button onClick={(e) => { e.stopPropagation(); navigate(`/adventures/${adventure.id}`); }} className="flex-1 h-9 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 shadow-none">
                        Open
                      </Button>
                      <Button
                        onClick={(e) => { e.stopPropagation(); handleDelete(adventure.id, adventure.title); }}
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 hover:border-destructive hover:text-destructive"
                        title="Delete adventure"
                        aria-label="Delete adventure"
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

export default AdventureGalleryPage;
