import JSZip from "jszip";
import { dbService } from "./dbService";
import { Chat, Character } from "../types";

export const BACKUP_FILE_TYPE = "whatsgemini-backup";
export const BACKUP_FILE_VERSION = 1;
export const BACKUP_ZIP_JSON_ENTRY = "backup.json";
export const BACKUP_ZIP_IMAGES_DIR = "images";

export interface BackupData {
  type: typeof BACKUP_FILE_TYPE;
  version: typeof BACKUP_FILE_VERSION;
  exportedAt: number;
  chats: Chat[];
  characters: Character[];
}

export const getFullBackupData = async (): Promise<BackupData> => {
  const [chats, characters] = await Promise.all([
    dbService.getAllChats(),
    dbService.getAllCharacters(),
  ]);
  return {
    type: BACKUP_FILE_TYPE,
    version: BACKUP_FILE_VERSION,
    exportedAt: Date.now(),
    chats,
    characters,
  };
};

// Restores chats and characters as new records - never overwrites or collides
// with anything already in the database, so it's safe to run against a browser
// that already has data (or to import the same backup twice). Characters are
// restored first and their old->new id remapped, so restored chats keep
// pointing at the right (newly assigned) character.
export const restoreChatsAndCharacters = async (
  chats: Chat[],
  characters: Character[]
): Promise<{ chatsRestored: number; charactersRestored: number }> => {
  const idMap = new Map<number, number>();

  for (const character of characters) {
    const { id: oldId, ...rest } = character;
    const newId = await dbService.addCharacter(rest);
    if (oldId != null) idMap.set(oldId, newId);
  }

  let chatsRestored = 0;
  for (const chat of chats) {
    // Accepts a pre-migration backup (`characterId` scalar) alongside the
    // current `characterIds` array shape - a backup zip made before Phase 11
    // restored on a build after it shouldn't lose its character links.
    const { id, characterId, characterIds, ...rest } = chat as Chat & { characterId?: number | null };
    const sourceIds = Array.isArray(characterIds) ? characterIds : (characterId != null ? [characterId] : []);
    const remappedCharacterIds = sourceIds.map((cid) => idMap.get(cid)).filter((cid): cid is number => cid != null);
    await dbService.addChat({ ...rest, characterIds: remappedCharacterIds });
    chatsRestored++;
  }

  return { chatsRestored, charactersRestored: characters.length };
};

const LOCAL_IMAGE_PREFIX = "local:";

// Walks message.images / character.avatar / character.appearanceImages / character.gallery
// and collects the bare filenames behind every `local:<filename>` reference.
const collectLocalImageFilenames = (chats: Chat[], characters: Character[]): string[] => {
  const filenames = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === "string") {
      if (value.startsWith(LOCAL_IMAGE_PREFIX)) filenames.add(value.substring(LOCAL_IMAGE_PREFIX.length));
    } else if (Array.isArray(value)) {
      value.forEach(collect);
    }
  };

  for (const chat of chats) {
    for (const message of chat.content) collect(message.images);
  }
  for (const character of characters) {
    collect(character.avatar);
    collect(character.appearanceImages);
    collect(character.gallery);
  }

  return Array.from(filenames);
};

// Bundles chats, characters, and settings alongside the actual bytes of every
// locally-stored image they reference, so restoring on another browser/profile
// doesn't leave `local:` references pointing at nothing. Images that can't be
// read (moved, deleted, or no save directory configured) are silently skipped -
// the JSON portion of the backup still restores fine without them.
export const getFullBackupZip = async (
  settings: unknown
): Promise<{ blob: Blob; chats: Chat[]; characters: Character[]; imagesIncluded: number; imagesSkipped: number }> => {
  const backupData = await getFullBackupData();
  const filenames = collectLocalImageFilenames(backupData.chats, backupData.characters);

  const zip = new JSZip();
  zip.file(BACKUP_ZIP_JSON_ENTRY, JSON.stringify({ ...backupData, settings }, null, 2));

  let imagesIncluded = 0;
  let imagesSkipped = 0;
  if (filenames.length > 0) {
    const dirHandle = await dbService.getSetting("image_save_directory");
    const imagesFolder = zip.folder(BACKUP_ZIP_IMAGES_DIR)!;
    for (const filename of filenames) {
      try {
        const fileHandle = await dirHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        imagesFolder.file(filename, file);
        imagesIncluded++;
      } catch (e) {
        console.warn(`Backup: skipping unreadable local image "${filename}"`, e);
        imagesSkipped++;
      }
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, chats: backupData.chats, characters: backupData.characters, imagesIncluded, imagesSkipped };
};

export interface ParsedBackup {
  data: BackupData & { settings?: unknown };
  imageFilenames: string[];
  zip?: JSZip;
}

// Reads either a full-backup zip (new format, may bundle images) or a legacy
// full-backup .json (chats/characters/settings only) into a common shape.
export const parseBackupFile = async (file: File): Promise<ParsedBackup> => {
  const isZip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";

  if (isZip) {
    const zip = await JSZip.loadAsync(file);
    const jsonEntry = zip.file(BACKUP_ZIP_JSON_ENTRY);
    if (!jsonEntry) throw new Error("Backup zip is missing backup.json");

    const data = JSON.parse(await jsonEntry.async("string"));
    if (data.type !== BACKUP_FILE_TYPE || !Array.isArray(data.chats) || !Array.isArray(data.characters)) {
      throw new Error("Not a WhatsGemini backup file");
    }

    const imageFilenames: string[] = [];
    zip.folder(BACKUP_ZIP_IMAGES_DIR)?.forEach((relativePath, entry) => {
      if (!entry.dir) imageFilenames.push(relativePath);
    });

    return { data, imageFilenames, zip };
  }

  const data = JSON.parse(await file.text());
  if (data.type !== BACKUP_FILE_TYPE || !Array.isArray(data.chats) || !Array.isArray(data.characters)) {
    throw new Error("Not a WhatsGemini backup file");
  }
  return { data, imageFilenames: [] };
};

// Restores chats/characters, then (for zip backups, when a save directory is
// currently configured) writes bundled images back to disk so `local:`
// references resolve again. Per-image failures are logged and skipped rather
// than failing the whole restore.
export const applyParsedBackup = async (
  parsed: ParsedBackup
): Promise<{ chatsRestored: number; charactersRestored: number; imagesRestored: number }> => {
  const { chatsRestored, charactersRestored } = await restoreChatsAndCharacters(parsed.data.chats, parsed.data.characters);

  let imagesRestored = 0;
  if (parsed.zip && parsed.imageFilenames.length > 0) {
    const dirHandle = await dbService.getSetting("image_save_directory");
    if (dirHandle) {
      const imagesFolder = parsed.zip.folder(BACKUP_ZIP_IMAGES_DIR);
      for (const filename of parsed.imageFilenames) {
        try {
          const entry = imagesFolder?.file(filename);
          if (!entry) continue;
          const arrayBuffer = await entry.async("arraybuffer");
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(arrayBuffer);
          await writable.close();
          imagesRestored++;
        } catch (e) {
          console.warn(`Restore: failed to write local image "${filename}"`, e);
        }
      }
    }
  }

  return { chatsRestored, charactersRestored, imagesRestored };
};
