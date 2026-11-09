import type { Message } from "src/types";
import type { SaveImageSettings } from "./hostBridge";

// What's known of how a chat or adventure picture was made, for the host's
// library (#264): only the fields the message kept.
export const imageSettingsOf = (msg: Pick<Message, "imageParams" | "sampler_name">): SaveImageSettings => {
  const p = msg.imageParams || {};
  const out: SaveImageSettings = {};
  if (typeof p.seed === "number") out.seed = p.seed;
  if (typeof p.steps === "number") out.steps = p.steps;
  if (typeof p.cfg_scale === "number") out.cfg = p.cfg_scale;
  const sampler = p.sampler_name || msg.sampler_name;
  if (sampler) out.sampler = sampler;
  if (typeof p.width === "number") out.width = p.width;
  if (typeof p.height === "number") out.height = p.height;
  return out;
};

// The message a fullscreen picture belongs to, when it was generated (not
// sent by you).
export const generatedMessageFor = (messages: Message[] | undefined, src: string | null, you: string): Message | undefined =>
  src ? messages?.find((m) => m.role !== you && m.images?.includes(src)) : undefined;
