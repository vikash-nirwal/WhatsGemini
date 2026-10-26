import React, { useState } from "react";
import { driveAutoOn, setDriveAuto } from "src/features/backup/autoBackup";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { FaCloudDownloadAlt, FaCloudUploadAlt, FaGoogleDrive } from "react-icons/fa";
import { toast } from "sonner";
import { Button } from "src/components/atoms/button";
import { TextInput } from "src/components/molecules/form-controls";
import { formatRelativeTime } from "src/utils/formatRelativeTime";
import {
  decryptBackup,
  DriveBackup,
  downloadDriveBackup,
  encryptBackup,
  rememberPassphrase,
  getDriveToken,
  KEEP_BACKUPS,
  listDriveBackups,
  LS_GOOGLE_CLIENT_ID,
  pruneDriveBackups,
  uploadDriveBackup,
} from "src/services/driveBackup";

interface DriveBackupSectionProps {
  buildBackup: () => Promise<Blob>; // the same zip as "Download full backup"
  restoreBackup: (file: File) => Promise<void>; // the same flow as "Restore from file", confirm included
  onBackedUp: () => void;
}

const MIN_PASSPHRASE = 8;

const readClientId = () => {
  try {
    return localStorage.getItem(LS_GOOGLE_CLIENT_ID) || "";
  } catch {
    return "";
  }
};

// "Back up to Google Drive" (#54), in Settings > Data. The passphrase is
// never stored: without it a backup can't be opened, by anyone.
const DriveBackupSection: React.FC<DriveBackupSectionProps> = ({ buildBackup, restoreBackup, onBackedUp }) => {
  const [clientId, setClientId] = useState(readClientId);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState<"backup" | "list" | "restore" | null>(null);
  const [backups, setBackups] = useState<DriveBackup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveClientId = (value: string) => {
    setClientId(value);
    try {
      if (value.trim()) localStorage.setItem(LS_GOOGLE_CLIENT_ID, value.trim());
      else localStorage.removeItem(LS_GOOGLE_CLIENT_ID);
    } catch {
      // Only a convenience; it can be pasted again.
    }
  };

  const ready = clientId.trim().length > 0 && passphrase.length >= MIN_PASSPHRASE;
  const [auto, setAuto] = useState(driveAutoOn());

  const run = async (kind: "backup" | "list", work: (token: string) => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await work(await getDriveToken(clientId.trim()));
    } catch (err: any) {
      setError(err?.message || "Something went wrong with Google Drive.");
    } finally {
      setBusy(null);
    }
  };

  const handleBackup = () =>
    run("backup", async (token) => {
      const zip = await buildBackup();
      const sealed = await encryptBackup(await zip.arrayBuffer(), passphrase);
      const name = `kindred_backup_${new Date().toISOString().replace(/[:.]/g, "-")}.wgbk`;
      await uploadDriveBackup(token, sealed, name);
      // Daily backups while the app is open (#198) reuse this visit's passphrase.
      if (auto) rememberPassphrase(passphrase);
      const removed = await pruneDriveBackups(token).catch(() => 0);
      onBackedUp();
      toast.success(`Backed up to Google Drive${removed > 0 ? `, keeping the newest ${KEEP_BACKUPS}` : ""}.`);
    });

  const handleList = () => run("list", async (token) => setBackups(await listDriveBackups(token)));

  const handleRestore = async (backup: DriveBackup) => {
    setBusy("restore");
    setError(null);
    try {
      const token = await getDriveToken(clientId.trim());
      const opened = await decryptBackup(await downloadDriveBackup(token, backup.id), passphrase);
      await restoreBackup(new File([opened], backup.name.replace(/\.wgbk$/, ".zip"), { type: "application/zip" }));
    } catch (err: any) {
      setError(err?.message || "Couldn't restore that backup.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-5 flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <FaGoogleDrive aria-hidden className="text-primary" /> Back up to Google Drive
      </div>
      <p className="text-xs text-muted-foreground">
        Encrypted in this browser with your passphrase, then kept in a hidden folder of your own Drive that only this app can see. Restore on any device with the same passphrase. Nobody else can open it, including Google; lose the passphrase and the backup can't be opened.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] text-muted-foreground">Google OAuth client ID</span>
        <TextInput value={clientId} onChange={(e) => saveClientId(e.target.value)} placeholder="1234...apps.googleusercontent.com" autoComplete="off" spellCheck={false} />
      </label>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">How to get a client ID (once, free)</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>In Google Cloud Console, create a project and enable the Google Drive API.</li>
          <li>Under APIs &amp; Services › OAuth consent screen, set it up for external users and add yourself as a test user.</li>
          <li>Under Credentials, create an OAuth client ID of type "Web application", with this site's address ({window.location.origin}) as an authorized JavaScript origin.</li>
          <li>Paste the client ID here.</li>
        </ol>
      </details>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] text-muted-foreground">Backup passphrase (at least {MIN_PASSPHRASE} characters, not saved)</span>
        <TextInput type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="new-password" />
      </label>

      <ToggleSwitch
        checked={auto}
        onChange={(on) => {
          setAuto(on);
          setDriveAuto(on);
          if (!on) rememberPassphrase(undefined);
        }}
        label={<span className="text-sm text-muted-foreground">Back up daily while the app is open: after your first backup each visit, it keeps the passphrase in memory until you close the app.</span>}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleBackup} disabled={!ready || busy !== null}>
          <FaCloudUploadAlt /> {busy === "backup" ? "Backing up..." : "Back up to Drive"}
        </Button>
        <Button type="button" variant="outline" onClick={handleList} disabled={!ready || busy !== null}>
          <FaCloudDownloadAlt /> {busy === "list" ? "Looking..." : "Restore from Drive"}
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {backups && (
        backups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No backups in Google Drive yet.</p>
        ) : (
          <ul aria-label="Drive backups" className="flex flex-col gap-1.5">
            {backups.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0 text-xs">
                  <div className="text-foreground">{new Date(b.createdTime).toLocaleString()}</div>
                  <div className="text-subtle">{formatRelativeTime(new Date(b.createdTime).getTime())}{b.size ? ` · ${(b.size / 1_000_000).toFixed(1)} MB` : ""}</div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => handleRestore(b)} disabled={busy !== null} aria-label={`Restore the backup from ${new Date(b.createdTime).toLocaleString()}`}>
                  {busy === "restore" ? "Restoring..." : "Restore"}
                </Button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
};

export default DriveBackupSection;
