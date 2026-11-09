import React from "react";
import { Intensity } from "src/types";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { TagInput } from "src/components/molecules/form-controls/TagInput";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";

export const INTENSITY_OPTIONS = [
  { value: "", label: "Default" },
  { value: "fade", label: "Fade out" },
  { value: "suggestive", label: "Suggestive" },
  { value: "explicit", label: "Explicit" },
];

// What a story may and may not include, on the new story page and in a
// story's Boundaries (#253, #254, #256). The 18+ switch works like a
// character's: it only takes effect when nothing in the story's text
// suggests someone is under 18, and the phrases that do are shown so the
// author can reword them. Intensity only shows once the story is 18+.
// The new story page asks the 18+ question before the story is read
// (#262), so it shows the switch there and leaves it out here.
export const StoryAdultSwitch = ({ adult, onAdult, minorIndicators, hint }: { adult: boolean; onAdult: (adult: boolean) => void; minorIndicators: string[]; hint?: string }) => (
  <div className="flex flex-col gap-1.5">
    <ToggleSwitch checked={adult} onChange={onAdult} label="18+ story: everyone in it is an adult (18 or older)" />
    {adult && minorIndicators.length > 0 ? (
      <p role="alert" className="text-xs text-destructive">
        The story's text suggests someone in it may be under 18 ({minorIndicators.map((p) => `"${p}"`).join(", ")}). It stays SFW until that wording is changed.
      </p>
    ) : (
      <span className="text-xs text-subtle">{hint || (adult ? "Explicit content is allowed when the story and you lead there." : "Off keeps the story non-explicit; intimate scenes fade to black.")}</span>
    )}
  </div>
);

export const StoryContentFields = ({
  showAdult = true,
  adult,
  onAdult,
  minorIndicators,
  intensity,
  onIntensity,
  hardLimits,
  onHardLimits,
  toneDown,
  onToneDown,
}: {
  adult: boolean;
  onAdult: (adult: boolean) => void;
  minorIndicators: string[];
  intensity?: Intensity;
  onIntensity: (intensity: Intensity | undefined) => void;
  hardLimits: string[];
  onHardLimits: (limits: string[]) => void;
  toneDown: string[];
  onToneDown: (items: string[]) => void;
  showAdult?: boolean;
}) => (
  <div className="flex flex-col gap-4">
    {showAdult && <StoryAdultSwitch adult={adult} onAdult={onAdult} minorIndicators={minorIndicators} />}
    {adult && minorIndicators.length === 0 && (
      <div className="flex flex-col gap-1.5">
        <span className="text-[11.5px] text-muted-foreground">Intensity of intimate scenes</span>
        <SegmentedControl aria-label="Intensity" value={intensity || ""} onChange={(v) => onIntensity((v || undefined) as Intensity | undefined)} options={INTENSITY_OPTIONS} />
      </div>
    )}
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] text-muted-foreground">Hard limits</span>
      <TagInput aria-label="Add a hard limit" value={hardLimits} onChange={onHardLimits} placeholder="Never in this story, even if asked. Press Enter to add" />
    </div>
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] text-muted-foreground">Tone down</span>
      <TagInput aria-label="Add something to tone down" value={toneDown} onChange={onToneDown} placeholder="In the story, but softened or skipped. Press Enter to add" />
    </div>
  </div>
);
