import React, { useMemo } from "react";
import { FaChevronRight, FaPlay, FaStop } from "react-icons/fa";
import { Select } from "src/components/molecules/form-controls";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { Button } from "src/components/atoms/button";
import { CharacterVoice, VoiceNoteFrequency } from "src/types";
import { DEFAULT_PITCH, DEFAULT_RATE, isSpeechSupported, speak, stopSpeaking } from "src/features/voice/speech";
import { useSpeakingFor, useVoices } from "src/features/voice/useSpeech";

interface VoiceSectionProps {
  name: string;
  value: CharacterVoice | undefined;
  onChange: (value: CharacterVoice | undefined) => void;
}

const PREVIEW_KEY = "voice-preview";

const VOICE_NOTE_OPTIONS: { value: VoiceNoteFrequency; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "sometimes", label: "Sometimes" },
  { value: "often", label: "Often" },
];

// Drops a voice that's all defaults, so characters nobody gave a voice don't
// carry an empty object around.
export const cleanVoice = (voice: CharacterVoice | undefined): CharacterVoice | undefined => {
  if (!voice) return undefined;
  const cleaned: CharacterVoice = {};
  if (voice.voiceURI) {
    cleaned.voiceURI = voice.voiceURI;
    cleaned.voiceName = voice.voiceName;
    cleaned.lang = voice.lang;
  }
  if (voice.rate != null && voice.rate !== DEFAULT_RATE) cleaned.rate = voice.rate;
  if (voice.pitch != null && voice.pitch !== DEFAULT_PITCH) cleaned.pitch = voice.pitch;
  if (voice.voiceNotes && voice.voiceNotes !== "off") cleaned.voiceNotes = voice.voiceNotes;
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
};

// "Voice" (#12, #44): which of the browser's voices reads this character's
// messages aloud, how fast and how high, and how often they send voice
// notes. Collapsed by default, like the model section.
const VoiceSection: React.FC<VoiceSectionProps> = ({ name, value, onChange }) => {
  const supported = isSpeechSupported();
  const { voices, loaded } = useVoices();
  const voice = value || {};
  const rate = voice.rate ?? DEFAULT_RATE;
  const pitch = voice.pitch ?? DEFAULT_PITCH;
  const previewing = Boolean(useSpeakingFor(PREVIEW_KEY));
  const update = (patch: Partial<CharacterVoice>) => onChange({ ...voice, ...patch });

  // The user's own language first, then by name: there can be hundreds.
  const sortedVoices = useMemo(() => {
    const userLang = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase().split("-")[0];
    return [...voices].sort((a, b) => {
      const aMatch = a.lang.toLowerCase().startsWith(userLang) ? 0 : 1;
      const bMatch = b.lang.toLowerCase().startsWith(userLang) ? 0 : 1;
      return aMatch - bMatch || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name);
    });
  }, [voices]);
  // A voice saved on another device isn't in this list; keep it selectable.
  const missingSaved = voice.voiceURI && !voices.some((v) => v.voiceURI === voice.voiceURI);

  const pickVoice = (uri: string) => {
    const chosen = voices.find((v) => v.voiceURI === uri);
    update({ voiceURI: chosen?.voiceURI, voiceName: chosen?.name, lang: chosen?.lang });
  };

  const preview = () => {
    if (previewing) {
      stopSpeaking();
      return;
    }
    speak(PREVIEW_KEY, `Hi, I'm ${name.trim() || "your new character"}. This is how I sound.`, voice, voices);
  };

  const summary = [
    voice.voiceName || "Browser default",
    `voice notes ${voice.voiceNotes && voice.voiceNotes !== "off" ? voice.voiceNotes : "off"}`,
  ].join(", ");

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        Voice
        <span className="text-xs font-normal text-muted-foreground">{summary}</span>
      </summary>

      <div className="mt-4 flex flex-col gap-4 max-w-sm">
        {!supported ? (
          <p className="text-xs text-muted-foreground">
            This browser can't read text aloud, so "Read aloud" and voice notes won't play here. The settings below still apply on your other devices.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Uses your browser's built-in voices: free, and they differ from device to device. Where this voice is missing, the closest one in the same language is used.
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] text-muted-foreground">Voice</span>
          <Select aria-label="Voice" value={voice.voiceURI || ""} onChange={(e) => pickVoice(e.target.value)} disabled={!supported || (loaded && voices.length === 0 && !missingSaved)}>
            <option value="">Browser default</option>
            {missingSaved && <option value={voice.voiceURI}>{`${voice.voiceName || "Saved voice"} (not on this device)`}</option>}
            {sortedVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {`${v.name} (${v.lang})`}
              </option>
            ))}
          </Select>
          {supported && !loaded && <span className="text-xs text-subtle">Loading voices...</span>}
          {supported && loaded && voices.length === 0 && (
            <span className="text-xs text-subtle">No voices found in this browser. It will use its default voice, if it has one.</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between text-[11.5px] text-muted-foreground">
            <span>Speed</span>
            <span className="font-mono">{rate.toFixed(1)}x</span>
          </span>
          <input type="range" aria-label="Speed" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => update({ rate: Number(e.target.value) })} className="w-full accent-primary" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between text-[11.5px] text-muted-foreground">
            <span>Pitch</span>
            <span className="font-mono">{pitch.toFixed(1)}</span>
          </span>
          <input type="range" aria-label="Pitch" min={0} max={2} step={0.1} value={pitch} onChange={(e) => update({ pitch: Number(e.target.value) })} className="w-full accent-primary" />
        </label>

        <div>
          <Button type="button" variant="outline" size="sm" onClick={preview} disabled={!supported}>
            {previewing ? <FaStop size={10} /> : <FaPlay size={10} />} {previewing ? "Stop" : "Preview"}
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span id="voice-notes-label" className="text-[11.5px] text-muted-foreground">Sends voice notes</span>
          <div role="group" aria-labelledby="voice-notes-label">
            <SegmentedControl
              value={voice.voiceNotes || "off"}
              onChange={(v) => update({ voiceNotes: v as VoiceNoteFrequency })}
              options={VOICE_NOTE_OPTIONS}
            />
          </div>
          <p className="text-xs text-subtle">
            Now and then a reply arrives as a voice message, spoken with this voice when you play it. No extra cost: it's the same reply.
          </p>
        </div>
      </div>
    </details>
  );
};

export default VoiceSection;
