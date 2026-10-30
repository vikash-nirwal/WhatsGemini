import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "src/components/molecules/form-controls";
import { loadPresets } from "src/features/ai/imagePresets";

// The image preset this character's pictures use (2026-10-30): chat
// pictures, portraits and stickers come from it instead of Settings until
// it's cleared. A deleted preset falls back to Settings.
const ImagePresetSection = ({ value, onChange }: { value: string; onChange: (id: string) => void }) => {
  const [presets] = useState(loadPresets);
  const missing = value && !presets.some((p) => p.id === value);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="character-image-preset" className="text-sm font-medium text-foreground">Image preset</label>
      <Select id="character-image-preset" aria-label="Image preset for this character" value={missing ? "" : value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Same as app (Settings › Images)</option>
        {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <p className="text-xs text-subtle">
        {presets.length ? "Their pictures, portraits and stickers use this preset's model and settings until you set it back." : "No presets yet."}{" "}
        <Link to="/images" className="font-semibold text-primary-text hover:underline">Make one in the image playground</Link>
        {missing ? ". The preset they had was deleted, so they use Settings." : "."}
      </p>
    </div>
  );
};

export default ImagePresetSection;
