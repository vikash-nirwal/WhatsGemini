import React, { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FaChevronLeft, FaChevronRight, FaHeart, FaRegComment, FaRegHeart, FaReply, FaTimes } from "react-icons/fa";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { NsfwBlur } from "src/components/molecules/NsfwBlur";
import { useAppSelector } from "src/store/hooks";
import { avatarOf } from "src/features/character/profileChanges";
import { isNsfwCharacter } from "src/features/character/contentRating";
import { liveStatuses } from "src/features/character/statusUpdates";
import { mentionParts, statusColorFor } from "src/features/status/statusLook";
import { useStatusActions } from "src/hooks/useStatusActions";
import { DESKTOP_QUERY, useMediaQuery } from "src/hooks/useMediaQuery";
import { formatRelativeTime } from "src/utils/formatRelativeTime";
import { cn } from "src/utils/cn";
import { Character, CharacterStatus } from "src/types";

interface StatusViewerProps {
  queue: Character[]; // whose statuses play, in order
  startId: number | null; // null = closed
  onClose: () => void;
  onOpenCharacter: (character: Character) => void; // marks theirs seen
  onReply: (character: Character, status: CharacterStatus) => void;
}

// The status viewer (#152): full screen on a phone, a story card with the
// comments beside it on desktop, as on the canvas. It moves on when you tap
// (or use the arrows), not on a timer, so nothing slips past while you read.
export const StatusViewer = ({ queue, startId, onClose, onOpenCharacter, onReply }: StatusViewerProps) => {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const characters = useAppSelector((state) => state.character.characters);
  const blurMedia = useAppSelector((state) => state.settings.privacy.blurNsfwMedia);
  const { like, comment, answering, nameOf, likers } = useStatusActions();
  const [charId, setCharId] = useState<number | null>(startId);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    setCharId(startId);
    setIndex(0);
    setShowComments(false);
  }, [startId]);

  const now = Date.now();
  // The latest copy, so likes and comments show as they land.
  const character = characters.find((c) => c.id === charId) || queue.find((c) => c.id === charId);
  const statuses = character ? liveStatuses(character, now) : [];
  const status = statuses[Math.min(index, statuses.length - 1)];
  const at = queue.findIndex((c) => c.id === charId);

  const go = (step: 1 | -1) => {
    const next = index + step;
    if (next >= 0 && next < statuses.length) return setIndex(next);
    const other = queue[at + step];
    if (!other) return step === 1 ? onClose() : undefined;
    onOpenCharacter(other);
    setCharId(other.id);
    setIndex(step === 1 ? 0 : Math.max(0, liveStatuses(other, now).length - 1));
    setShowComments(false);
  };

  if (!character || !status) return null;
  const name = character.name;
  const comments = status.comments || [];
  const liked = likers(status);
  const photo = Boolean(status.image);
  const text = mentionParts(status.text).map((part, i) =>
    part.startsWith("@") ? (
      <mark key={i} data-slot="mention" className="rounded-md bg-[#F4A07C] px-1 font-sans text-[0.85em] font-bold text-[#1E0F08] [text-shadow:none]">{part}</mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft;
    setDraft("");
    void comment(character, status, body);
  };

  const commentList = (
    <>
      {liked.length > 0 && <p className="text-[12.5px] opacity-85" data-slot="status-likes">Liked by {liked.join(", ")}</p>}
      {comments.length > 0 && (
        <ul aria-label="Comments" className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <CharacterAvatar name={nameOf(c.from)} size={desktop ? 32 : 24} />
              <span className="min-w-0 text-[13.5px] leading-[19px]"><b>{nameOf(c.from)}</b> {c.text}</span>
            </li>
          ))}
        </ul>
      )}
      {answering === status.id && <p className="text-[12.5px] opacity-80">{name} is replying...</p>}
    </>
  );

  const commentForm = (
    <form onSubmit={submit} className="flex gap-2">
      <input
        aria-label={`Comment on ${name}'s status`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a comment"
        className="h-11 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-[14px] text-white placeholder:text-white/60 outline-none ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-white/70"
      />
      <button type="submit" disabled={!draft.trim()} aria-label="Post comment" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50">
        <FaChevronRight size={14} />
      </button>
    </form>
  );

  const likeButton = (
    <button
      type="button"
      aria-pressed={Boolean(status.likedByYou)}
      aria-label={status.likedByYou ? "Unlike" : "Like"}
      onClick={() => void like(character, status)}
      className={cn("grid h-12 w-12 flex-none place-items-center rounded-full bg-white/15 lg:h-11 lg:w-11", status.likedByYou ? "text-[#FF8A8A]" : "text-white")}
    >
      {status.likedByYou ? <FaHeart size={18} /> : <FaRegHeart size={18} />}
    </button>
  );

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 lg:bg-[#0B0908]/95" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).tagName === "INPUT") return;
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center gap-6 text-white outline-none"
          data-slot="status-viewer"
        >
          <DialogPrimitive.Title className="sr-only">{name}'s status</DialogPrimitive.Title>
          {desktop && (
            <>
              <DialogPrimitive.Close aria-label="Close viewer" className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"><FaTimes size={16} /></DialogPrimitive.Close>
              <button type="button" aria-label="Previous status" onClick={() => go(-1)} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"><FaChevronLeft size={16} /></button>
            </>
          )}

          {/* The story card: full screen on a phone. */}
          <div
            className={cn("relative flex flex-col overflow-hidden", desktop ? "h-[min(676px,90dvh)] w-[380px] rounded-[20px] shadow-[0_24px_64px_rgba(0,0,0,.6)]" : "h-full w-full")}
            style={{ background: photo ? "#000" : statusColorFor(status.id) }}
          >
            {photo && (
              <NsfwBlur active={blurMedia && isNsfwCharacter(character)} className="absolute inset-0">
                <DisplayImage srcContext={status.image!} alt={`${name}'s status photo`} className="h-full w-full object-cover" />
              </NsfwBlur>
            )}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/55 to-transparent" />
            {photo && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[360px] bg-gradient-to-t from-black/75 to-transparent" />}

            <div className="relative flex gap-1 px-2.5 pt-[max(12px,env(safe-area-inset-top))]" role="progressbar" aria-label={`Status ${index + 1} of ${statuses.length}`} aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={statuses.length}>
              {statuses.map((s, i) => (
                <span key={s.id} className={cn("h-[3px] flex-1 rounded-full", i <= index ? "bg-white" : "bg-white/35")} />
              ))}
            </div>
            <div className={cn("relative flex items-center gap-2.5 py-2.5 pl-3.5", desktop ? "pr-3.5" : "pr-1")}>
              <CharacterAvatar name={name} accent={character.accent} imageSrc={avatarOf(character)} size={36} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-bold">{name}</span>
                <span className="text-[12px] opacity-85">{formatRelativeTime(status.createdAt)}</span>
              </div>
              {status.mentionsYou && <span className="flex h-6 items-center rounded-full bg-black/45 px-2.5 text-[12px] font-bold">Mentions you</span>}
              {!desktop && <DialogPrimitive.Close aria-label="Close" className="grid h-11 w-11 place-items-center"><FaTimes size={18} /></DialogPrimitive.Close>}
            </div>

            {/* Tap the left or right of the picture to go back or on. */}
            <div className="relative flex flex-1">
              {!desktop && (
                <>
                  <button type="button" aria-label="Previous status" onClick={() => go(-1)} className="absolute inset-y-0 left-0 z-10 w-1/3" />
                  <button type="button" aria-label="Next status" onClick={() => go(1)} className="absolute inset-y-0 right-0 z-10 w-1/3" />
                </>
              )}
              {photo ? (
                <p className="relative mt-auto px-5 pb-4 font-serif text-[20px] leading-7 [text-shadow:0_1px_6px_rgba(0,0,0,.5)]">{text}</p>
              ) : (
                <p className="relative m-auto px-8 text-center font-serif text-[26px] leading-[36px] [text-wrap:balance] lg:text-[28px] lg:leading-[38px]">{text}</p>
              )}
            </div>

            {!desktop && (comments.length > 0 || liked.length > 0 || showComments) && (
              <div className="relative mx-3 mb-3 flex max-h-[40dvh] flex-col gap-2 overflow-y-auto rounded-2xl bg-[#141110]/60 p-3 backdrop-blur-md">
                <span className="text-[12px] font-bold">Comments · {comments.length}</span>
                {commentList}
                {showComments && commentForm}
              </div>
            )}
            <div className="relative flex items-center gap-2 px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-1 lg:pb-3">
              <button type="button" onClick={() => onReply(character, status)} className="flex h-12 flex-1 items-center gap-2 rounded-full px-4 text-[15px] ring-[1.5px] ring-inset ring-white/70 lg:h-11 lg:text-[14px]">
                <FaReply size={13} /> Reply to {name}
              </button>
              {!desktop && (
                <button type="button" aria-label="Comment" aria-expanded={showComments} onClick={() => setShowComments((v) => !v)} className="grid h-12 w-12 flex-none place-items-center rounded-full bg-white/15">
                  <FaRegComment size={18} />
                </button>
              )}
              {likeButton}
            </div>
          </div>

          {desktop && (
            <>
              <aside aria-label="Comments panel" className="flex h-[min(676px,90dvh)] w-[320px] flex-col rounded-[20px] bg-[#1B1716] text-[#F3EDE9]">
                <div className="flex items-baseline justify-between px-[18px] pb-2.5 pt-[18px]">
                  <h2 className="text-[17px] font-bold">Comments</h2>
                  <span className="text-[12px] text-white/60">{comments.length} · {liked.length} {liked.length === 1 ? "like" : "likes"}</span>
                </div>
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-[18px]">
                  {comments.length === 0 && liked.length === 0 && <p className="text-[13px] text-white/60">No comments yet.</p>}
                  {commentList}
                </div>
                <div className="border-t border-white/10 p-3.5">{commentForm}</div>
                <p className="px-[18px] pb-3.5 text-[12px] text-white/60">Comments are public to the cast. Reply goes privately to {name}'s chat, with this status quoted.</p>
              </aside>
              <button type="button" aria-label="Next status" onClick={() => go(1)} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"><FaChevronRight size={16} /></button>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default StatusViewer;
