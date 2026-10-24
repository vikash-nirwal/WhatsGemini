import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { Button } from "src/components/atoms/button";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { changeChannels } from "src/features/channelSlice";
import { channelId, channelName, unreadPosts } from "src/features/channels/channels";
import { avatarOf } from "src/features/character/profileChanges";
import { isNsfwCharacter } from "src/features/character/contentRating";
import { Channel } from "src/types";

// Channels (#127) on the Updates page: the ones you follow, newest post
// first, and "Find channels" to follow a character's or a world's.
export const ChannelsSection = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const channels = useAppSelector((state) => state.channels.channels);
  const characters = useAppSelector((state) => state.character.characters);
  const worlds = useAppSelector((state) => state.world.worlds);
  const showNsfw = useAppSelector((state) => state.settings.showNsfwCharacters);
  const [finding, setFinding] = useState(false);

  const subjectOf = (c: Pick<Channel, "kind" | "refId">) => (c.kind === "character" ? characters.find((x) => x.id === c.refId) : worlds.find((w) => w.id === c.refId));
  const followed = channels.filter((c) => subjectOf(c)).sort((a, b) => (b.posts[b.posts.length - 1]?.at || b.followedAt) - (a.posts[a.posts.length - 1]?.at || a.followedAt));
  const isFollowed = (kind: Channel["kind"], refId: number) => channels.some((c) => c.id === channelId(kind, refId));
  const follow = (kind: Channel["kind"], refId: number) =>
    dispatch(changeChannels((list) => (list.some((c) => c.id === channelId(kind, refId)) ? list : [...list, { id: channelId(kind, refId), kind, refId, followedAt: Date.now(), posts: [] }])));
  const candidates = [
    ...(showNsfw ? characters : characters.filter((c) => !isNsfwCharacter(c))).map((c) => ({ kind: "character" as const, refId: c.id, name: channelName("character", c), image: avatarOf(c), accent: c.accent, about: c.description })),
    ...worlds.map((w) => ({ kind: "world" as const, refId: w.id, name: channelName("world", w), image: w.coverImage, accent: undefined, about: w.premise })),
  ];

  const avatar = (c: Pick<Channel, "kind" | "refId">, size: number) => {
    const subject = subjectOf(c);
    if (!subject) return null;
    return c.kind === "character" ? (
      <CharacterAvatar name={subject.name} accent={"accent" in subject ? subject.accent : undefined} imageSrc={avatarOf(subject as never)} size={size} className="rounded-xl" />
    ) : (
      <CharacterAvatar name={subject.name} imageSrc={(subject as { coverImage?: string }).coverImage} size={size} className="rounded-xl" />
    );
  };

  return (
    <section aria-label="Channels" className="pt-6">
      <div className="flex items-center justify-between px-4">
        <h2 className="text-[20px] font-bold text-foreground">Channels</h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setFinding(true)}>Find channels</Button>
      </div>
      {followed.length === 0 ? (
        <p className="px-4 py-3 text-[13.5px] text-muted-foreground">Follow a character's or a world's channel for their updates and news.</p>
      ) : (
        <ul className="pt-1">
          {followed.map((c) => {
            const last = c.posts[c.posts.length - 1];
            const unread = unreadPosts(c);
            const subject = subjectOf(c)!;
            const name = channelName(c.kind, subject);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => navigate(`/channels/${c.id}`)} className="flex w-full items-center gap-3.5 px-4 py-2.5 text-left hover:bg-hover" aria-label={`${name}${unread ? `, ${unread} new` : ""}`}>
                  {avatar(c, 46)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium text-foreground">{name}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{last ? last.text : "No posts yet"}</span>
                  </span>
                  {unread > 0 && <span data-slot="unread-badge" className="min-w-[19px] h-[19px] px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center">{unread}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={finding} onOpenChange={setFinding}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogTitle>Find channels</DialogTitle>
          <DialogDescription>Every character and world has one. Following brings a first post soon.</DialogDescription>
          <ul className="flex flex-col gap-1" aria-label="Channels to follow">
            {candidates.map((c) => (
              <li key={`${c.kind}-${c.refId}`} className="flex items-center gap-3 py-1.5">
                <CharacterAvatar name={c.name} accent={c.accent} imageSrc={c.image} size={36} className="rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-foreground">{c.name}</span>
                  {c.about && <span className="block truncate text-[12px] text-muted-foreground">{c.about}</span>}
                </span>
                {isFollowed(c.kind, c.refId) ? (
                  <span className="text-[12.5px] text-subtle">Following</span>
                ) : (
                  <Button type="button" size="sm" onClick={() => void follow(c.kind, c.refId)} aria-label={`Follow ${c.name}`}>Follow</Button>
                )}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default ChannelsSection;
