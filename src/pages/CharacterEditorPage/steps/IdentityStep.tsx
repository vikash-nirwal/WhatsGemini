import React from "react";
import { FaTimes, FaUpload, FaPlus, FaMagic, FaDice } from "react-icons/fa";
import { Character, ArtStyle } from "../../../types";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { TextInput, TextArea, FieldLabel, InfoTooltip, PresetSelectField, ChipSelectField } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { cn } from "../../../utils/cn";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { EMOTIONS, ART_STYLES, RELATIONSHIP_PRESETS, TAG_PRESETS } from "../../../utils/constants";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";

interface IdentityStepProps {
  editCharacter: Character | null;
  surprising: boolean;
  handleSurpriseMe: () => void;
  surpriseHint: string;
  setSurpriseHint: (v: string) => void;
  assistError: string | null;
  name: string;
  setName: (v: string) => void;
  relationship: string;
  setRelationship: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  tags: string[];
  setTags: (v: string[]) => void;
  appearance: string;
  setAppearance: (v: string) => void;
  artStyle: ArtStyle;
  setArtStyle: (v: ArtStyle) => void;
  appearanceImages: string[];
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  handleImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  removeAppearanceImage: (index: number) => void;
  neumorphic: boolean;
  emotionPortraitsEnabled: boolean;
  setEmotionPortraitsEnabled: (v: boolean) => void;
  emotionHint: string;
  setEmotionHint: (v: string) => void;
  customEmotions: string[];
  emotionPortraitImages: Record<string, string>;
  generatingEmotion: string | null;
  generatingAllEmotions: boolean;
  handleGenerateEmotion: (emotion: string) => void;
  handleTriggerEmotionUpload: (emotion: string) => void;
  handleRemoveCustomEmotion: (emotion: string) => void;
  newCustomEmotion: string;
  setNewCustomEmotion: (v: string) => void;
  handleAddCustomEmotion: () => void;
  emotionUploadInputRef: React.RefObject<HTMLInputElement | null>;
  handleEmotionFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleGenerateAllEmotions: () => void;
  emotionGenError: string | null;
}

