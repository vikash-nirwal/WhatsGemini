import { useEffect } from "react";
import { toast } from "sonner";
import { onWebLLMProgress } from "src/features/ai/providers/webllmAdapter";

// Shows the in-browser model's first-time download (#55) as one toast that
// updates as it goes; later loads come from the browser's cache and are
// quick, so the toast barely flashes then.
const TOAST_ID = "webllm-progress";

const WebLLMProgress = () => {
  useEffect(
    () =>
      onWebLLMProgress((p) => {
        if (p.done) {
          if (p.text === "Failed") toast.dismiss(TOAST_ID);
          else toast.success(`${p.model.replace(/-q4f16_1-MLC$/, "")} is ready on this device.`, { id: TOAST_ID, duration: 2500 });
          return;
        }
        toast.loading(`Loading the in-browser model: ${Math.round(p.progress * 100)}%`, { id: TOAST_ID, description: p.text.slice(0, 120) });
      }),
    []
  );
  return null;
};

export default WebLLMProgress;
