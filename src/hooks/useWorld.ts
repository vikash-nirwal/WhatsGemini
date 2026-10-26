import { useEffect, useMemo, useState } from "react";
import { buildHistoryNote, loadTimeline, onTimeline } from "../features/world/timeline";
import { livingIn, loadWorldPrefs, saveWorldPrefs, WorldPrefs } from "src/features/world/worldPrefs";
import { useAppSelector } from "src/store/hooks";
import { inWorld, worldName, worldOf } from "src/features/world/currentWorld";
import { Channel } from "src/types";

// Worlds as spaces (#143): the world on screen and what's in it. Lists you
// see (chats, people, Updates, starred) use these; background life keeps
// using everything, since other worlds keep running.
export const useCurrentWorld = () => {
  const worlds = useAppSelector((state) => state.world.worlds);
  const currentWorldId = useAppSelector((state) => state.world.currentWorldId);
  const id = worlds.some((w) => w.id === currentWorldId) ? currentWorldId : null;
  return { worlds, currentWorldId: id, current: worlds.find((w) => w.id === id), name: worldName(id, worlds) };
};

export const useWorldChats = () => {
  const chats = useAppSelector((state) => state.chat.chats);
  const { worlds, currentWorldId } = useCurrentWorld();
  return useMemo(() => chats.filter(inWorld(currentWorldId, worlds)), [chats, worlds, currentWorldId]);
};

export const useWorldCharacters = () => {
  const characters = useAppSelector((state) => state.character.characters);
  const { worlds, currentWorldId } = useCurrentWorld();
  return useMemo(() => characters.filter(inWorld(currentWorldId, worlds)), [characters, worlds, currentWorldId]);
};

// A channel follows a character or a world; it shows in the world it's about.
export const useInWorldChannel = () => {
  const characters = useAppSelector((state) => state.character.characters);
  const { worlds, currentWorldId } = useCurrentWorld();
  return (channel: Channel) => {
    if (channel.kind === "world") return channel.refId === currentWorldId;
    const owner = characters.find((c) => c.id === channel.refId);
    return !owner || inWorld(currentWorldId, worlds)(owner);
  };
};

// A world's switches (#145, #146), kept in step across the app.
export const useWorldPrefs = (worldId: number | null): [WorldPrefs, (patch: WorldPrefs) => void] => {
  const [prefs, setPrefs] = useState(() => loadWorldPrefs(worldId));
  useEffect(() => {
    setPrefs(loadWorldPrefs(worldId));
    const sync = () => setPrefs(loadWorldPrefs(worldId));
    window.addEventListener("world-prefs", sync);
    return () => window.removeEventListener("world-prefs", sync);
  }, [worldId]);
  return [prefs, (patch) => setPrefs(saveWorldPrefs(worldId, patch))];
};

// Background jobs (#146) see the people (and group chats) of every world
// that's still living: the one on screen, and others unless switched off.
const usePrefsVersion = () => {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("world-prefs", bump);
    return () => window.removeEventListener("world-prefs", bump);
  }, []);
  return version;
};

export const useLivingCharacters = () => {
  const characters = useAppSelector((state) => state.character.characters);
  const { worlds, currentWorldId } = useCurrentWorld();
  const version = usePrefsVersion();
  return useMemo(
    () => characters.filter((c) => livingIn(worldOf(c, worlds), currentWorldId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characters, worlds, currentWorldId, version]
  );
};

export const useLivingChats = () => {
  const chats = useAppSelector((state) => state.chat.chats);
  const { worlds, currentWorldId } = useCurrentWorld();
  const version = usePrefsVersion();
  return useMemo(
    () => chats.filter((c) => livingIn(worldOf(c, worlds), currentWorldId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chats, worlds, currentWorldId, version]
  );
};

// The name of a world you're not in, for notifications and toasts (#146).
export const useElsewhereName = () => {
  const { worlds, currentWorldId } = useCurrentWorld();
  return (item: { worldId?: number }) => {
    const id = worldOf(item, worlds);
    return id === currentWorldId ? undefined : worldName(id, worlds);
  };
};

// What's happened in a world before (#179), for a chat's prompt: read once
// and kept fresh as the timeline grows.
export const useWorldHistoryNote = (worldId: number | null | undefined): string | undefined => {
  const [note, setNote] = useState<string | undefined>();
  useEffect(() => {
    if (worldId === undefined) return;
    let live = true;
    const load = () => void loadTimeline(worldId).then((list) => live && setNote(buildHistoryNote(list, Date.now())));
    load();
    const off = onTimeline(load);
    return () => {
      live = false;
      off();
    };
  }, [worldId]);
  return note;
};
