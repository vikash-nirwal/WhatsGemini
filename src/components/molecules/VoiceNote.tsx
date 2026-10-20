import React, { useEffect, useMemo, useState } from "react";
import { FaMicrophone, FaPlay, FaStop } from "react-icons/fa";
import { cn } from "../../utils/cn";
import { CharacterVoice } from "../../types";
import MarkdownRenderer from "./MarkdownRenderer";
import { TermLink } from "../atoms/TermLink";
import { estimateSpeechSeconds, formatDuration, isSpeechSupported, speak, speakingProgress, stopSpeaking, toSpokenText } from "../../features/voice/speech";
import { useSpeakingFor } from "../../features/voice/useSpeech";
import { waveformBars } from "../../features/voice/voiceNotes";

interface VoiceNoteProps {
  id: string; // the message id: what's playing, and the waveform's shape
  text: string;
  voice?: CharacterVoice;
  isUser?: boolean;
  terminal?: boolean;
}

// A voice note (#44): a play button, a waveform that fills as it plays, its
// length, and the transcript behind a toggle. It's spoken with the voice at
// play time; where the browser can't speak, the transcript shows instead.
export const VoiceNote: React.FC<VoiceNoteProps> = ({ id, text, voice, isUser = false, terminal = false }) => {
  const supported = isSpeechSupported();
  const spoken = useMemo(() => toSpokenText(text), [text]);
  const seconds = estimateSpeechSeconds(spoken, voice?.rate);
  const bars = useMemo(() => waveformBars(id), [id]);
  const playing = useSpeakingFor(id);
  const [showTranscript, setShowTranscript] = useState(!supported);

  // Redraws the waveform while playing; the speech events alone come too
  // seldom (or never, for voices without word boundaries) to look smooth.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 150);
    return () => window.clearInterval(timer);
  }, [playing]);
  const progress = playing ? speakingProgress(playing, Math.max(now, playing.startedAt)) : 0;
  const elapsed = playing ? Math.min(seconds, Math.floor((Math.max(now, playing.startedAt) - playing.startedAt) / 1000)) : 0;

  const toggle = () => {
    if (playing) stopSpeaking();
    else speak(id, spoken, voice);
  };
  const transcriptLabel = showTranscript ? "Hide transcript" : "Show transcript";
  const duration = formatDuration(playing ? elapsed : seconds);

  if (terminal) {
    return (
      <div data-slot="voice-note" role="group" aria-label={`Voice note, ${formatDuration(seconds)}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span># voice note {formatDuration(seconds)}</span>
          {supported && <TermLink label={playing ? `stop ${duration}` : "play"} onClick={toggle} aria-label={playing ? "Stop voice note" : "Play voice note"} />}
          <TermLink label={showTranscript ? "hide" : "transcript"} onClick={() => setShowTranscript((v) => !v)} aria-label={transcriptLabel} aria-expanded={showTranscript} />
        </div>
        {showTranscript && (
          <div className="mt-1">
            <MarkdownRenderer msgText={text} isUser={isUser} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-slot="voice-note" role="group" aria-label={`Voice note, ${formatDuration(seconds)}`} className="font-sans min-w-[220px] max-w-[320px]">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={!supported}
          aria-label={playing ? "Stop voice note" : "Play voice note"}
          title={supported ? undefined : "This browser can't play voice notes"}
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
            "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {playing ? <FaStop size={12} /> : <FaPlay size={13} className="translate-x-[1px]" />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div aria-hidden className="flex h-7 items-center gap-[2px]">
            {bars.map((h, i) => (
              <span
                key={i}
                className={cn("w-[3px] flex-1 rounded-full transition-colors", (i + 0.5) / bars.length <= progress ? "bg-primary" : "bg-foreground/25")}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] text-subtle">
            <span className="tabular-nums" aria-hidden>{duration}</span>
            <span className="flex items-center gap-1" aria-hidden><FaMicrophone size={9} /> Voice note</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowTranscript((v) => !v)}
        aria-expanded={showTranscript}
        // Your own notes sit on a primary-tinted bubble, where primary text
        // would lose contrast.
        className={cn("mt-1.5 text-[12px] font-medium hover:underline", isUser ? "text-foreground underline" : "text-primary")}
      >
        {transcriptLabel}
      </button>
      {!supported && <p className="text-[11.5px] text-subtle">This browser can't play voice notes aloud.</p>}
      {showTranscript && (
        <div className="mt-1.5 font-serif">
          <MarkdownRenderer msgText={text} isUser={isUser} />
        </div>
      )}
    </div>
  );
};
