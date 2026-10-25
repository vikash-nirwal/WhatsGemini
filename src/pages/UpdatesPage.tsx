import { blockedEitherWay } from "src/features/chat/blocking";
import React, { useState } from "react";
import { avatarOf } from "../features/character/profileChanges";
import Header from "src/components/organisms/Header";
import { cn } from "src/utils/cn";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
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
import { useCurrentWorld, useWorldChats, useWorldCharacters } from "src/hooks/useWorld";
import { StatusViewer } from "src/components/organisms/StatusViewer";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { statusColorFor } from "src/features/status/statusLook";
import { DESKTOP_QUERY, useMediaQuery } from "src/hooks/useMediaQuery";

const clockOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
  const characters = useWorldCharacters();
  const showNsfw = useAppSelector((state) => state.settings.showNsfwCharacters);
  const [viewing, setViewing] = useState<Character | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const reply = useStatusReply(() => { setViewing(null); setFeedOpen(false); });
  const now = Date.now();
  // Blocked either way (#133): their statuses don't reach you.
  const chats = useWorldChats();
  const visible = (showNsfw ? characters : characters.filter((c) => !isNsfwCharacter(c))).filter((c) => !blockedEitherWay(chats, c.id));
  const posting = visible
    .filter((c) => liveStatuses(c, now).length > 0)
    .map((c) => {
      const live = liveStatuses(c, now);
      return { character: c, latest: Math.max(...live.map((s) => s.createdAt)), status: live[live.length - 1], count: live.length, unseen: hasUnseenStatus(c, now), mentions: live.some((s) => s.mentionsYou) };
    })
    .sort((a, b) => b.latest - a.latest);
  const recent = posting.filter((p) => p.unseen);
  const viewed = posting.filter((p) => !p.unseen);
  const markOpened = (c: Character) => {
    if (hasUnseenStatus(c, now)) dispatch(updateCharacter({ ...c, statuses: markSeen(c.statuses) }));
  };
  const open = (c: Character) => {
    setViewing(c);
    markOpened(c);
  };
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { name: worldTitle } = useCurrentWorld();
  const emptyNote = <p className="px-4 py-6 text-[13.5px] text-muted-foreground">Nothing from your characters in the last day. A character posts here when "Posts statuses" is on in their chat's Chat tab.</p>;
  const feed = feedItems(visible, now);

  // Desktop: rows under "Recent" and "Viewed", as on the canvas.
  const rows = (title: string, label: string, items: typeof posting) =>
    items.length > 0 && (
      <section aria-label={title} className="pt-2">
        <h3 className="px-4 pb-1 pt-2 text-[11.5px] font-bold uppercase tracking-[0.06em] text-subtle">{label}</h3>
        <ul className="px-2">
          {items.map(({ character, latest, unseen, mentions, count }) => (
            <li key={character.id}>
              <button type="button" onClick={() => open(character)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-raised" aria-label={`${character.name}'s status${unseen ? ", new" : ""}`}>
                <span className={cn("rounded-full p-[2px] ring-2 ring-offset-2 ring-offset-surface", unseen ? "ring-primary" : "ring-border")}>
                  <CharacterAvatar name={character.name} accent={character.accent} imageSrc={avatarOf(character)} size={40} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-foreground">{character.name}</span>
                  <span className="block text-[12.5px] text-subtle">{mentions ? <span className="font-bold text-primary-text">Mentioned you · </span> : null}{timeOf(latest)}{count > 1 ? ` · ${count} updates` : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  // Phone: a strip of tall tiles, the picture or the status's colour behind
  // each (#152).
  const tiles = (title: string, items: typeof posting) =>
    items.length > 0 && (
      <section aria-label={title} className="flex flex-none gap-2.5">
        {items.map(({ character, latest, unseen, mentions, status }) => (
          <button
            key={character.id}
            type="button"
            onClick={() => open(character)}
            aria-label={`${character.name}'s status${unseen ? ", new" : ""}`}
            className={cn("relative flex h-[152px] w-24 flex-none flex-col justify-between overflow-hidden rounded-2xl p-2 text-left", unseen ? "text-white" : "bg-sunken text-foreground")}
            style={unseen ? { background: status.image ? "#000" : statusColorFor(status.id) } : undefined}
          >
            {unseen && status.image && <DisplayImage srcContext={status.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
            <span className={cn("relative w-fit rounded-full", unseen ? "shadow-[0_0_0_2px_#fff,0_0_0_4px_rgb(var(--primary))]" : "shadow-[0_0_0_2px_rgb(var(--sunken)),0_0_0_4px_rgb(var(--border-strong))]")}>
              <CharacterAvatar name={character.name} accent={character.accent} imageSrc={avatarOf(character)} size={32} />
            </span>
            <span className={cn("relative flex flex-col gap-0.5", unseen && "[text-shadow:0_1px_4px_rgba(0,0,0,.45)]")}>
              {mentions && <span className="w-fit rounded-md bg-black/40 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.03em] [text-shadow:none]">Mentions you</span>}
              <span className="truncate text-[13.5px] font-bold">{character.name}</span>
              <span className={cn("text-[12px]", unseen ? "opacity-90" : "text-subtle")}>{unseen ? clockOf(latest) : "Viewed"}</span>
            </span>
          </button>
        ))}
      </section>
    );

  return (
    <div className="flex h-dvh w-full flex-col">
      <Header title="Updates" subtitle={worldTitle} />
      <div className="flex-1 overflow-y-auto" style={shell ? { paddingBottom: TAB_BAR_HEIGHT + 16 } : undefined}>
        <div className="mx-auto max-w-2xl">
          <div className="flex items-baseline justify-between px-4 pb-2 pt-4">
            <h2 className="text-[17px] font-bold text-foreground">Status</h2>
            {feed.length > 0 && (
              <button type="button" onClick={() => setFeedOpen(true)} className="text-[13.5px] font-bold text-primary-text hover:underline">All posts</button>
            )}
          </div>
          {desktop ? (
            <>
              <MyStatusSection variant="row" />
              {posting.length === 0 ? emptyNote : (
                <>
                  {rows("Recent updates", "Recent", recent)}
                  {rows("Viewed updates", "Viewed", viewed)}
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                <MyStatusSection variant="tile" />
                {tiles("Recent updates", recent)}
                {tiles("Viewed updates", viewed)}
              </div>
              {posting.length === 0 && emptyNote}
            </>
          )}
          <ChannelsSection />
        </div>
      </div>

      <StatusViewer
        queue={posting.map((p) => p.character)}
        startId={viewing?.id ?? null}
        onClose={() => setViewing(null)}
        onOpenCharacter={markOpened}
        onReply={reply}
      />

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
