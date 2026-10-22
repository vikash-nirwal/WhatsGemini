import { useEffect, useRef } from "react";
import { AmbientPlayer, AmbientSound, DEFAULT_AMBIENT_VOLUME } from "../../features/chat/ambientSound";

// Ambient sound (#89): plays what the chat wants (see ambientFor), fading
// between sounds, and stops when it's off or the chat closes. Browsers start
// audio suspended, so the first tap or key press resumes it. While playing,
// <html data-ambient="..."> says what, which the UI tests check.
export const useAmbientSound = (sound: AmbientSound | undefined, volume = DEFAULT_AMBIENT_VOLUME) => {
  const playerRef = useRef<AmbientPlayer | null>(null);

  useEffect(() => {
    if (!sound) {
      playerRef.current?.stop();
      delete document.documentElement.dataset.ambient;
      return;
    }
    if (!playerRef.current) playerRef.current = new AmbientPlayer();
    playerRef.current.setVolume(volume);
    playerRef.current.play(sound);
    document.documentElement.dataset.ambient = sound;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound]);

  useEffect(() => {
    playerRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const resume = () => playerRef.current?.resume();
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      playerRef.current?.close();
      playerRef.current = null;
      delete document.documentElement.dataset.ambient;
    };
  }, []);
};
