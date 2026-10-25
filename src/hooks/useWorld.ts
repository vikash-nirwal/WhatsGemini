import { useMemo } from "react";
import { useAppSelector } from "src/store/hooks";
import { inWorld, worldName } from "src/features/world/currentWorld";
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
