import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaCamera, FaImage, FaLightbulb, FaMagic, FaRedo, FaTimes } from "react-icons/fa";
import Modal from "src/components/molecules/Modal";
import { ContentRatingField } from "src/components/molecules/ContentRatingField";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { TextInput, FieldLabel } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAvatarImage } from "src/features/aiSlice";
import { IMAGE_PROVIDERS } from "src/features/ai/providers/registry";
import { getProviderApiKey } from "src/features/ai/utils/settings";
import { detectMinorIndicators } from "src/features/character/contentRating";
import { CharacterDraftRequest } from "src/features/character/characterDraft";
import { readPhoto } from "src/features/chat/photoAttachments";
import { ArtStyle, ContentRating, LocalImageSettings } from "src/types";
import { ART_STYLES } from "src/utils/constants";

// "Generate portrait" is only offered when a picture could actually be made:
// SD WebUI (not an adapter, see aiSlice.ts) and keyless providers like
// ComfyUI always can, the others need their key saved.
const useImageProviderReady = (): boolean => {
  const providerId = useAppSelector((state) => state.settings.imageProvider);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const adapter = IMAGE_PROVIDERS[providerId];
    if (providerId === "sdwebui" || (adapter && !adapter.capabilities.requiresApiKey)) {
      setReady(true);
    } else if (!adapter) {
      setReady(false);
    } else {
      getProviderApiKey(providerId).then((key) => !cancelled && setReady(Boolean(key)), () => !cancelled && setReady(false));
    }
    return () => {
      cancelled = true;
    };
  }, [providerId]);
  return ready;
};

interface IdeaDraftSectionProps {
  // The request behind the draft now in the editor, or null before the first one.
  lastRequest: CharacterDraftRequest | null;
  drafting: boolean;
  error: string | null;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onDraft: (request: CharacterDraftRequest) => void;
  onTryAnother: () => void;
  // The editor's current values: the dialog's hints start from them, and the
  // portrait is drawn from whatever the user has edited the draft into.
  contentRating?: ContentRating;
  adultsConfirmed: boolean;
  artStyle: ArtStyle;
  name: string;
  appearance: string;
  visualTags: string;
  localImageSettings?: LocalImageSettings;
  onPortraitGenerated: (dataUrl: string) => void;
}

