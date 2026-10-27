import React, { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FaChevronDown, FaEye, FaGlobe, FaHeart, FaImage, FaPlus, FaRegComment, FaTimes, FaTrash, FaArrowRight } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { selectActivePersona } from "src/features/settingsSlice";
import { changeMyStatuses } from "src/features/myStatusSlice";
import { readPhoto } from "src/features/chat/photoAttachments";
import { addMyStatus, happened, liveMyStatuses, newMyStatusId } from "src/features/status/myStatuses";
import { decideMyStatusReactions } from "src/features/status/decideReactions";
import { replyToStatusComment } from "src/features/status/replyToComment";
import { STATUS_COLORS } from "src/features/status/statusLook";
import { MyStatus } from "src/types";
import { useCurrentWorld, useWorldCharacters } from "src/hooks/useWorld";

const MAX_STATUS = 700;
const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// A full-screen layer for the composer and your status's views (#152).
const FullScreen = ({ open, onOpenChange, title, background, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; background: string; children: React.ReactNode }) => (
  <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
      <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col text-white outline-none lg:my-6 lg:overflow-hidden lg:rounded-[20px]" style={{ background }}>
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
);

// Your own statuses (#117) at the top of Updates: "My status" (a tile on a
// phone, a row on desktop), the full-screen composer, and who saw each one,
// liked it and commented, in a sheet under it (#152).
export const MyStatusSection = ({ variant }: { variant: "tile" | "row" }) => {
  const dispatch = useAppDispatch();
  const persona = useAppSelector(selectActivePersona);
  const statuses = useAppSelector((state) => state.myStatus.statuses);
  const characters = useWorldCharacters();
  const { name: worldName, currentWorldId } = useCurrentWorld();
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [bg, setBg] = useState(STATUS_COLORS[0].value);
  const [font, setFont] = useState<"serif" | "sans">("serif");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<"views" | "likes" | "comments">("views");
  const fileRef = useRef<HTMLInputElement>(null);
  // Re-renders every half minute, so views and comments appear as their
  // time comes.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const now = Date.now();
  const live = liveMyStatuses(statuses, now);
  const latest = live[live.length - 1];
  const userName = persona?.name?.trim() || "You";
  const nameOf = (id: number) => characters.find((c) => c.id === id)?.name || "Someone";
  // Replying to a comment (2026-10-27): your reply goes under it, they answer.
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [answering, setAnswering] = useState<string | null>(null);
  const sendReply = async (commentId: string, from: number) => {
    const who = characters.find((c) => c.id === from);
    const status = statuses.find((s) => s.comments?.some((c) => c.id === commentId));
    if (!who || !status || !replyText.trim()) return;
    const text = replyText;
    setReplyText("");
    setReplyingTo(null);
    setAnswering(commentId);
    try {
      await dispatch(replyToStatusComment(status, commentId, text, who, userName));
    } catch {
      setError(`${who.name} couldn't answer just now.`);
    } finally {
      setAnswering(null);
    }
  };
  const latestViews = latest ? happened(latest.views, now).length : 0;
  const latestLikes = latest ? happened(latest.likes, now).length : 0;

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await readPhoto(file));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const post = async () => {
    const body = text.trim();
    if (!body && !photo) return;
    setPosting(true);
    const status: MyStatus = { id: newMyStatusId(), text: body, image: photo, createdAt: Date.now(), ...(photo ? {} : { bg, font }), ...(currentWorldId ? { worldId: currentWorldId } : {}) };
    try {
      await dispatch(changeMyStatuses((list) => addMyStatus(list, status)));
      setComposing(false);
      setText("");
      setPhoto(undefined);
      // Who sees it and what they do, decided on the helper model; retried
      // in the background if this doesn't get through.
      void dispatch(decideMyStatusReactions(status.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPosting(false);
    }
  };

  const remove = (id: string) => {
    dispatch(changeMyStatuses((list) => list.filter((s) => s.id !== id)));
    if (live.length <= 1) setViewing(false);
    else setIndex((i) => Math.max(0, i - 1));
  };

  const openViews = () => {
    setIndex(Math.max(0, live.length - 1));
    setTab("views");
    setViewing(true);
  };

  const shown = live[Math.min(index, live.length - 1)];
  const views = shown ? happened(shown.views, now) : [];
  const likes = shown ? happened(shown.likes, now) : [];
  const comments = shown ? happened(shown.comments, now) : [];

  return (
    <section aria-label="My status" className={variant === "tile" ? "flex-none" : "px-2"}>
      {variant === "tile" ? (
        <div className="relative flex h-[152px] w-24 flex-col items-center justify-center gap-2 rounded-2xl bg-raised ring-1 ring-inset ring-border">
          <button type="button" onClick={() => (latest ? openViews() : setComposing(true))} aria-label={latest ? "View my status" : "Add a status"} className="absolute inset-0 rounded-2xl" />
          <span className={cn("pointer-events-none rounded-full", latest && "shadow-[0_0_0_2px_rgb(var(--raised)),0_0_0_4px_rgb(var(--primary))]")}>
            <CharacterAvatar name={userName} imageSrc={persona?.avatar} size={48} />
          </span>
          <span className="pointer-events-none text-[12.5px] font-bold text-foreground">My status</span>
          {latest && (
            <span className="pointer-events-none flex items-center gap-1 text-[12px] text-subtle">
              <FaEye aria-hidden size={11} />{latestViews} · <FaHeart aria-hidden size={10} />{latestLikes}
            </span>
          )}
          {latest && (
            <button type="button" onClick={() => setComposing(true)} aria-label="Add a status" className="absolute right-1.5 top-1.5 grid h-[26px] w-[26px] place-items-center rounded-full bg-primary text-primary-foreground">
              <FaPlus size={11} />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => (latest ? openViews() : setComposing(true))} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-raised" aria-label={latest ? "View my status" : "Add a status"}>
            <span className={cn("relative rounded-full", latest && "p-[2px] ring-2 ring-primary ring-offset-2 ring-offset-surface")}>
              <CharacterAvatar name={userName} imageSrc={persona?.avatar} size={40} />
              {!latest && (
                <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-surface"><FaPlus size={9} /></span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-foreground">My status</span>
              <span className="block text-[12.5px] text-subtle">{latest ? `${timeOf(latest.createdAt)} · ${latestViews} ${latestViews === 1 ? "view" : "views"} · ${latestLikes} ${latestLikes === 1 ? "like" : "likes"}` : "Add a status update"}</span>
            </span>
          </button>
          {latest && (
            <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-raised" aria-label="Add a status" title="Add a status" onClick={() => setComposing(true)}>
              <FaPlus size={13} />
            </button>
          )}
        </div>
      )}

      {/* The composer: your words big on a colour, or a photo. */}
      <FullScreen open={composing} onOpenChange={(o) => !posting && setComposing(o)} title="New status" background={photo ? "#0B0908" : bg}>
        <header className="flex flex-none items-center gap-1 px-2 pt-[max(8px,env(safe-area-inset-top))]">
          <DialogPrimitive.Close aria-label="Discard" className="grid h-11 w-11 place-items-center"><FaTimes size={18} /></DialogPrimitive.Close>
          <span className="flex-1" />
          {!photo && (
            <button type="button" aria-label="Change font" onClick={() => setFont((f) => (f === "serif" ? "sans" : "serif"))} className={cn("grid h-11 w-11 place-items-center rounded-full bg-black/20 text-[18px]", font === "serif" ? "font-serif" : "font-sans font-bold")}>Aa</button>
          )}
          <button type="button" aria-label={photo ? "Change photo" : "Add a photo"} onClick={() => fileRef.current?.click()} className="grid h-11 w-11 place-items-center rounded-full bg-black/20"><FaImage size={16} /></button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} aria-label="Status photo" />
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6">
          {photo && (
            <div className="relative">
              <img src={photo} alt="Your status" className="max-h-[50dvh] rounded-xl" />
              <button type="button" aria-label="Remove photo" onClick={() => setPhoto(undefined)} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/60"><FaTimes size={12} /></button>
            </div>
          )}
          <textarea
            aria-label="Status text"
            autoFocus
            value={text}
            maxLength={MAX_STATUS}
            onChange={(e) => setText(e.target.value)}
            placeholder={photo ? "Add a caption" : "Type a status"}
            rows={photo ? 2 : 4}
            className={cn("w-full resize-none bg-transparent text-center text-white placeholder:text-white/60 outline-none [text-wrap:balance]", photo ? "text-[17px]" : "text-[30px] leading-10", !photo && (font === "serif" ? "font-serif" : "font-sans font-semibold"))}
          />
          {error && <p className="text-[13px] text-white">{error}</p>}
        </div>
        {!photo && (
          <div role="radiogroup" aria-label="Background colour" className="flex flex-none justify-center gap-2.5 pb-4">
            {STATUS_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={bg === c.value}
                aria-label={c.name}
                onClick={() => setBg(c.value)}
                className="h-8 w-8 rounded-full"
                style={{ background: c.value, boxShadow: bg === c.value ? `0 0 0 3px ${c.value}, 0 0 0 5px #fff` : "inset 0 0 0 2px rgba(255,255,255,.5)" }}
              />
            ))}
          </div>
        )}
        <div className="flex flex-none items-center gap-2.5 bg-black/25 px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <span className="flex min-h-[44px] flex-1 items-center gap-2 rounded-full bg-black/25 px-3 text-[13.5px] font-semibold">
            <FaGlobe aria-hidden size={13} /> Everyone in {worldName} <FaChevronDown aria-hidden size={10} className="opacity-0" />
          </span>
          <button type="button" aria-label="Post" onClick={() => void post()} disabled={posting || (!text.trim() && !photo)} className="grid h-[52px] w-[52px] place-items-center rounded-full bg-white disabled:opacity-60" style={{ color: photo ? "#0B0908" : bg }}>
            <FaArrowRight size={18} />
          </button>
        </div>
      </FullScreen>

      {/* Your status, with who saw it, liked it and commented, in a sheet. */}
      <FullScreen open={viewing && Boolean(shown)} onOpenChange={setViewing} title="My status" background={shown?.image ? "#0B0908" : shown?.bg || STATUS_COLORS[0].value}>
        {shown && (
          <>
            <div className="flex gap-1 px-2.5 pt-[max(12px,env(safe-area-inset-top))]" role="progressbar" aria-label={`Status ${index + 1} of ${live.length}`} aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={live.length}>
              {live.map((s, i) => <span key={s.id} className={cn("h-[3px] flex-1 rounded-full", i <= index ? "bg-white" : "bg-white/35")} />)}
            </div>
            <div className="flex items-center gap-2.5 py-2.5 pl-3.5 pr-1">
              <CharacterAvatar name={userName} imageSrc={persona?.avatar} size={36} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14px] font-bold">My status</span>
                <span className="text-[12px] opacity-85">{timeOf(shown.createdAt)} · Everyone in {worldName}</span>
              </div>
              <button type="button" aria-label="Delete status" onClick={() => remove(shown.id)} className="grid h-11 w-11 place-items-center"><FaTrash size={14} /></button>
              <DialogPrimitive.Close aria-label="Close" className="grid h-11 w-11 place-items-center"><FaTimes size={16} /></DialogPrimitive.Close>
            </div>
            <div className="relative flex min-h-[200px] flex-1 items-center justify-center px-8">
              {live.length > 1 && <button type="button" aria-label="Previous status" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))} className="absolute inset-y-0 left-0 w-1/4" />}
              {shown.image && <img src={shown.image} alt="Your status" className="max-h-[36dvh] rounded-xl" />}
              {shown.text && !shown.image && <p className={cn("text-center text-[24px] leading-8", shown.font === "sans" ? "font-sans font-semibold" : "font-serif")}>{shown.text}</p>}
              {live.length > 1 && <button type="button" aria-label="Next status" disabled={index === live.length - 1} onClick={() => setIndex((i) => Math.min(live.length - 1, i + 1))} className="absolute inset-y-0 right-0 w-1/4" />}
            </div>
            {shown.text && shown.image && <p className="px-6 pb-3 text-center text-[15px]">{shown.text}</p>}
            <div className="flex max-h-[52%] min-h-[40%] flex-col rounded-t-[24px] bg-popover text-foreground">
              <span aria-hidden className="mx-auto mb-1 mt-2 h-1 w-9 rounded-full bg-border-strong" />
              <div role="tablist" aria-label="Who saw your status" className="grid grid-cols-3 border-b border-border px-2">
                {([["views", "Seen by", views.length, <FaEye key="i" size={14} />], ["likes", "Liked by", likes.length, <FaHeart key="i" size={13} />], ["comments", "Comments", comments.length, <FaRegComment key="i" size={14} />]] as const).map(([id, label, count, icon]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("flex h-11 items-center justify-center gap-1.5 border-b-2 text-[13.5px] font-semibold", tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}>
                    {icon}<span>{label} {count}</span>
                  </button>
                ))}
              </div>
              <div role="tabpanel" className="flex-1 overflow-y-auto px-2 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
                {tab === "comments" ? (
                  comments.length === 0 ? <p className="px-3 py-4 text-[13.5px] text-muted-foreground">No comments yet.</p> : (
                    <ul aria-label="Comments" className="flex flex-col gap-1">
                      {comments.filter((c) => !c.replyTo).map((c) => (
                        <li key={c.id} className="flex flex-col gap-1 rounded-xl px-3 py-2">
                          <div className="flex items-start gap-3">
                            <CharacterAvatar name={typeof c.from === "number" ? nameOf(c.from) : userName} size={32} />
                            <span className="min-w-0 flex-1 text-[14px]"><b>{typeof c.from === "number" ? nameOf(c.from) : "You"}</b> {c.text}</span>
                            {typeof c.from === "number" && (
                              <button type="button" onClick={() => { setReplyingTo(c.id); setReplyText(""); }} aria-label={`Reply to ${nameOf(c.from)}`} className="flex-none text-[12.5px] font-semibold text-primary-text">Reply</button>
                            )}
                          </div>
                          {comments.filter((r) => r.replyTo === c.id).map((r) => (
                            <div key={r.id} className="ml-11 flex items-start gap-2.5">
                              <CharacterAvatar name={typeof r.from === "number" ? nameOf(r.from) : userName} size={24} />
                              <span className="min-w-0 text-[13.5px]"><b>{typeof r.from === "number" ? nameOf(r.from) : "You"}</b> {r.text}</span>
                            </div>
                          ))}
                          {answering === c.id && typeof c.from === "number" && <p className="ml-11 text-[12.5px] text-subtle">{nameOf(c.from)} is replying...</p>}
                          {replyingTo === c.id && typeof c.from === "number" && (
                            <form className="ml-11 flex gap-2" onSubmit={(e) => { e.preventDefault(); void sendReply(c.id, c.from as number); }}>
                              <input autoFocus value={replyText} onChange={(e) => setReplyText(e.target.value)} aria-label={`Your reply to ${nameOf(c.from)}`} placeholder={`Reply to ${nameOf(c.from)}`} className="h-9 min-w-0 flex-1 rounded-lg bg-background px-3 text-[13.5px] text-foreground ring-1 ring-inset ring-border" />
                              <button type="submit" disabled={!replyText.trim()} className="h-9 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send</button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
                ) : (tab === "views" ? views : likes).length === 0 ? (
                  <p className="px-3 py-4 text-[13.5px] text-muted-foreground">{tab === "views" ? "No views yet." : "No likes yet."}</p>
                ) : (
                  <ul aria-label={tab === "views" ? "Seen by" : "Liked by"} className="flex flex-col">
                    {(tab === "views" ? views : likes).map((v) => (
                      <li key={v.characterId} className="flex min-h-14 items-center gap-3 rounded-xl px-3">
                        <CharacterAvatar name={nameOf(v.characterId)} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold">{nameOf(v.characterId)}</span>
                          <span className="block text-[12.5px] text-subtle">Today {timeOf(v.at)}</span>
                        </span>
                        {(tab === "likes" || likes.some((l) => l.characterId === v.characterId)) && <FaHeart aria-label="liked it" role="img" size={14} className="text-destructive" />}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </FullScreen>
    </section>
  );
};

export default MyStatusSection;
