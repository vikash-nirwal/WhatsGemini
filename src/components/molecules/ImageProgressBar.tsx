import React, { useEffect, useState } from "react";
import { ImageProgress, imageProgress, watchImageProgress } from "src/features/ai/imageProgress";

// The bar above the message box while a reply's picture is drawn
// (2026-11-19). ComfyUI says where the picture is in its queue and which
// step its sampler is on; other image services only say they're drawing, so
// the bar just moves.
const ImageProgressBar: React.FC<{ chatId: number | null | undefined }> = ({ chatId }) => {
  const [progress, setProgress] = useState<ImageProgress | null>(imageProgress());
  useEffect(() => watchImageProgress(setProgress), []);
  if (!progress || progress.chatId !== chatId) return null;

  const { queueAhead, step, steps, stage } = progress;
  const known = Boolean(steps && step != null);
  const percent = known ? Math.min(100, Math.round(((step || 0) / (steps || 1)) * 100)) : undefined;
  const label = queueAhead
    ? `Waiting in ComfyUI's queue (${queueAhead} ahead)`
    : known
      ? `Drawing the picture${stage && stage > 1 ? `, stage ${stage}` : ""}: step ${step} of ${steps}`
      : "Drawing the picture...";

  return (
    <div data-slot="image-progress" className="mb-2 rounded-[10px] bg-surface px-3 py-2 shadow-popover ring-1 ring-inset ring-border">
      <div className="mb-1.5 text-[12.5px] text-muted-foreground" aria-live="polite">{label}</div>
      <div
        role="progressbar"
        aria-label="Picture progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
      >
        {percent != null ? (
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/70" />
        )}
      </div>
    </div>
  );
};

export default ImageProgressBar;
