import React, { useRef, useState } from "react";
import { FaLock, FaPlus, FaTimes } from "react-icons/fa";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "src/components/molecules/dialog";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { Select } from "src/components/molecules/form-controls";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";
import { useAppDispatch } from "src/store/hooks";
import { updateCharacter } from "src/features/characterSlice";
import { readPhoto } from "src/features/chat/photoAttachments";
import { isUnlocked, makeAlbumId } from "src/features/character/album";
import { STAGE_LABELS, STAGES } from "src/features/character/relationshipStages";
import { AlbumPhoto, Character, RelationshipStage } from "src/types";
import { cn } from "src/utils/cn";

interface AlbumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: Character;
  stage?: RelationshipStage; // this chat's relationship stage (#70)
}

// A tile that stays blurred until tapped, or locked until its stage.
const Photo = ({ src, label, locked, lockNote }: { src: string; label: string; locked?: boolean; lockNote?: string }) => {
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => setShown((v) => !v)}
      aria-label={locked ? `${label}, locked: ${lockNote}` : shown ? `Hide ${label}` : `Show ${label}`}
      className="relative aspect-square w-full overflow-hidden rounded-lg border border-border/60 bg-muted"
    >
      <DisplayImage srcContext={src} alt={label} className={cn("h-full w-full object-cover transition", (!shown || locked) && "blur-xl scale-110")} />
      {locked ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/40 text-[11px] font-medium text-foreground">
          <FaLock size={14} aria-hidden /> {lockNote}
        </span>
      ) : !shown ? (
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-foreground">Tap to see</span>
      ) : null}
    </button>
  );
};

// Private albums (#75): the pictures a character has sent you, and their
// private album, which you fill and set unlocks for.
export const AlbumDialog: React.FC<AlbumDialogProps> = ({ open, onOpenChange, character, stage }) => {
  const dispatch = useAppDispatch();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const album = character.album || [];
  const sent = character.gallery || [];

  const save = (next: AlbumPhoto[]) => dispatch(updateCharacter({ ...character, album: next.length > 0 ? next : undefined }));
  const patch = (id: string, fields: Partial<AlbumPhoto>) => save(album.map((p) => (p.id === id ? { ...p, ...fields } : p)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogTitle>{character.name}'s album</DialogTitle>
        <DialogDescription>Photos stay blurred until you tap them. Private ones can unlock as your relationship grows{stage ? "" : " (relationship stages are off in this chat, so locked ones stay locked)"}.</DialogDescription>

        <section aria-label="Private album" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Private album</h3>
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><FaPlus size={10} /> Add photos</Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              data-testid="album-input"
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                try {
                  const added = await Promise.all(files.map(async (f) => ({ id: makeAlbumId(), image: await readPhoto(f) })));
                  if (added.length > 0) save([...album, ...added]);
                } catch (err: any) {
                  setError(err?.message || "Couldn't read that image.");
                }
              }}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {album.length === 0 ? (
            <p className="text-sm text-subtle">Nothing here yet. Add photos of {character.name}; on a special date they may send you one.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {album.map((p, i) => {
                const unlocked = isUnlocked(p, stage);
                return (
                  <li key={p.id} className="flex flex-col gap-1.5">
                    <Photo src={p.image} label={p.caption?.trim() || `Photo ${i + 1}`} locked={!unlocked} lockNote={p.unlockAt ? `Unlocks at ${STAGE_LABELS[p.unlockAt]}` : undefined} />
                    <Input aria-label={`Caption for photo ${i + 1}`} value={p.caption || ""} onChange={(e) => patch(p.id, { caption: e.target.value || undefined })} placeholder="Caption" className="h-7 text-[12px] px-2" />
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1">
                        <Select aria-label={`Photo ${i + 1} unlocks at`} value={p.unlockAt || ""} onChange={(e) => patch(p.id, { unlockAt: (e.target.value || undefined) as RelationshipStage | undefined })}>
                          <option value="">Always open</option>
                          {STAGES.slice(1).map((s) => <option key={s} value={s}>Unlocks at {STAGE_LABELS[s]}</option>)}
                        </Select>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Remove photo ${i + 1}`} onClick={() => save(album.filter((x) => x.id !== p.id))}>
                        <FaTimes size={10} />
                      </Button>
                    </div>
                    {p.sentAt && <span className="text-[10.5px] text-subtle">Sent to you on a special day</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Sent to you" className="flex flex-col gap-2">
          <h3 className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Sent to you</h3>
          {sent.length === 0 ? (
            <p className="text-sm text-subtle">Pictures {character.name} sends in your chats collect here.</p>
          ) : (
            <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {sent.map((src, i) => (
                <li key={i}><Photo src={src} label={`Sent picture ${i + 1}`} /></li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
};
