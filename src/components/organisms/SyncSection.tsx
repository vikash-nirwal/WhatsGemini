import React, { useEffect, useState } from "react";
import { FaSyncAlt } from "react-icons/fa";
import { toast } from "sonner";
import { Button } from "src/components/atoms/button";
import { TextInput } from "src/components/molecules/form-controls";
import { formatRelativeTime } from "src/utils/formatRelativeTime";
import { WrongSyncCodeError } from "src/features/sync/syncCrypto";
import { createSync, folderHasSync, folderSupported, joinSync, resumeSync, stopSync, syncCode, syncNow, SyncStatus, syncStatus, watchSync } from "src/features/sync/syncService";

// "Sync between computers" (#274), in Settings › Data. Turning it on picks a
// folder that Google Drive (or another folder-syncing app) keeps the same on
// each computer; the first computer makes the sync code, the others type it.
const SyncSection: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus>(syncStatus());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Joining: the folder picked, waiting for the code.
  const [joining, setJoining] = useState<FileSystemDirectoryHandle | null>(null);
  const [typed, setTyped] = useState("");
  const [keepMine, setKeepMine] = useState(true);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => watchSync(setStatus), []);

  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof WrongSyncCodeError ? "That code doesn't open this sync folder. Check it on the computer that made it." : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pickFolder = () =>
    work(async () => {
      let picked: FileSystemDirectoryHandle;
      try {
        picked = await (window as any).showDirectoryPicker({ mode: "readwrite", id: "kindred-sync" });
      } catch {
        return; // closed without picking
      }
      if (await folderHasSync(picked)) {
        setJoining(picked);
        return;
      }
      // A second computer picking a folder Drive hasn't filled yet would
      // otherwise start a sync of its own, apart from the first one's.
      if (!window.confirm("This folder has no Kindred sync in it yet. Start a new one here?\n\nIf another computer already syncs through this folder, cancel and wait for Google Drive to bring its files over first.")) return;
      await createSync(picked);
      setShowCode(true);
      toast.success("Sync is on. Type the sync code on your other computer.");
    });

  const join = () =>
    work(async () => {
      if (!joining) return;
      await joinSync(joining, typed, keepMine);
      setJoining(null);
      setTyped("");
      toast.success("This computer is in sync.");
    });

  const turnOff = () =>
    work(async () => {
      if (!window.confirm("Stop syncing this computer? It keeps its chats and characters; the sync folder and your other computers are left as they are.")) return;
      await stopSync();
      setShowCode(false);
    });

  const on = status.phase !== "off";

  return (
    <div className="p-5 flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <FaSyncAlt aria-hidden className="text-primary" /> Sync between computers
      </div>
      <p className="text-xs text-muted-foreground">
        Keeps your chats, characters, worlds, adventures, statuses and personas the same on each computer, through a folder that Google Drive for desktop (or a similar app) syncs. The app keeps a hidden folder there, locked with a sync code, so the files can't be read without it. Each computer keeps its own API keys and settings.
      </p>

      {!folderSupported() ? (
        <p className="text-xs text-muted-foreground">This needs Chrome or Edge on a computer: this browser can't open a folder from a website.</p>
      ) : !on && !joining ? (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>On the first computer, turn sync on and pick a folder in Google Drive, such as "My Drive". You'll get a sync code.</li>
            <li>On each other computer, turn sync on, pick the same folder and type the code.</li>
          </ol>
          <div>
            <Button type="button" onClick={pickFolder} disabled={busy}>
              {busy ? "Setting up..." : "Turn on sync"}
            </Button>
          </div>
        </>
      ) : joining ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <p className="text-xs text-foreground">This folder already has sync from another computer. Type its sync code (Settings › Data on that computer).</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">Sync code</span>
            <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} />
          </label>
          <fieldset className="flex flex-col gap-1.5 text-xs">
            <legend className="sr-only">What happens to this computer's library</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="sync-keep" checked={keepMine} onChange={() => setKeepMine(true)} className="mt-0.5" />
              <span><span className="text-foreground">Add this computer's chats and characters to it.</span> <span className="text-muted-foreground">Ones that are already there aren't doubled.</span></span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="sync-keep" checked={!keepMine} onChange={() => setKeepMine(false)} className="mt-0.5" />
              <span><span className="text-foreground">Replace this computer's library with it.</span> <span className="text-muted-foreground">What's only here is gone; download a backup first if you want it.</span></span>
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={join} disabled={busy || typed.replace(/[^A-Za-z0-9]/g, "").length < 12}>
              {busy ? "Syncing..." : "Join sync"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setJoining(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-foreground" role="status">
            {status.phase === "syncing"
              ? "Syncing..."
              : status.phase === "needs-permission"
                ? "Paused: the browser needs your OK to use the sync folder again."
                : status.phase === "error"
                  ? `Sync stopped: ${status.error}`
                  : status.lastSyncAt
                    ? `In sync, ${formatRelativeTime(status.lastSyncAt)}.`
                    : "On."}
          </p>
          {showCode ? (
            <div className="rounded-lg border border-border px-3 py-2">
              <div className="text-[11.5px] text-muted-foreground">Sync code: type it on your other computers</div>
              <div className="font-mono text-base tracking-wider text-foreground" aria-label="Sync code">{syncCode()}</div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {status.phase === "needs-permission" ? (
              <Button type="button" onClick={() => work(resumeSync)} disabled={busy}>Allow the sync folder</Button>
            ) : (
              <Button type="button" onClick={() => work(syncNow)} disabled={busy || status.phase === "syncing"}>Sync now</Button>
            )}
            <Button type="button" variant="outline" onClick={() => setShowCode((s) => !s)}>{showCode ? "Hide the code" : "Show the sync code"}</Button>
            <Button type="button" variant="outline" onClick={turnOff} disabled={busy}>Turn off</Button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

export default SyncSection;
