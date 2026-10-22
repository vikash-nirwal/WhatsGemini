import { AlbumPhoto, RelationshipStage } from "../../types";
import { STAGES } from "./relationshipStages";

// Private albums (#75): a character's photos for you. Some unlock only at a
// relationship stage (#70) in that chat; with stages off, those stay
// locked. On a special date (#47) the character can send one you haven't
// had yet.

export const makeAlbumId = (): string => `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const isUnlocked = (photo: Pick<AlbumPhoto, "unlockAt">, stage: RelationshipStage | undefined): boolean => {
  if (!photo.unlockAt) return true;
  if (!stage) return false;
  return STAGES.indexOf(stage) >= STAGES.indexOf(photo.unlockAt);
};

// The photo a special-date message brings: the first unlocked one not sent yet.
export const photoForOccasion = (album: AlbumPhoto[] | undefined, stage: RelationshipStage | undefined): AlbumPhoto | undefined =>
  (album || []).find((p) => !p.sentAt && isUnlocked(p, stage));

export const occasionPhotoDirective = (photo: AlbumPhoto): string =>
  `You're also sending them a photo from your private album${photo.caption?.trim() ? `: ${photo.caption.trim()}` : ""}. Mention it naturally, as a little gift for the day.`;
