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
import { useCurrentWorld, useInWorldChannel, useWorldCharacters } from "src/hooks/useWorld";
import { cn } from "src/utils/cn";

// Channels (#127) on the Updates page: the ones you follow, newest post
// first, and "Find channels" to follow a character's or a world's.
export const ChannelsSection = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const channels = useAppSelector((state) => state.channels.channels);
  const characters = useAppSelector((state) => state.character.characters);
  const worlds = useAppSelector((state) => state.world.worlds);
  // Only this world's channels (#143): its people's, and its own news.
  const worldCharacters = useWorldCharacters();
  const inThisWorld = useInWorldChannel();
  const showNsfw = useAppSelector((state) => state.settings.showNsfwCharacters);
  const [finding, setFinding] = useState(false);

  const subjectOf = (c: Pick<Channel, "kind" | "refId">) => (c.kind === "character" ? characters.find((x) => x.id === c.refId) : worlds.find((w) => w.id === c.refId));
  const followed = channels.filter((c) => subjectOf(c) && inThisWorld(c)).sort((a, b) => (b.posts[b.posts.length - 1]?.at || b.followedAt) - (a.posts[a.posts.length - 1]?.at || a.followedAt));
  const isFollowed = (kind: Channel["kind"], refId: number) => channels.some((c) => c.id === channelId(kind, refId));
  const follow = (kind: Channel["kind"], refId: number) =>
    dispatch(changeChannels((list) => (list.some((c) => c.id === channelId(kind, refId)) ? list : [...list, { id: channelId(kind, refId), kind, refId, followedAt: Date.now(), posts: [] }])));
  const candidates = [
    ...(showNsfw ? worldCharacters : worldCharacters.filter((c) => !isNsfwCharacter(c))).map((c) => ({ kind: "character" as const, refId: c.id, name: channelName("character", c), image: avatarOf(c), accent: c.accent, about: c.description })),
    ...worlds.filter((w) => inThisWorld({ kind: "world", refId: w.id } as Channel)).map((w) => ({ kind: "world" as const, refId: w.id, name: channelName("world", w), image: w.coverImage, accent: undefined, about: w.premise })),
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

  // Up to four not yet followed, as cards under the list (#152).
  const suggested = candidates.filter((c) => !isFollowed(c.kind, c.refId)).slice(0, 4);
  const { name: worldTitle } = useCurrentWorld();
  const timeOf = (at: number) => {
    const d = new Date(at);
    return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <section aria-label="Channels" className="pt-6">
      <div className="flex items-baseline justify-between px-4 pb-1">
        <h2 className="text-[17px] font-bold text-foreground">Channels</h2>
        <button type="button" onClick={() => setFinding(true)} className="text-[13.5px] font-bold text-primary-text hover:underline">Find channels</button>
      </div>
      {followed.length === 0 ? (
        <p className="px-4 py-2 text-[13.5px] text-muted-foreground">Follow a character's or a world's channel for their updates and news.</p>
      ) : (
        <ul className="px-2">
          {followed.map((c) => {
            const last = c.posts[c.posts.length - 1];
            const unread = unreadPosts(c);
            const subject = subjectOf(c)!;
            const name = channelName(c.kind, subject);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => navigate(`/channels/${c.id}`)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-raised" aria-label={`${name}${unread ? `, ${unread} new` : ""}`}>
                  {avatar(c, 48)}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15.5px] font-semibold text-foreground">{name}</span>
                      {last && <span className={cn("flex-none text-[12px]", unread ? "font-semibold text-primary-text" : "text-subtle")}>{timeOf(last.at)}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-muted-foreground">{last ? last.text : "No posts yet"}</span>
                      {unread > 0 && <span data-slot="unread-badge" className="flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{unread}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {suggested.length > 0 && (
        <div className="flex flex-col gap-2.5 px-4 pt-4">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-subtle">Suggested in {worldTitle}</span>
          <ul aria-label="Suggested channels" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {suggested.map((c) => (
              <li key={`${c.kind}-${c.refId}`} className="flex flex-col items-center gap-2 rounded-card bg-card p-3.5 text-center ring-1 ring-inset ring-border">
                <CharacterAvatar name={c.name} accent={c.accent} imageSrc={c.image} size={48} className="rounded-[14px]" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13.5px] font-bold text-foreground">{c.name}</span>
                  {c.about && <span className="line-clamp-1 text-[12px] text-subtle">{c.about}</span>}
                </span>
                <Button type="button" variant="secondary" size="sm" className="h-9 w-full" onClick={() => void follow(c.kind, c.refId)} aria-label={`Follow ${c.name}`}>Follow</Button>
              </li>
            ))}
          </ul>
        </div>
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
