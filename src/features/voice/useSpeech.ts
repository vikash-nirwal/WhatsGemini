import { useEffect, useState, useSyncExternalStore } from "react";
import { getSpeakingState, getSynth, subscribeSpeaking, SpeakingState } from "./speech";

// The browser's voices. They load asynchronously (Chrome fills the list only
// after `voiceschanged`), and some browsers never fire that event, so after
// a short wait `loaded` turns true anyway and an empty list means there
// really are none.
const VOICES_WAIT_MS = 1500;

export const useVoices = (): { voices: SpeechSynthesisVoice[]; loaded: boolean } => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => getSynth()?.getVoices() ?? []);
  const [loaded, setLoaded] = useState(() => voices.length > 0 || !getSynth());

  useEffect(() => {
    const synth = getSynth();
    if (!synth) return;
    const update = () => {
      const list = synth.getVoices();
      setVoices(list);
      if (list.length > 0) setLoaded(true);
    };
    update();
    // Older Safari's speechSynthesis isn't an EventTarget, only has the
    // onvoiceschanged property.
    const canListen = typeof synth.addEventListener === "function";
    if (canListen) synth.addEventListener("voiceschanged", update);
    else synth.onvoiceschanged = update;
    const timer = window.setTimeout(() => {
      update();
      setLoaded(true);
    }, VOICES_WAIT_MS);
    return () => {
      window.clearTimeout(timer);
      if (canListen) synth.removeEventListener("voiceschanged", update);
      else if (synth.onvoiceschanged === update) synth.onvoiceschanged = null;
    };
  }, []);

  return { voices, loaded };
};

// The playing state when `key` is what's speaking (see speak in speech.ts),
// else null. Only that one item re-renders as speech moves on, not every
// message in the chat.
export const useSpeakingFor = (key: string | undefined): SpeakingState | null => {
  const get = () => {
    const s = getSpeakingState();
    return key && s?.key === key ? s : null;
  };
  return useSyncExternalStore(subscribeSpeaking, get, get);
};
