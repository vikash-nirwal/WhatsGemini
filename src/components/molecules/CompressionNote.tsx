import React, { useEffect, useState } from "react";
import { isCompressing, watchCompressions } from "src/features/chat/backgroundCompression";

// A quiet line above the message box while the chat's older messages are
// summarised in the background (2026-11-20). Nothing waits on it: you can
// keep reading, typing and sending, so it's a line of small text, not a bar.
const CompressionNote: React.FC<{ chatId: number | null | undefined }> = ({ chatId }) => {
  const [running, setRunning] = useState(() => isCompressing(chatId));
  useEffect(() => {
    setRunning(isCompressing(chatId));
    return watchCompressions(() => setRunning(isCompressing(chatId)));
  }, [chatId]);
  if (!running) return null;

  return (
    <div data-slot="compression-note" role="status" className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] text-muted-foreground">
      <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70" />
      Summarising older messages in the background…
    </div>
  );
};

export default CompressionNote;
