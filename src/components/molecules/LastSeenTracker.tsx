import { useEffect } from "react";
import { awaySession, saveLastSeen } from "src/features/life/away";

// Keeps "last seen" (#130) up to date while the app is open: every minute
// and when the page is hidden or closed. Reads the previous one first.
const LastSeenTracker = () => {
  useEffect(() => {
    awaySession();
    const save = () => saveLastSeen();
    const onHide = () => document.visibilityState === "hidden" && save();
    const timer = window.setInterval(save, 60_000);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
    };
  }, []);
  return null;
};

export default LastSeenTracker;
