import React, { useState } from "react";
import { avatarOf } from "../features/character/profileChanges";
import Header from "src/components/organisms/Header";
import { cn } from "src/utils/cn";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { Button } from "src/components/atoms/button";
import { StatusFeed } from "src/components/organisms/StatusFeed";
import { MyStatusSection } from "src/components/organisms/MyStatusSection";
import { ChannelsSection } from "src/components/organisms/ChannelsSection";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { updateCharacter } from "src/features/characterSlice";
import { isNsfwCharacter } from "src/features/character/contentRating";
import { hasUnseenStatus, liveStatuses, markSeen } from "src/features/character/statusUpdates";
import { feedItems } from "src/features/character/statusFeed";
import { useStatusReply } from "src/hooks/useStatusReply";
import { usePhoneShell, TAB_BAR_HEIGHT } from "src/hooks/usePhoneShell";
import { Character } from "src/types";

const timeOf = (at: number) => {
  const date = new Date(at);
  return date.toDateString() === new Date().toDateString()
    ? `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : `Yesterday, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};

// Updates (#114): WhatsApp's Updates tab. Characters' statuses from the last
// day, the unseen ones first, each opening its viewer; every kept post in
// the feed. Your own statuses (#117) and channels (#127) join it later.
const UpdatesPage = () => {
  const dispatch = useAppDispatch();
  const shell = usePhoneShell();
  const characters = useAppSelector((state) => state.character.characters);
  const showNsfw = useAppSelector((state) => state.settings.showNsfwCharacters);
  const [viewing, setViewing] = useState<Character | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const reply = useStatusReply(() => { setViewing(null); setFeedOpen(false); });
  const now = Date.now();
  const visible = showNsfw ? characters : characters.filter((c) => !isNsfwCharacter(c));
  const posting = visible
    .filter((c) => liveStatuses(c, now).length > 0)
    .map((c) => ({ character: c, latest: Math.max(...liveStatuses(c, now).map((s) => s.createdAt)), unseen: hasUnseenStatus(c, now), mentions: liveStatuses(c, now).some((s) => s.mentionsYou) }))
    .sort((a, b) => b.latest - a.latest);
  const recent = posting.filter((p) => p.unseen);
  const viewed = posting.filter((p) => !p.unseen);
  const open = (c: Character) => {
    setViewing(c);
    if (hasUnseenStatus(c, now)) dispatch(updateCharacter({ ...c, statuses: markSeen(c.statuses) }));
  };
  const current = viewing ? characters.find((c) => c.id === viewing.id) || viewing : null;
  const feed = feedItems(visible, now);

  const rows = (title: string, items: typeof posting) =>
    items.length > 0 && (
      <section aria-label={title} className="pt-3">
        <h3 className="px-4 pb-1 text-[13px] font-medium text-muted-foreground">{title}</h3>
        <ul>
          {items.map(({ character, latest, unseen, mentions }) => (
            <li key={character.id}>
              <button type="button" onClick={() => open(character)} className="flex w-full items-center gap-3.5 px-4 py-2.5 text-left hover:bg-hover" aria-label={`${character.name}'s status${unseen ? ", new" : ""}`}>
                <span className={cn("rounded-full p-[2px] ring-2 ring-offset-2 ring-offset-background", unseen ? "ring-primary" : "ring-border")}>
                  <CharacterAvatar name={character.name} accent={character.accent} imageSrc={avatarOf(character)} size={46} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium text-foreground">{character.name}</span>
                  <span className="block text-[13px] text-muted-foreground">{mentions ? <span className="font-medium text-primary">Mentioned you · </span> : null}{timeOf(latest)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="flex h-dvh w-full flex-col">
      <Header title="Updates" />
      <div className="flex-1 overflow-y-auto" style={shell ? { paddingBottom: TAB_BAR_HEIGHT + 16 } : undefined}>
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-[20px] font-bold text-foreground">Status</h2>
            {feed.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFeedOpen(true)}>All posts</Button>
            )}
          </div>
          <MyStatusSection />
          {posting.length === 0 ? (
            <p className="px-4 py-6 text-[13.5px] text-muted-foreground">Nothing from your characters in the last day. A character posts here when "Posts statuses" is on in their chat's Chat tab.</p>
          ) : (
            <>
              {rows("Recent updates", recent)}
              {rows("Viewed updates", viewed)}
            </>
          )}
          <ChannelsSection />
        </div>
      </div>

      <Dialog open={current != null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogTitle>{current?.name}'s status</DialogTitle>
          <DialogDescription className="sr-only">Statuses from the last day</DialogDescription>
          {current && <StatusFeed items={liveStatuses(current, now).map((status) => ({ character: current, status }))} onReply={reply} />}
        </DialogContent>
      </Dialog>

      <Dialog open={feedOpen} onOpenChange={setFeedOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle>Feed</DialogTitle>
          <DialogDescription className="sr-only">Every character's recent statuses</DialogDescription>
          <StatusFeed items={feed} onReply={reply} showPoster />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UpdatesPage;
