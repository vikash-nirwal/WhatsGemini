import React, { useEffect, useRef, useState } from "react";
import { FaCamera, FaHeart, FaPlus, FaTimes } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { Button } from "src/components/atoms/button";
import { Textarea } from "src/components/atoms/textarea";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { selectActivePersona } from "src/features/settingsSlice";
import { changeMyStatuses } from "src/features/myStatusSlice";
import { generateAssistText } from "src/features/aiSlice";
import { readPhoto } from "src/features/chat/photoAttachments";
import { addMyStatus, buildMyStatusReactionsPrompt, happened, liveMyStatuses, newMyStatusId, parseMyStatusReactions, statusViewersFor } from "src/features/status/myStatuses";
import { MyStatus } from "src/types";

const MAX_STATUS = 700;
const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// Your own statuses (#117) at the top of Updates: "My status", posting a
// new one, and each one's viewers, likes and comments as they come in.
export const MyStatusSection = () => {
  const dispatch = useAppDispatch();
  const persona = useAppSelector(selectActivePersona);
  const statuses = useAppSelector((state) => state.myStatus.statuses);
  const characters = useAppSelector((state) => state.character.characters);
  const chats = useAppSelector((state) => state.chat.chats);
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const status: MyStatus = { id: newMyStatusId(), text: body, image: photo, createdAt: Date.now() };
    try {
      await dispatch(changeMyStatuses((list) => addMyStatus(list, status)));
      setComposing(false);
      setText("");
      setPhoto(undefined);
      // Who sees it and what they do, decided once, on the helper model.
      const viewers = statusViewersFor(characters, chats);
      if (viewers.length === 0) return;
      const reply = await dispatch(generateAssistText({ instruction: buildMyStatusReactionsPrompt(persona?.name?.trim() || "the user", status, viewers), background: true })).unwrap();
      const reactions = parseMyStatusReactions(reply, viewers, status.createdAt);
      await dispatch(changeMyStatuses((list) => list.map((s) => (s.id === status.id ? { ...s, ...reactions } : s))));
    } catch (err) {
      console.warn("Status reactions failed (non-fatal):", err);
    } finally {
      setPosting(false);
    }
  };

  const remove = (id: string) => dispatch(changeMyStatuses((list) => list.filter((s) => s.id !== id)));

  return (
    <section aria-label="My status" className="pt-1">
      <div className="flex items-center gap-3.5 px-4 py-2.5">
        <button
          type="button"
          onClick={() => (latest ? setViewing(true) : setComposing(true))}
          className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
          aria-label={latest ? "View my status" : "Add a status"}
        >
          <span className={cn("relative rounded-full", latest && "p-[2px] ring-2 ring-primary ring-offset-2 ring-offset-background")}>
            <CharacterAvatar name={userName} imageSrc={persona?.avatar} size={46} />
            {!latest && (
              <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
                <FaPlus size={9} />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium text-foreground">My status</span>
            <span className="block text-[13px] text-muted-foreground">{latest ? `Today, ${timeOf(latest.createdAt)}` : "Tap to add a status update"}</span>
          </span>
        </button>
        {latest && (
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Add a status" title="Add a status" onClick={() => setComposing(true)}>
            <FaPlus size={13} />
          </Button>
        )}
      </div>

      <Dialog open={composing} onOpenChange={(o) => !posting && setComposing(o)}>
        <DialogContent>
          <DialogTitle>New status</DialogTitle>
          <DialogDescription>Characters you chat with will see it over the next half hour. It lasts a day.</DialogDescription>
          <Textarea aria-label="Status text" value={text} maxLength={MAX_STATUS} onChange={(e) => setText(e.target.value)} placeholder="What's on your mind?" className="min-h-[96px] resize-none" />
          {photo && (
            <div className="relative w-fit">
              <img src={photo} alt="Your status photo" className="max-h-48 rounded-lg" />
              <Button type="button" variant="destructive" className="absolute right-1 top-1 h-auto w-auto rounded-full p-1" aria-label="Remove photo" onClick={() => setPhoto(undefined)}>
                <FaTimes size={10} />
              </Button>
            </div>
          )}
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FaCamera size={12} /> {photo ? "Change photo" : "Add a photo"}
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} aria-label="Status photo" />
            <Button type="button" onClick={() => void post()} disabled={posting || (!text.trim() && !photo)}>
              {posting ? "Posting..." : "Post"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={viewing} onOpenChange={setViewing}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle>My status</DialogTitle>
          <DialogDescription className="sr-only">Your statuses from the last day, with who saw them</DialogDescription>
          <ol className="flex flex-col gap-4">
            {[...live].reverse().map((s) => {
              const views = happened(s.views, now);
              const likes = happened(s.likes, now);
              const comments = happened(s.comments, now);
              return (
                <li key={s.id} className="flex flex-col gap-2" aria-label={`Status from ${timeOf(s.createdAt)}`}>
                  {s.image && <img src={s.image} alt="Your status photo" className="max-h-72 w-full rounded-lg object-cover" />}
                  {s.text && (
                    <p className={cn("rounded-lg px-4 py-3 text-[15px]", s.image ? "text-foreground" : "bg-primary text-primary-foreground text-center text-[17px] py-6")}>{s.text}</p>
                  )}
                  <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                    <span>Today, {timeOf(s.createdAt)}</span>
                    <button type="button" className="text-destructive hover:underline" onClick={() => void remove(s.id)}>Delete</button>
                  </div>
                  <details className="rounded-lg bg-secondary/60 px-3 py-2 text-[13px]">
                    <summary className="cursor-pointer font-medium text-foreground">Seen by {views.length}</summary>
                    {views.length === 0 ? (
                      <p className="pt-1 text-muted-foreground">No views yet.</p>
                    ) : (
                      <ul className="pt-1.5 flex flex-col gap-1" aria-label="Seen by">
                        {views.map((v) => (
                          <li key={v.characterId} className="flex items-center justify-between gap-2">
                            <span>
                              {nameOf(v.characterId)}
                              {likes.some((l) => l.characterId === v.characterId) && <FaHeart aria-label="liked it" size={10} className="ml-1.5 inline text-red-500" />}
                            </span>
                            <span className="text-muted-foreground">{timeOf(v.at)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                  {comments.length > 0 && (
                    <ul className="flex flex-col gap-1.5 text-[13px]" aria-label="Comments">
                      {comments.map((c) => (
                        <li key={c.id}>
                          <span className="font-semibold">{typeof c.from === "number" ? nameOf(c.from) : "You"}</span> {c.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default MyStatusSection;
