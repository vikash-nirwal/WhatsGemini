// The sync folder (#274): a hidden ".kindred-sync" folder inside the folder
// you pick, which Google Drive for desktop (or any folder-syncing app)
// copies between your computers. The engine only lists, reads, writes and
// removes files in its few subfolders, through this, so tests can use a
// folder in memory.

export const SYNC_DIR = ".kindred-sync";

export interface FolderEntry {
  name: string;
  modified: number;
}

export interface SyncFolder {
  list(dir: string): Promise<FolderEntry[]>;
  // Only the names: cheaper, for folders whose files never change.
  names(dir: string): Promise<string[]>;
  read(dir: string, name: string): Promise<Uint8Array | undefined>;
  // The file's modified time after writing, so it isn't read back as new.
  write(dir: string, name: string, data: Uint8Array): Promise<number>;
  remove(dir: string, name: string): Promise<void>;
}

// The top of the sync folder is "" (its header file lives there).
const subfolder = async (root: FileSystemDirectoryHandle, dir: string, create: boolean): Promise<FileSystemDirectoryHandle | undefined> => {
  try {
    return dir ? await root.getDirectoryHandle(dir, { create }) : root;
  } catch {
    return undefined;
  }
};

export const openSyncRoot = async (picked: FileSystemDirectoryHandle, create: boolean): Promise<FileSystemDirectoryHandle | undefined> => {
  try {
    return await picked.getDirectoryHandle(SYNC_DIR, { create });
  } catch {
    return undefined;
  }
};

export const handleFolder = (root: FileSystemDirectoryHandle): SyncFolder => ({
  async list(dir) {
    const folder = await subfolder(root, dir, false);
    if (!folder) return [];
    const out: FolderEntry[] = [];
    for await (const [name, handle] of (folder as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      // Drive's own temporary files and Chrome's half-written swap files
      // aren't ours.
      if (handle.kind !== "file" || !name.endsWith(".kbin")) continue;
      try {
        out.push({ name, modified: (await (handle as FileSystemFileHandle).getFile()).lastModified });
      } catch {
        // A file Drive is still downloading or just removed: next time.
      }
    }
    return out;
  },
  async names(dir) {
    const folder = await subfolder(root, dir, false);
    if (!folder) return [];
    const out: string[] = [];
    for await (const [name, handle] of (folder as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind === "file" && name.endsWith(".kbin")) out.push(name);
    }
    return out;
  },
  async read(dir, name) {
    const folder = await subfolder(root, dir, false);
    if (!folder) return undefined;
    try {
      const file = await (await folder.getFileHandle(name)).getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      return undefined;
    }
  },
  async write(dir, name, data) {
    const folder = (await subfolder(root, dir, true))!;
    const handle = await folder.getFileHandle(name, { create: true });
    const writable = await (handle as any).createWritable();
    await writable.write(data);
    await writable.close();
    return (await handle.getFile()).lastModified;
  },
  async remove(dir, name) {
    const folder = await subfolder(root, dir, false);
    try {
      await folder?.removeEntry(name);
    } catch {
      // Already gone.
    }
  },
});

// A folder in memory, shared by "computers" in tests. `copy` makes a second
// view of the same files, as Drive gives each computer.
export const memoryFolder = (files: Map<string, { data: Uint8Array; modified: number }> = new Map()) => {
  let clock = 1;
  const path = (dir: string, name: string) => `${dir}/${name}`;
  const folder: SyncFolder & { files: typeof files } = {
    files,
    async list(dir) {
      return Array.from(files.entries())
        .filter(([p]) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/"))
        .map(([p, f]) => ({ name: p.slice(dir.length + 1), modified: f.modified }));
    },
    async names(dir) {
      return (await folder.list(dir)).map((e) => e.name);
    },
    async read(dir, name) {
      return files.get(path(dir, name))?.data;
    },
    async write(dir, name, data) {
      const modified = Date.now() * 1000 + clock++;
      files.set(path(dir, name), { data, modified });
      return modified;
    },
    async remove(dir, name) {
      files.delete(path(dir, name));
    },
  };
  return folder;
};
