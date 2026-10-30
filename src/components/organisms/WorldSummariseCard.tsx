import React, { useMemo, useRef, useState } from "react";
import { FaCompressAlt, FaStop } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { autoCompressAdventure, autoCompressChat } from "src/features/aiSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { condenseMemoryIfDue } from "src/features/memory/condenseJob";
import { scanWorld, SummariseItem } from "src/features/world/worldSummarise";
import { World } from "src/types";

type Status = "waiting" | "running" | "done" | "failed";

const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

// "Summarise this world" (worldSummarise.ts): catches up every long chat,
// adventure and memory in the world at once, one call at a time, with the
// same rules and prompt as summarising on send. Nothing is deleted.
export const WorldSummariseCard = ({ world }: { world: World }) => {
  const dispatch = useAppDispatch();
  const chats = useAppSelector((state) => state.chat.chats);
  const adventures = useAppSelector((state) => state.adventure.adventures);
  const characters = useAppSelector((state) => state.character.characters);
  const settings = useAppSelector((state) => state.settings);
  const activePersona = useAppSelector(selectActivePersona);
  const userName = (settings.personas.find((p) => p.id === world.personaId) || activePersona)?.name?.trim() || "the user";
  const items = useMemo(
    () => scanWorld(world, { chats, adventures, characters }, { thresholdMessages: settings.compressThreshold, keepTokens: settings.historyKeepTokens }),
    [world, chats, adventures, characters, settings.compressThreshold, settings.historyKeepTokens]
  );
  const [run, setRun] = useState<{ item: SummariseItem; status: Status; note?: string }[] | null>(null);
  const [running, setRunning] = useState(false);
  const stopped = useRef(false);

  const calls = items.reduce((sum, i) => sum + (i.passes || 1), 0);
  const tokens = items.reduce((sum, i) => sum + (i.tokens || 0), 0);
  const off = settings.historyKeepTokens <= 0 && settings.compressThreshold <= 0;

  const start = async () => {
    stopped.current = false;
    setRunning(true);
    const list = items.map((item) => ({ item, status: "waiting" as Status }));
    setRun(list);
    const set = (i: number, status: Status, note?: string) => setRun((r) => r && r.map((x, j) => (j === i ? { ...x, status, note } : x)));
    try {
      for (let i = 0; i < list.length; i++) {
        if (stopped.current) break;
        const { item } = list[i];
        set(i, "running");
        try {
          if (item.kind === "memory") {
            await dispatch(condenseMemoryIfDue({ kind: "character", id: item.id, name: item.name }, userName));
            set(i, "done");
            continue;
          }
          // A long one takes several passes; each folds the oldest part.
          let messages = item.kind === "chat" ? chats.find((c) => c.id === item.id)?.content || [] : adventures.find((a) => a.id === item.id)?.content || [];
          const chat = item.kind === "chat" ? chats.find((c) => c.id === item.id) : undefined;
          const ids = chat?.characterIds || [];
          const names = item.kind === "chat"
            ? { userName, charName: characters.find((c) => c.id === ids[0])?.name, speakerNames: ids.length > 1 ? Object.fromEntries(ids.map((id) => [id, characters.find((c) => c.id === id)?.name || "?"])) : undefined }
            : { userName, charName: "Narrator" };
          let error: string | undefined;
          for (let pass = 0; pass < (item.passes || 1) + 1 && !stopped.current; pass++) {
            const r = item.kind === "chat"
              ? await dispatch(autoCompressChat({ chatId: item.id, messages, names })).unwrap()
              : await dispatch(autoCompressAdventure({ adventureId: item.id, messages, names })).unwrap();
            if (r.error) {
              error = r.error;
              break;
            }
            if (r.messages === messages) break; // nothing more to fold
            messages = r.messages;
          }
          set(i, error ? "failed" : "done", error);
        } catch (err) {
          set(i, "failed", err instanceof Error ? err.message : String(err));
        }
      }
    } finally {
      setRunning(false);
    }
  };

  const kindName = (i: SummariseItem) => (i.kind === "chat" ? "chat" : i.kind === "adventure" ? "adventure" : "memories");
  return (
    <Card className="flex flex-col gap-4 p-6" aria-label="Summarise this world">
      <div>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-foreground"><FaCompressAlt size={13} className="text-subtle" /> Summarise this world</h3>
        <p className="mt-1 text-xs text-subtle">
          Catches up every long chat and adventure here now, keeping the newest part word for word and folding the rest into its summary note, and condenses long memories. The same as happens when you next send in each one, all at once. Nothing is deleted.
        </p>
      </div>
      {off ? (
        <p className="text-[13px] text-muted-foreground">Summarising is off: set "Keep word for word" in Settings › Text model.</p>
      ) : items.length === 0 && !run ? (
        <p className="text-[13px] text-muted-foreground">Nothing here needs it: every chat is within {settings.historyKeepTokens.toLocaleString()} tokens.</p>
      ) : (
        <>
          {!run && (
            <p className="text-[13px] text-foreground">
              {items.length} to do: about {calls} {calls === 1 ? "call" : "calls"} reading roughly {fmt(tokens)} tokens on your Background model.
            </p>
          )}
          <ul aria-label="To summarise" className="flex flex-col gap-1.5">
            {(run || items.map((item) => ({ item, status: "waiting" as Status, note: undefined }))).map(({ item, status, note }) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-baseline justify-between gap-3 rounded-lg bg-raised px-3 py-2 text-[13px]">
                <span className="min-w-0 truncate"><span className="font-semibold text-foreground">{item.name}</span> <span className="text-subtle">· {kindName(item)}{item.tokens ? ` · ${fmt(item.tokens)} tokens to fold` : ""}</span></span>
                {run && <span className={status === "failed" ? "text-destructive" : "text-muted-foreground"} title={note}>{status === "waiting" ? "Waiting" : status === "running" ? "Summarising..." : status === "done" ? "Done" : "Failed"}</span>}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {!running && items.length > 0 && <Button type="button" onClick={() => void start()}><FaCompressAlt size={11} /> {run ? "Summarise what's left" : "Summarise now"}</Button>}
            {running && <Button type="button" variant="outline" onClick={() => { stopped.current = true; }}><FaStop size={10} /> Stop</Button>}
          </div>
        </>
      )}
    </Card>
  );
};
