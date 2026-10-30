import React from "react";
import { TextInput } from "src/components/molecules/form-controls";
import { WORLD_LANGUAGE_PRESETS } from "src/features/world/worldVoice";

// The world's language and reply length (2026-10-30), shared by the world
// wizard and the world editor.
export const WorldVoiceFields = ({ idPrefix, language, onLanguage, replyLength, onReplyLength }: {
  idPrefix: string;
  language: string;
  onLanguage: (value: string) => void;
  replyLength: number;
  onReplyLength: (value: number) => void;
}) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${idPrefix}-language`} className="text-sm font-medium text-foreground">Language</label>
      <TextInput id={`${idPrefix}-language`} list={`${idPrefix}-languages`} value={language} onChange={(e) => onLanguage(e.target.value)} placeholder="Same as each chat" />
      <datalist id={`${idPrefix}-languages`}>{WORLD_LANGUAGE_PRESETS.map((l) => <option key={l} value={l} />)}</datalist>
      <p className="text-xs text-subtle">Everyone here talks and texts in it, in your chats and their own.</p>
    </div>
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${idPrefix}-reply-length`} className="text-sm font-medium text-foreground">Reply length</label>
      <TextInput id={`${idPrefix}-reply-length`} type="number" min="0" step="50" value={replyLength || ""} onChange={(e) => onReplyLength(Math.max(0, Number(e.target.value) || 0))} placeholder="Same as Settings" />
      <p className="text-xs text-subtle">Characters per reply in chats here. Empty uses Settings › Text model.</p>
    </div>
  </div>
);
