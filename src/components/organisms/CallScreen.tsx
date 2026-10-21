import React from "react";
import { FaMicrophone, FaMicrophoneSlash, FaPhoneSlash } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { CallState } from "src/features/voice/useCall";
import { callStatusText, formatCallTime } from "src/features/voice/callSession";

interface CallScreenProps {
  name: string;
  initials: string;
  accent?: [string, string];
  imageSrc?: string;
  call: CallState;
  onEnd: () => void;
}

// The call screen (#56): who you're talking to, how long, what's happening,
// and mute and hang up. The conversation itself is saved in the chat as
// voice messages underneath.
const CallScreen: React.FC<CallScreenProps> = ({ name, initials, accent, imageSrc, call, onEnd }) => (
  <div role="dialog" aria-modal="true" aria-label={`Call with ${name}`} className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-background px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))]">
    <div className="flex flex-col items-center gap-3 text-center">
      <div className={cn("rounded-full p-1.5 transition-shadow", call.phase === "speaking" && "ring-4 ring-primary/50 animate-pulse")}>
        <CharacterAvatar name={initials} accent={accent} imageSrc={imageSrc} size={112} className="text-3xl" />
      </div>
      <div className="text-2xl font-semibold text-foreground">{name}</div>
      <div className="font-mono text-sm tabular-nums text-muted-foreground" aria-label="Call length">{formatCallTime(call.seconds)}</div>
      <div role="status" className="text-sm text-foreground">{callStatusText(call.phase, name)}</div>
      {call.heard && call.phase === "listening" && <p className="max-w-sm text-sm italic text-muted-foreground">"{call.heard}"</p>}
      {call.error && <p role="alert" className="max-w-sm text-xs text-destructive">{call.error}</p>}
    </div>

    <div className="flex items-center gap-8">
      <button
        type="button"
        onClick={() => call.setMuted(!call.muted)}
        disabled={call.phase === "unavailable"}
        aria-pressed={call.muted}
        aria-label={call.muted ? "Unmute" : "Mute"}
        className={cn("flex h-16 w-16 items-center justify-center rounded-full border border-border disabled:opacity-40", call.muted ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-secondary")}
      >
        {call.muted ? <FaMicrophoneSlash size={22} /> : <FaMicrophone size={22} />}
      </button>
      <button type="button" onClick={onEnd} aria-label="End call" className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:opacity-90">
        <FaPhoneSlash size={22} />
      </button>
    </div>
  </div>
);

export default CallScreen;
