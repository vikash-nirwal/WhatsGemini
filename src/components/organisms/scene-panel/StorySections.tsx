import React, { useState } from "react";
import { FaTimes } from "react-icons/fa";
import { useAppDispatch } from "src/store/hooks";
import { updateChatOptions } from "src/features/chatSlice";
import { updateCharacter } from "src/features/characterSlice";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { cn } from "src/utils/cn";
import { addJokes, JOKE_INTERVAL } from "src/features/chat/insideJokes";
import { standingLies } from "src/features/chat/lies";
import { Character, Chat } from "src/types";

const Title: React.FC<{ children: React.ReactNode; count?: number }> = ({ children, count }) => (
  <div className="flex items-baseline justify-between mb-2">
    <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">{children}</span>
    {count ? <span className="text-[11px] text-primary">{count}</span> : null}
  </div>
);

const RemoveButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <Button type="button" variant="ghost" size="icon" onClick={onClick} className="h-auto w-auto p-0.5 text-subtle hover:text-destructive hover:bg-transparent" aria-label={label}>
    <FaTimes size={10} />
  </Button>
);

// Inside jokes (#96): the list, a switch for the helper check, and your own.
export const InsideJokesSection: React.FC<{ chat: Chat; characterName: string }> = ({ chat, characterName }) => {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState("");
  const jokes = chat.insideJokes || [];
  const save = (patch: Partial<Chat>) => dispatch(updateChatOptions({ chatId: chat.id, patch }));
  const add = () => {
    if (!draft.trim()) return;
    save({ insideJokes: addJokes(jokes, [draft.trim()], Date.now()) });
    setDraft("");
  };
  return (
    <div>
      <Title count={jokes.length}>Just between you</Title>
      <div className="mb-2.5">
        <ToggleSwitch
          checked={Boolean(chat.jokeTracking)}
          onChange={(on) => save({ jokeTracking: on || undefined })}
          label={<span className="text-[12.5px] text-foreground">Notice inside jokes (every {JOKE_INTERVAL} messages)</span>}
        />
      </div>
      {jokes.length === 0 ? (
        <p className="text-[12.5px] text-subtle mb-2">Nicknames, running jokes, "our song", little rituals. {characterName} brings one back now and then.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 mb-2" aria-label="Inside jokes">
          {jokes.map((j) => (
            <li key={j.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border/30 text-[12.5px]">
              <span className="flex-1 text-foreground">{j.text}</span>
              <RemoveButton label={`Remove: ${j.text}`} onClick={() => save({ insideJokes: jokes.filter((x) => x.id !== j.id) })} />
            </li>
          ))}
        </ul>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Input aria-label="New inside joke" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Calls you 'Captain'" className="h-8 text-[12.5px]" />
        <Button type="submit" size="sm" disabled={!draft.trim()} aria-label="Add inside joke">Add</Button>
      </form>
    </div>
  );
};

// Lies (#100): how many stand, and the truth behind a button.
export const LiesSection: React.FC<{ chat: Chat; characterName: string }> = ({ chat, characterName }) => {
  const [shown, setShown] = useState(false);
  const lies = chat.toldLies || [];
  if (!chat.lies && lies.length === 0) return null;
  const standing = standingLies(lies).length;
  const caught = lies.filter((l) => l.caught).length;
  return (
    <div>
      <Title>Lies</Title>
      <p className="text-[12.5px] text-subtle mb-2">
        {lies.length === 0 ? `No lies yet, that you know of.` : `${standing} standing, ${caught} caught.`}
      </p>
      {lies.length > 0 && (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setShown((v) => !v)} aria-expanded={shown}>
            {shown ? "Hide the truth" : "Show the truth"}
          </Button>
          {shown && (
            <ul className="mt-2 flex flex-col gap-1.5" aria-label={`${characterName}'s lies`}>
              {[...lies].reverse().map((l) => (
                <li key={l.id} className={cn("px-3 py-2 rounded-lg bg-background border border-border/30 text-[12.5px]", l.caught && "opacity-70")}>
                  <span className="block text-foreground">"{l.said}"</span>
                  <span className="block text-subtle">The truth: {l.truth}{l.caught ? " · caught" : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

// Their past, from flashbacks (#102), each removable.
export const PastSection: React.FC<{ character: Character }> = ({ character }) => {
  const dispatch = useAppDispatch();
  const events = character.pastEvents || [];
  if (events.length === 0) return null;
  return (
    <div>
      <Title count={events.length}>{character.name}'s past</Title>
      <ul className="flex flex-col gap-1.5" aria-label={`${character.name}'s past`}>
        {events.map((e, i) => (
          <li key={`${i}-${e.slice(0, 20)}`} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-background border border-border/30 text-[12.5px]">
            <span className="flex-1 text-foreground">{e}</span>
            <RemoveButton label={`Remove from their past: ${e.slice(0, 40)}`} onClick={() => dispatch(updateCharacter({ ...character, pastEvents: events.filter((_, j) => j !== i) }))} />
          </li>
        ))}
      </ul>
    </div>
  );
};
