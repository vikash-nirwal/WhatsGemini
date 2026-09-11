import React, { useState } from "react";
import { useAppDispatch } from "../../store/hooks";
import { generateAvatarImage } from "../../features/aiSlice";
import { Button } from "src/components/atoms/button";
import { TextInput } from "src/components/molecules/form-controls";
import { FaMagic } from "react-icons/fa";
import { ArtStyle } from "../../types";

interface AvatarGenerateButtonProps {
  name: string;
  appearance: string;
  appearanceImages?: string[];
  artStyle?: ArtStyle;
  disabled?: boolean;
  /** Called with the first generated image's data URL on success. */
  onGenerated: (dataUrl: string) => void;
}

// "Generate Avatar" button that calls the generateAvatarImage thunk and passes
// the result to the parent. The parent is responsible for opening the crop
// dialog with the generated image.

const AvatarGenerateButton: React.FC<AvatarGenerateButtonProps> = ({
  name,
  appearance,
  appearanceImages,
  artStyle,
  disabled,
  onGenerated,
}) => {
  const dispatch = useAppDispatch();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("");

  const handleGenerate = async () => {
    if (!name.trim()) {
      setError("Give the character a name first.");
      return;
    }
    setError(null);
    setGenerating(true);

    try {
      const result = await dispatch(
        generateAvatarImage({ name, appearance, appearanceImages, artStyle, hint: hint.trim() || undefined })
      ).unwrap();

      if (result.images && result.images.length > 0) {
        onGenerated(result.images[0]);
      } else {
        setError("No image was returned.");
      }
    } catch (err: any) {
      setError(
        typeof err === "string"
          ? err
          : "Failed to generate avatar. Check your API key and image provider in Settings."
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <TextInput
        type="text"
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder="Optional direction (e.g. wearing sunglasses)..."
        className="h-8 text-xs"
      />
      <Button
        type="button"
        variant="panel"
        onClick={handleGenerate}
        disabled={generating || disabled}
        className="h-auto w-full px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
        title="Generate a portrait using AI from this character's name and appearance description"
      >
        <FaMagic size={11} /> {generating ? "Generating..." : "✨ Generate Avatar"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

export default AvatarGenerateButton;