// Character from one line (#45): a card on the editor's first step that
// opens the idea dialog, and, once a draft has filled the fields, offers
// another take or a portrait. Nothing here saves the character; the user
// reviews the filled-in wizard and saves it as usual.
const IdeaDraftSection: React.FC<IdeaDraftSectionProps> = ({
  lastRequest,
  drafting,
  error,
  dialogOpen,
  onDialogOpenChange,
  onDraft,
  onTryAnother,
  contentRating,
  adultsConfirmed,
  artStyle,
  name,
  appearance,
  visualTags,
  localImageSettings,
  onPortraitGenerated,
}) => {
  const dispatch = useAppDispatch();
  const imageReady = useImageProviderReady();
  const [idea, setIdea] = useState("");
  const [rating, setRating] = useState<ContentRating | undefined>(contentRating);
  const [confirmed, setConfirmed] = useState(adultsConfirmed);
  const [style, setStyle] = useState<ArtStyle>(artStyle);
  const [ideaError, setIdeaError] = useState<string | null>(null);
  // Character from a photo (#92): optional, and enough on its own.
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [generatingPortrait, setGeneratingPortrait] = useState(false);
  const [portraitError, setPortraitError] = useState<string | null>(null);

  // Each time the dialog opens, the hints start from what the editor has now
  // (the user may have changed the rating or style since the last draft).
  useEffect(() => {
    if (!dialogOpen) return;
    setIdea(lastRequest?.idea ?? "");
    setPhoto(lastRequest?.photo ?? null);
    setPhotoError(null);
    setRating(contentRating);
    setConfirmed(adultsConfirmed);
    setStyle(artStyle);
    setIdeaError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  const minorIndicators = useMemo(() => detectMinorIndicators([idea]), [idea]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (drafting) return;
    if (!idea.trim() && !photo) {
      setIdeaError("Describe the character in a few words, or add a photo.");
      return;
    }
    setIdeaError(null);
    onDraft({ idea: idea.trim(), contentRating: rating, adultsConfirmed: rating === "nsfw" && confirmed, artStyle: style, photo: photo || undefined });
  };

  const handlePhotoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    try {
      setPhoto(await readPhoto(file));
    } catch (err: any) {
      setPhotoError(err?.message || "Couldn't read that photo.");
    }
  };

  const handleGeneratePortrait = async () => {
    setPortraitError(null);
    setGeneratingPortrait(true);
    try {
      const result = await dispatch(generateAvatarImage({ name, appearance, visualTags, artStyle, localImageSettings })).unwrap();
      const image = result.images?.[0];
      if (image) onPortraitGenerated(image);
      else setPortraitError("No image was returned.");
    } catch (err: any) {
      setPortraitError(typeof err === "string" ? err : err?.message || "Failed to generate a portrait. Check your image provider in Settings.");
    } finally {
      setGeneratingPortrait(false);
    }
  };

  const smallButton = "h-auto px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary";

  return (
    <>
      <Card className="p-5 flex flex-col gap-3" aria-label="Create from an idea" role="region">
        {lastRequest ? (
          <>
            <p className="text-sm text-foreground">
              {lastRequest.idea ? (
                <>
                  Drafted from your {lastRequest.photo ? "photo and idea" : "idea"}: <span className="italic">“{lastRequest.idea}”</span>
                </>
              ) : (
                "Drafted from your photo"
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Check every step and change anything you like. Nothing is saved until you create the character.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="panel" onClick={onTryAnother} disabled={drafting} className={smallButton}>
                <FaRedo size={11} /> {drafting ? "Drafting..." : "Try another"}
              </Button>
              <Button type="button" variant="panel" onClick={() => onDialogOpenChange(true)} disabled={drafting} className={smallButton}>
                <FaLightbulb size={11} /> Change idea
              </Button>
              {lastRequest.photo && (
                <Button type="button" variant="panel" onClick={() => onPortraitGenerated(lastRequest.photo!)} disabled={drafting} className={smallButton}>
                  <FaImage size={11} /> Use the photo as the portrait
                </Button>
              )}
              {imageReady && (
                <Button type="button" variant="panel" onClick={handleGeneratePortrait} disabled={drafting || generatingPortrait} className={smallButton}>
                  <FaMagic size={11} /> {generatingPortrait ? "Generating..." : "Generate portrait"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground flex-1 basis-[220px]">
              Have an idea or a photo? Describe a character in one line, or start from a picture, and the AI drafts the rest for you to review.
            </p>
            <Button type="button" variant="default" onClick={() => onDialogOpenChange(true)} className="h-auto px-4 py-2 text-sm font-semibold">
              <FaLightbulb size={12} /> Create from an idea
            </Button>
          </div>
        )}
        {!dialogOpen && error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {portraitError && <p role="alert" className="text-xs text-destructive">{portraitError}</p>}
      </Card>

      <Modal
        isOpen={dialogOpen}
        onClose={() => !drafting && onDialogOpenChange(false)}
        title="Create from an idea"
        subtitle="The AI drafts every field from one line or a photo. You review and edit it all before anything is saved."
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <FieldLabel htmlFor="character-idea">Your idea</FieldLabel>
            <TextInput
              id="character-idea"
              type="text"
              autoFocus
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. grumpy pirate cook who secretly writes poetry"
            />
            {ideaError && <p className="text-xs text-destructive mt-1">{ideaError}</p>}
          </div>
          <div>
            <FieldLabel hint="Optional. A model that can see pictures drafts their look from it, and the rest to suit.">Start from a photo</FieldLabel>
            <input ref={photoInput} type="file" accept="image/*" className="hidden" data-testid="idea-photo-input" onChange={handlePhotoPicked} />
            {photo ? (
              <div className="flex items-center gap-3">
                <img src={photo} alt="What the draft starts from" className="h-16 w-16 rounded-md object-cover border border-border" />
                <Button type="button" variant="panel" onClick={() => setPhoto(null)} aria-label="Remove photo" className="h-auto px-3 py-1.5 text-xs border border-border hover:border-primary">
                  <FaTimes size={11} /> Remove
                </Button>
              </div>
            ) : (
              <Button type="button" variant="panel" onClick={() => photoInput.current?.click()} className="h-auto px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary">
                <FaCamera size={11} /> Add a photo
              </Button>
            )}
            {photoError && <p className="text-xs text-destructive mt-1">{photoError}</p>}
          </div>
          <ContentRatingField
            rating={rating}
            adultsConfirmed={confirmed}
            minorIndicators={minorIndicators}
            onChange={(r, c) => { setRating(r); setConfirmed(c); }}
          />
          <div>
            <FieldLabel hint="The look the appearance is written for, and the style of the character's pictures.">Art style</FieldLabel>
            <SegmentedControl value={style} onChange={(v) => setStyle(v as ArtStyle)} options={ART_STYLES} />
          </div>
          {lastRequest && <p className="text-xs text-subtle">A new draft replaces the drafted fields in the editor.</p>}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="panel" onClick={() => onDialogOpenChange(false)} disabled={drafting} className="h-auto px-4 py-2 border border-border hover:border-primary font-medium">
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={drafting} className="h-auto px-4 py-2 font-semibold">
              <FaMagic size={12} /> {drafting ? "Drafting..." : error ? "Try again" : "Draft character"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default IdeaDraftSection;
