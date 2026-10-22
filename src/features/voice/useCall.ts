import { useCallback, useEffect, useRef, useState } from "react";
import { CharacterVoice } from "../../types";
import { isRecognitionSupported, RecognitionSession, startRecognition } from "./recognition";
import { getSpeakingState, isSpeechSupported, speak, stopSpeaking, subscribeSpeaking, toSpokenText } from "./speech";
import { CALL_SILENCE_MS, CallPhase } from "./callSession";

interface UseCallOptions {
  active: boolean;
  onSend: (text: string) => void; // sends what the user said, as a voice message
  aiLoading: boolean;
  lastReply?: { id?: string; txt?: string; emotion?: string }; // the newest character message (its mood shapes the voice, #76)
  voice?: CharacterVoice;
}

export interface CallState {
  phase: CallPhase;
  heard: string; // what the microphone is picking up right now
  seconds: number;
  error: string | null;
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

// Runs a phone call's listen, send, speak loop (#56) while `active`.
export const useCall = ({ active, onSend, aiLoading, lastReply, voice }: UseCallOptions): CallState => {
  const supported = isRecognitionSupported() && isSpeechSupported();
  const [phase, setPhase] = useState<CallPhase>(supported ? "listening" : "unavailable");
  const [heard, setHeard] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);

  const activeRef = useRef(active);
  activeRef.current = active;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;
  const sessionRef = useRef<RecognitionSession | null>(null);
  const silenceRef = useRef<number | null>(null);
  // The reply that was newest when the user finished talking, and whether
  // that turn's reply has started generating.
  const replyBeforeRef = useRef<string | undefined>(undefined);
  const sawLoadingRef = useRef(false);
  const lastReplyRef = useRef(lastReply);
  lastReplyRef.current = lastReply;

  const clearSilence = () => {
    if (silenceRef.current != null) window.clearTimeout(silenceRef.current);
    silenceRef.current = null;
  };

  const listen = useCallback(() => {
    if (!activeRef.current) return;
    if (mutedRef.current) {
      setPhase("muted");
      return;
    }
    setHeard("");
    setPhase("listening");
    const session = startRecognition({
      onUpdate: (final, interim) => {
        setHeard([final, interim].filter(Boolean).join(" "));
        // A pause after some finished words ends the turn.
        clearSilence();
        if (final.trim()) silenceRef.current = window.setTimeout(() => sessionRef.current?.stop(), CALL_SILENCE_MS);
      },
      onEnd: (text, err) => {
        clearSilence();
        sessionRef.current = null;
        if (!activeRef.current || mutedRef.current) return;
        if (text.trim()) {
          replyBeforeRef.current = lastReplyRef.current?.id;
          sawLoadingRef.current = false;
          setPhase("thinking");
          onSendRef.current(text.trim());
          return;
        }
        if (err) setError(err);
        // Nothing heard (or the browser stopped listening on its own): keep
        // the line open.
        window.setTimeout(() => listen(), 300);
      },
    });
    sessionRef.current = session;
    if (!session) {
      setPhase("unavailable");
      setError("The microphone couldn't start. Check that this site may use it.");
    }
  }, []);

  // Start and end of the call.
  useEffect(() => {
    if (!active) return;
    setSeconds(0);
    setError(null);
    if (!supported) {
      setPhase("unavailable");
      return;
    }
    listen();
    const tick = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      window.clearInterval(tick);
      clearSilence();
      sessionRef.current?.abort();
      sessionRef.current = null;
      stopSpeaking();
    };
  }, [active, supported, listen]);

  // The reply arrives: say it, or go back to listening if none came.
  useEffect(() => {
    if (!active || phase !== "thinking") return;
    if (aiLoading) {
      sawLoadingRef.current = true;
      return;
    }
    const reply = lastReplyRef.current;
    if (reply?.id && reply.id !== replyBeforeRef.current) {
      const key = `call-${reply.id}`;
      if (speak(key, toSpokenText(reply.txt || ""), voice, undefined, reply.emotion)) setPhase("speaking");
      else listen();
    } else if (sawLoadingRef.current) {
      // Loading can end a moment before the new message reaches the list,
      // so only give up if it still hasn't come after a short wait.
      const giveUp = window.setTimeout(() => {
        setError("No reply came back. Keep talking, or end the call.");
        listen();
      }, 2000);
      return () => window.clearTimeout(giveUp);
    }
  }, [active, phase, aiLoading, lastReply?.id, voice, listen]);

  // Done talking: listen again.
  useEffect(() => {
    if (!active || phase !== "speaking") return;
    return subscribeSpeaking(() => {
      if (!getSpeakingState()) listen();
    });
  }, [active, phase, listen]);

  const setMuted = useCallback(
    (value: boolean) => {
      setMutedState(value);
      mutedRef.current = value;
      if (value) {
        clearSilence();
        sessionRef.current?.abort();
        sessionRef.current = null;
        if (phase === "listening") setPhase("muted");
      } else if (phase === "muted") {
        listen();
      }
    },
    [phase, listen]
  );

  return { phase, heard, seconds, error, muted, setMuted };
};
