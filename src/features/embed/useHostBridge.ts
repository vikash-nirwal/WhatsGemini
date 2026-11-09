import { useEffect, useSyncExternalStore } from "react";
import { hostBridge } from "./hostBridge";

// Whether the host's panic or lock has put the blank cover up (#264).
export const useHostCovered = () => useSyncExternalStore(hostBridge.subscribe, () => hostBridge.isCovered, () => false);

// Tells the host the screen's title, for its own bar; only plain-text titles.
export const useHostTitle = (title: unknown) => {
  useEffect(() => {
    if (typeof title === "string") hostBridge.sendTitle(title);
  }, [title]);
};
