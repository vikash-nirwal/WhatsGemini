import React, { useEffect, useRef, useState } from "react";
import { FaLock } from "react-icons/fa";
import { useAppSelector } from "src/store/hooks";
import { hashPin } from "src/utils/pinLock";
import { Button } from "src/components/atoms/button";
import { Input } from "src/components/atoms/input";
import Logo from "src/components/atoms/Logo";

// Full-screen PIN prompt covering the app on launch and after it has been in
// the background for privacy.lockAfterMinutes. Renders children underneath
// untouched (no unmount), so an in-progress reply keeps streaming while locked.
const AppLock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const privacy = useAppSelector((state) => state.settings.privacy);
  const enabled = Boolean(privacy.pinHash && privacy.pinSalt);
  const [locked, setLocked] = useState(enabled);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const hiddenAtRef = useRef<number | null>(null);

  // Turning the lock on in Settings shouldn't lock the user out mid-session;
  // it takes effect on the next launch or background timeout.
  useEffect(() => {
    if (!enabled) setLocked(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current != null) {
        if (Date.now() - hiddenAtRef.current >= privacy.lockAfterMinutes * 60_000) setLocked(true);
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, privacy.lockAfterMinutes]);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privacy.pinHash || !privacy.pinSalt || !pin) return;
    setChecking(true);
    try {
      if ((await hashPin(pin, privacy.pinSalt)) === privacy.pinHash) {
        setLocked(false);
        setError(null);
      } else {
        setError("Wrong PIN.");
      }
    } finally {
      setPin("");
      setChecking(false);
    }
  };

  return (
    <>
      {children}
      {locked && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background p-4">
          <form onSubmit={unlock} className="w-full max-w-[320px] flex flex-col items-center gap-4 text-center">
            <Logo />
            <div className="flex items-center gap-2 text-foreground font-semibold"><FaLock size={13} /> Locked</div>
            <Input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              aria-label="PIN"
              className="text-center tracking-[0.3em]"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={checking || !pin}>{checking ? "Checking..." : "Unlock"}</Button>
            <p className="text-[11px] text-subtle">
              Forgot it? Clearing this site's data in your browser removes the lock, and also deletes your chats and characters. Export a backup first if you can.
            </p>
          </form>
        </div>
      )}
    </>
  );
};

export default AppLock;