// Wizard step 1/6 - identity/appearance fields plus the emotion portrait
// grid. Split out of CharacterEditorPage.tsx (which had all 6 steps inlined
// behind `step === N` conditionals) and lazy-loaded from there so this,
// the largest step, doesn't have to parse/eval until it's actually shown.
const IdentityStep: React.FC<IdentityStepProps> = ({
  editCharacter,
  surprising,
  handleSurpriseMe,
  surpriseHint,
  setSurpriseHint,
  assistError,
  name,
  setName,
  relationship,
  setRelationship,
  description,
  setDescription,
  tags,
  setTags,
  appearance,
  setAppearance,
  artStyle,
  setArtStyle,
  appearanceImages,
  imageInputRef,
  handleImageUpload,
  removeAppearanceImage,
  neumorphic,
  emotionPortraitsEnabled,
  setEmotionPortraitsEnabled,
  emotionHint,
  setEmotionHint,
  customEmotions,
  emotionPortraitImages,
  generatingEmotion,
  generatingAllEmotions,
  handleGenerateEmotion,
  handleTriggerEmotionUpload,
  handleRemoveCustomEmotion,
  newCustomEmotion,
  setNewCustomEmotion,
  handleAddCustomEmotion,
  emotionUploadInputRef,
  handleEmotionFileSelected,
  handleGenerateAllEmotions,
  emotionGenError,
}) => (
  <>
    <Card className="p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <h3 data-slot="section-title" className="font-semibold text-[15px] text-foreground">Identity</h3>
        {!editCharacter && (
          <Button
            type="button"
            variant="panel"
            onClick={handleSurpriseMe}
            disabled={surprising}
            className="h-auto px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
            title="Roll a random relationship, tags, and personality traits, then have the AI invent a whole character around them"
          >
            <FaDice size={12} /> {surprising ? "Rolling..." : "Surprise Me"}
          </Button>
        )}
      </div>
      {!editCharacter && (
        <TextInput
          type="text"
          value={surpriseHint}
          onChange={(e) => setSurpriseHint(e.target.value)}
          placeholder="Optional: steer the surprise (e.g. cyberpunk hacker, medieval knight)..."
          className="-mt-1"
        />
      )}
      {assistError && <p className="text-xs text-destructive -mt-1">{assistError}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <FieldLabel htmlFor="char-name">Character Name</FieldLabel>
          <TextInput
            id="char-name"
            type="text"
            placeholder="Character Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <PresetSelectField
          label="Tagline / Relationship"
          value={relationship}
          onChange={setRelationship}
          presets={RELATIONSHIP_PRESETS}
          customPlaceholder="Tagline / Relationship with User (e.g. Best Friend, Enemy)"
        />
      </div>
      <TextArea
        placeholder="Description (Optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="resize-none"
      />
      <ChipSelectField
        label="Tags"
        hint="Discoverability tags for your library. Press Enter or comma to add a custom one."
        value={tags}
        onChange={setTags}
        presets={TAG_PRESETS}
        placeholder="Add a tag..."
      />

      {/* Appearance fields live in this same card, not a separate
          one - a lighter sub-heading marks the shift in topic
          instead of a full second card's worth of chrome. */}
      <div className="flex items-center gap-1.5 pt-2 mt-1 border-t border-border/30">
        <h4 data-slot="section-title" className="text-xs font-semibold uppercase tracking-wide text-subtle">Appearance</h4>
        <InfoTooltip hint="Given to image-capable models to keep generated looks consistent" />
      </div>
      <TextArea
        placeholder="Character Appearance/Looks (e.g. Blonde hair, wears a red jacket) (Optional)"
        value={appearance}
        onChange={(e) => setAppearance(e.target.value)}
        className="resize-none"
      />
      <div>
        <FieldLabel hint="Pins a consistent look for the main avatar and every generated emotion portrait, instead of the AI picking a style per call.">Art style</FieldLabel>
        <SegmentedControl
          value={artStyle}
          onChange={(v) => setArtStyle(v as ArtStyle)}
          options={ART_STYLES}
        />
      </div>
      <div>
        <label className="block text-sm text-foreground font-medium mb-2">Reference Images</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {appearanceImages.map((src, idx) => (
            <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted">
              <DisplayImage srcContext={src} alt="Appearance Reference" className="w-full h-full object-cover" />
              <Button
                onClick={() => removeAppearanceImage(idx)}
                variant="destructive"
                className="absolute top-1 right-1 h-auto w-auto rounded-full p-1"
              >
                <FaTimes size={10} />
              </Button>
            </div>
          ))}
          <button
            onClick={() => imageInputRef.current?.click()}
            className={cn(
              "w-20 h-20 flex flex-col justify-center items-center rounded-lg text-muted-foreground hover:text-primary transition-colors",
              neumorphic ? "surface-sunken" : "border-2 border-dashed border-border hover:border-primary"
            )}
          >
            <FaUpload size={16} />
            <span className="text-[10px] mt-1 text-center font-medium">Add Image</span>
          </button>
        </div>
        <p className="text-xs text-subtle">Provided to image-capable models to keep generated appearance consistent.</p>
        <input
          type="file"
          ref={imageInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          multiple
          style={{ display: "none" }}
        />
      </div>
    </Card>

    <Card className="p-6 flex flex-col gap-5">
      <div className="flex items-center gap-1.5">
        <h3 data-slot="section-title" className="font-semibold text-[15px] text-foreground">Emotion Portraits</h3>
        <InfoTooltip hint="Swaps the avatar to match their mood as you chat" />
      </div>
      <ToggleSwitch
        checked={emotionPortraitsEnabled}
        onChange={setEmotionPortraitsEnabled}
        label="Show a matching portrait for their current emotion"
        title="The AI reports its mood each reply; the chat avatar swaps to a matching portrait you generate below, including for neutral. Any mood without a generated portrait falls back to the main portrait above."
      />
      {emotionPortraitsEnabled && (
        <div className="flex flex-col gap-3">
          <TextInput
            type="text"
            value={emotionHint}
            onChange={(e) => setEmotionHint(e.target.value)}
            placeholder="Optional direction for generated portraits (e.g. wearing glasses)..."
          />
          <div className="flex flex-wrap gap-2.5">
            {[...EMOTIONS.map((emo) => ({ emo, removable: false })), ...customEmotions.map((emo) => ({ emo, removable: true }))].map(({ emo, removable }) => (
              <div key={emo} className="flex flex-col items-center gap-1 w-[92px]">
                <div className="relative w-[76px] h-[76px] rounded-lg overflow-hidden border border-border bg-muted">
                  {emotionPortraitImages[emo] ? (
                    <DisplayImage srcContext={emotionPortraitImages[emo]} alt={emo} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-subtle">
                      <FaMagic size={14} />
                    </div>
                  )}
                  {generatingEmotion === emo && (
                    <div className="absolute inset-0 bg-background/70 flex items-center justify-center text-[10px] text-foreground font-medium">
                      Generating...
                    </div>
                  )}
                  {removable && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomEmotion(emo)}
                      disabled={Boolean(generatingEmotion) || generatingAllEmotions}
                      className="absolute top-1 right-1 h-4 w-4 rounded-full bg-background/80 text-subtle hover:text-destructive flex items-center justify-center"
                      title={`Remove the "${emo}" custom mood`}
                      aria-label={`Remove the "${emo}" custom mood`}
                    >
                      <FaTimes size={8} />
                    </button>
                  )}
                </div>
                <span className="capitalize text-[10.5px] font-medium text-foreground">{emo}</span>
                <div className="flex items-center justify-center flex-wrap gap-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleGenerateEmotion(emo)}
                    disabled={Boolean(generatingEmotion) || generatingAllEmotions}
                    className="text-[10.5px] font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    {emotionPortraitImages[emo] ? "Regenerate" : "Generate"}
                  </button>
                  <span className="text-[10.5px] text-subtle">·</span>
                  <button
                    type="button"
                    onClick={() => handleTriggerEmotionUpload(emo)}
                    disabled={Boolean(generatingEmotion) || generatingAllEmotions}
                    className="text-[10.5px] font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    Upload
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <TextInput
              type="text"
              value={newCustomEmotion}
              onChange={(e) => setNewCustomEmotion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomEmotion();
                }
              }}
              placeholder="Add a custom mood (e.g. smug, flustered)..."
              className="flex-1"
            />
            <Button
              type="button"
              variant="panel"
              onClick={handleAddCustomEmotion}
              className="h-auto px-3 py-2 text-xs font-medium border border-border hover:border-primary hover:text-primary flex-shrink-0"
            >
              <FaPlus size={10} /> Add mood
            </Button>
          </div>
          <input
            type="file"
            ref={emotionUploadInputRef}
            onChange={handleEmotionFileSelected}
            accept="image/*"
            style={{ display: "none" }}
          />
          <Button
            type="button"
            variant="panel"
            onClick={handleGenerateAllEmotions}
            disabled={Boolean(generatingEmotion) || generatingAllEmotions}
            className="h-auto w-full px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
          >
            <FaMagic size={11} /> {generatingAllEmotions ? `Generating${generatingEmotion ? ` (${generatingEmotion})` : ""}...` : "Generate all missing"}
          </Button>
          {emotionGenError && <p className="text-xs text-destructive">{emotionGenError}</p>}
        </div>
      )}
    </Card>
  </>
);

export default IdentityStep;
