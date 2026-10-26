import React, { useState } from "react";
import { FaBolt, FaMagic } from "react-icons/fa";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextInput, TextArea } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { selectActivePersona } from "src/features/settingsSlice";
import { shareNews } from "src/features/world/shareNews";
import { generateAssistText } from "src/features/aiSlice";
import { activeEvents, buildEventIdeaPrompt, daysLeft, newEventId, parseEvent } from "src/features/world/worldEvents";
import { endWorldEvent, startWorldEvent } from "src/features/world/startEvent";
import { useWorldCharacters } from "src/hooks/useWorld";
import { World } from "src/types";

const DAY = 24 * 60 * 60 * 1000;

// World events (#162) on the current world: what's going on now, and a way
// to start one yourself - written out in full, or from a line with AI help.
export const WorldEventsSection = ({ world }: { world: World }) => {
  const dispatch = useAppDispatch();
  const cast = useWorldCharacters();
  const chats = useAppSelector((state) => state.chat.chats);
  const persona = useAppSelector(selectActivePersona);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [days, setDays] = useState("3");
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const events = activeEvents(world, now);

  const suggest = async () => {
    setBusy(true);
    try {
      const reply = await dispatch(generateAssistText({ instruction: buildEventIdeaPrompt(world, cast.map((c) => c.name), world.events || [], [title, text].filter(Boolean).join(": ") || undefined) })).unwrap();
      const idea = parseEvent(reply, now);
      if (!idea) throw new Error("unreadable");
      setTitle(idea.title);
      setText(idea.text);
      setDays(String(Math.round((idea.endsAt - idea.at) / DAY)));
    } catch {
      toast.error("No idea came back. Try again, or write it yourself.");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    const n = Math.min(14, Math.max(1, Math.round(Number(days)) || 3));
    await dispatch(startWorldEvent(world, { id: newEventId(), title: title.trim(), text: text.trim() || title.trim(), at: Date.now(), endsAt: Date.now() + n * DAY, byYou: true }));
    toast.success(`${title.trim()} is happening in ${world.name}`);
    // People close to it may text you about it (#178).
    void dispatch(shareNews({ world, cast, chats, userName: persona?.name?.trim() || "the user", news: `${title.trim()}: ${text.trim() || title.trim()}` }));
    setOpen(false);
    setTitle("");
    setText("");
    setDays("3");
  };

  return (
    <section aria-label="World events" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-[17px] font-bold text-foreground">Happening now</h3>
        <button type="button" onClick={() => setOpen(true)} className="text-[13.5px] font-bold text-primary-text hover:underline">Start an event</button>
      </div>
      {events.length === 0 ? (
        <p className="text-[13.5px] text-muted-foreground">Nothing special. Every few days the world has an event of its own: a festival, a storm, a scandal.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 rounded-card bg-sunken p-3">
              <FaBolt size={13} aria-hidden className="mt-1 flex-none text-primary-text" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-foreground">{e.title}</div>
                <p className="text-[13px] leading-[18px] text-muted-foreground">{e.text}</p>
                <span className="text-[12px] text-subtle">{daysLeft(e, now) <= 1 ? "Last day" : `${daysLeft(e, now)} more days`}</span>
              </div>
              <button type="button" onClick={() => void dispatch(endWorldEvent(world, e.id, Date.now()))} aria-label={`End ${e.title}`} className="flex-none text-[12.5px] font-semibold text-subtle hover:text-foreground">End</button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sheet" className="px-4">
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
            <DialogTitle className="pt-1">Start an event</DialogTitle>
            <DialogDescription>Something happens to everyone in {world.name}. While it lasts, it's in their chats, statuses, the news and their talk.</DialogDescription>
            <TextInput aria-label="Event name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The lantern festival" />
            <TextArea aria-label="What's happening" value={text} onChange={(e) => setText(e.target.value)} placeholder="What everyone knows about it" className="min-h-[70px] resize-none" />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Lasts
              <TextInput type="number" min={1} max={14} aria-label="Days it lasts" value={days} onChange={(e) => setDays(e.target.value)} className="w-20" />
              days
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => void suggest()}>
                <FaMagic size={12} /> {busy ? "Thinking..." : title.trim() || text.trim() ? "Flesh it out" : "Suggest one"}
              </Button>
              <Button type="button" className="flex-1" disabled={!title.trim() || busy} onClick={() => void start()}>Make it happen</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default WorldEventsSection;
