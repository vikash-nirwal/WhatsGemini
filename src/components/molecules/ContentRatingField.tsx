import React from "react";
import { ContentRating } from "src/types";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { FieldLabel } from "src/components/molecules/form-controls";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";

interface ContentRatingFieldProps {
  rating?: ContentRating;
  adultsConfirmed: boolean;
  minorIndicators: string[]; // from detectMinorIndicators over the card's text
  nsfwTagged?: boolean; // has the NSFW tag, which alone doesn't enable anything
  onChange: (rating: ContentRating | undefined, adultsConfirmed: boolean) => void;
}

const OPTIONS = [
  { value: "", label: "Not set" },
  { value: "sfw", label: "SFW" },
  { value: "nsfw", label: "NSFW" },
];

// Shared by the character editor and the import review dialog. NSFW only
// takes effect with the 18+ confirmation and no minor indicators in the text
// (see effectiveContentRating) - this makes both requirements visible.
export const ContentRatingField: React.FC<ContentRatingFieldProps> = ({ rating, adultsConfirmed, minorIndicators, nsfwTagged, onChange }) => (
  <div className="flex flex-col gap-2.5">
    <FieldLabel hint="SFW keeps chats non-explicit. NSFW allows explicit content, but only for adult characters. Not set sends no content rule.">Content rating</FieldLabel>
    <SegmentedControl
      value={rating || ""}
      onChange={(v) => onChange((v || undefined) as ContentRating | undefined, v === "nsfw" ? adultsConfirmed : false)}
      options={OPTIONS}
    />
    {!rating && nsfwTagged && (
      <p className="text-xs text-subtle">Tagged NSFW, but chats stay SFW until you set the rating to NSFW and confirm 18+.</p>
    )}
    {rating === "nsfw" && (
      <>
        <ToggleSwitch
          checked={adultsConfirmed}
          onChange={(v) => onChange("nsfw", v)}
          label="Every character in this card is an adult (18 or older)"
          className="text-xs"
        />
        {minorIndicators.length > 0 ? (
          <p className="text-xs text-destructive">
            This card's text suggests a character may be under 18 ({minorIndicators.map((p) => `"${p}"`).join(", ")}).
            NSFW stays off until that wording is changed.
          </p>
        ) : !adultsConfirmed ? (
          <p className="text-xs text-subtle">Until confirmed, chats with this character are kept SFW.</p>
        ) : null}
      </>
    )}
  </div>
);
