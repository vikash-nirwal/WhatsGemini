import React, { useEffect, useState } from "react";
import { FaSave, FaTrash } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { Select, TextInput } from "src/components/molecules/form-controls";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { setImageGenPrompt, setImageModel, setImageProvider, setSafetySettings } from "src/features/settingsSlice";
import { applyPresetStorage, capturePreset, ImagePreset, isCurrentPreset, loadPresets, PRESETS_CHANGED, savePresets, withPreset } from "src/features/ai/imagePresets";
import { TONE_LEVELS } from "src/features/ai/utils/imageTone";

// Image presets (imagePresets.ts): pick one to switch the whole picture
// setup, or save the current one under a name. In the playground, a model
// typed for the tries is saved in place of the one in Settings.
export const ImagePresetPicker = ({ tryModel, onApplied }: { tryModel?: string; onApplied?: (preset: ImagePreset) => void }) => {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.settings);
  const [presets, setPresets] = useState<ImagePreset[]>(loadPresets);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const current = presets.find((p) => isCurrentPreset(p, settings));
  // A preset saved elsewhere on the page (the content test) shows up here.
  useEffect(() => {
    const reload = () => setPresets(loadPresets());
    window.addEventListener(PRESETS_CHANGED, reload);
    return () => window.removeEventListener(PRESETS_CHANGED, reload);
  }, []);
  const tested = current?.calibration;

  const update = (next: ImagePreset[]) => {
    setPresets(next);
    savePresets(next);
  };
  const apply = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    applyPresetStorage(preset);
    dispatch(setImageProvider(preset.provider));
    dispatch(setImageModel(preset.model));
    dispatch(setImageGenPrompt(preset.basePrompt));
    dispatch(setSafetySettings({ ...settings.safetySettings, falSafetyChecker: preset.falSafetyChecker }));
    onApplied?.(preset);
  };
  const save = () => {
    if (!name.trim()) return;
    update(withPreset(presets, capturePreset(name, settings, tryModel)));
    setNaming(false);
    setName("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Image preset" value={current?.id || ""} onChange={(e) => apply(e.target.value)} className="min-w-[180px] flex-1">
          <option value="">{presets.length ? "Current settings (not a preset)" : "No presets yet"}</option>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={() => { setNaming(true); setName(current?.name || ""); }}><FaSave size={11} /> Save as preset</Button>
        {current && <Button type="button" variant="ghost" size="icon" aria-label={`Delete preset ${current.name}`} onClick={() => update(presets.filter((p) => p.id !== current.id))}><FaTrash size={11} /></Button>}
      </div>
      {naming && (
        <div className="flex gap-2">
          <TextInput aria-label="Preset name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="e.g. Anime, fal SDXL" className="flex-1" autoFocus />
          <Button type="button" size="sm" disabled={!name.trim()} onClick={save}>Save</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setNaming(false)}>Cancel</Button>
        </div>
      )}
      {tested && (
        <p className="text-xs text-muted-foreground">
          With its content test: {tested.blockedAll ? "refused every level" : tested.level === 0 ? "draws prompts as written" : `starts at ${TONE_LEVELS.find((t) => t.level === tested.level)?.name}`}{tested.guidance ? `, with rules for its prompts` : ""}.
        </p>
      )}
      <p className="text-xs text-subtle">A preset keeps the provider, model, base prompt, safety checker, tone-down, fal's SDXL checkpoint and LoRAs, and the model's content test result. API keys stay with each provider.</p>
    </div>
  );
};
