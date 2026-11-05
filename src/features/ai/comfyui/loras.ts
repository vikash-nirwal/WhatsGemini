import { LocalImageSettings } from "../../../types";
import { listInputOptions, normalizeServerUrl } from "./client";

// A character's LoRA in ComfyUI (the user's request, 2026-11-05). With no
// LoRA picked, the one named after their first name in lowercase ("mira"
// for Mira Voss) is used when ComfyUI has it, so a LoRA trained per
// character works without setting anything. The editor lists the LoRAs
// ComfyUI has to pick from, or "None" to draw without one.

const EXTENSION = /\.(safetensors|pt|ckpt)$/i;

// "characters/Mira.safetensors" → "mira": what a LoRA is matched by.
export const loraBaseName = (file: string): string => (file.split(/[\\/]/).pop() || "").replace(EXTENSION, "").trim().toLowerCase();

// The name a character's LoRA has by default.
export const defaultLoraName = (characterName?: string): string | undefined => characterName?.trim().split(/\s+/)[0]?.toLowerCase() || undefined;

// The installed file for a name, in whatever folder ComfyUI keeps it.
export const findLora = (available: string[], name: string): string | undefined => {
  const wanted = loraBaseName(name);
  return wanted ? available.find((f) => f === name) || available.find((f) => loraBaseName(f) === wanted) : undefined;
};

// ComfyUI's loaders want the file name with its extension.
export const loraFileName = (name: string): string => (EXTENSION.test(name) ? name : `${name}.safetensors`);

// The LoRA file to load for this character, if any: the one picked (as
// ComfyUI names it when it's found, so one in a subfolder still loads), or
// the first-name one only when it's installed, since a missing file stops
// ComfyUI from drawing at all.
export const characterLoraFile = (settings: LocalImageSettings | undefined, characterName: string | undefined, available: string[]): string | undefined => {
  if (settings?.noLora) return undefined;
  const picked = settings?.loraName?.trim();
  if (picked) return findLora(available, picked) || loraFileName(picked);
  const first = defaultLoraName(characterName);
  return first ? findLora(available, first) : undefined;
};

// The LoRAs ComfyUI has, from its LoRA loader's list. Asked once a minute
// at most per server, since every picture needs it; an unreachable server
// gives an empty list, and the picture fails on its own with a clear error.
const LIST_TTL_MS = 60_000;
let cached: { url: string; at: number; list: Promise<string[]> } | undefined;

export const listLoras = (serverUrl: string, { fresh = false, signal }: { fresh?: boolean; signal?: AbortSignal } = {}): Promise<string[]> => {
  const url = normalizeServerUrl(serverUrl);
  if (!fresh && cached && cached.url === url && Date.now() - cached.at < LIST_TTL_MS) return cached.list;
  const list = listInputOptions(url, "LoraLoader", "lora_name", signal).catch(() => [] as string[]);
  cached = { url, at: Date.now(), list };
  return list;
};

export const forgetLoraList = () => {
  cached = undefined;
};
