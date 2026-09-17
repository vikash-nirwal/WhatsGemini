import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus, FaEdit, FaTrash, FaGlobe, FaSearch } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { deleteWorld } from "../features/worldSlice";
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
      `Delete "${name}"? Any adventures set here keep their own history - they just lose the shared world reference.`
    );
    if (confirmed) dispatch(deleteWorld(worldId));
  };

  return (
    <div className="w-full h-screen flex flex-col">
      <Header title="Worlds" subtitle="Settings and universes your adventures can share." onBack={() => navigate("/adventures")} />
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
              <Button onClick={() => navigate("/worlds/new")} variant="default">
                <FaPlus size={12} /> New world
              </Button>
            </div>
          </div>

          {!loading && worlds.length === 0 ? (
            <Card className={cn("p-6 text-center flex flex-col items-center gap-3", neumorphic && "surface-sunken")}>
              <p className="text-muted-foreground">No worlds yet.</p>
              <p className="text-sm text-muted-foreground">Create a setting once, then set as many adventures in it as you like.</p>
              <Button onClick={() => navigate("/worlds/new")} variant="default" className="h-auto px-4 py-2.5 font-semibold text-sm">
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
                    <p className="text-[11px] text-subtle mt-auto">{adventureCount} adventure{adventureCount === 1 ? "" : "s"} set here</p>
                    <div className="flex gap-1.5">
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
