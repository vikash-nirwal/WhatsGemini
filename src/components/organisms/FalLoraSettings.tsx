import React, { useRef, useState } from "react";
import { FaPlus, FaTimes, FaUpload } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { SettingsRow } from "src/components/molecules/settings-card";
import { TextArea, TextInput } from "src/components/molecules/form-controls";
import { FalLoraSettings as Settings, loadFalLora, saveFalLora } from "src/features/ai/providers/falLora";
import { uploadFalFile } from "src/features/ai/providers/falImageAdapter";

// The checkpoint, LoRAs and face matching for fal's SDXL model (falLora.ts),
// shown when it's the picked fal model. Saved as you type.
export const FalLoraSettings = ({ apiKey }: { apiKey: string }) => {
  const [settings, setSettings] = useState<Settings>(loadFalLora);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveFalLora(next);
  };
  const setLora = (i: number, patch: Partial<Settings["loras"][number]>) => update({ loras: settings.loras.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const upload = async (file: File) => {
    if (!apiKey) {
      setUploadError("Add your fal.ai API key first.");
      return;
    }
    setUploadError(null);
    setUploading(file.name);
    try {
      const url = await uploadFalFile(file, "application/octet-stream", file.name, apiKey);
      update({ loras: [...settings.loras, { path: url, scale: 0.8, name: file.name }] });
    } catch (err: any) {
      setUploadError(`Couldn't upload ${file.name}: ${err?.message || "unknown error"}`);
    } finally {
      setUploading(null);
    }
  };

  return (
    <>
      <SettingsRow label="Checkpoint" hint="The base SDXL model, as a Hugging Face name or a download link. Pony and Illustrious models are SDXL too." align="start">
        <TextInput aria-label="Checkpoint" value={settings.checkpoint} onChange={(e) => update({ checkpoint: e.target.value })} placeholder="e.g. stabilityai/stable-diffusion-xl-base-1.0" />
      </SettingsRow>

      <SettingsRow label="LoRAs" hint="Optional add-ons for a style or a look. Strength 0.6 to 0.9 usually works." align="start">
        <div className="flex flex-col gap-2">
          {settings.loras.length > 0 && (
            <ul aria-label="LoRAs" className="flex flex-col gap-2">
              {settings.loras.map((l, i) => (
                <li key={i} className="flex items-center gap-2">
                  {l.name ? (
                    <span className="min-w-0 flex-1 truncate rounded-md bg-raised px-3 py-1.5 text-[13px]" title={l.path}>{l.name} <span className="text-subtle">(uploaded)</span></span>
                  ) : (
                    <TextInput aria-label={`LoRA ${i + 1} link`} value={l.path} onChange={(e) => setLora(i, { path: e.target.value })} placeholder="Hugging Face name or download link" className="min-w-0 flex-1" />
                  )}
                  <TextInput aria-label={`LoRA ${i + 1} strength`} type="number" min="0" max="2" step="0.05" value={l.scale} onChange={(e) => setLora(i, { scale: Number(e.target.value) || 0 })} className="w-[84px]" />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove LoRA ${i + 1}`} onClick={() => update({ loras: settings.loras.filter((_, j) => j !== i) })}><FaTimes size={12} /></Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => update({ loras: [...settings.loras, { path: "", scale: 0.8 }] })}><FaPlus size={11} /> Add a link</Button>
            <Button type="button" variant="outline" size="sm" disabled={Boolean(uploading)} onClick={() => fileRef.current?.click()}><FaUpload size={11} /> {uploading ? `Uploading ${uploading}...` : "Upload a file"}</Button>
            <input
              ref={fileRef}
              type="file"
              accept=".safetensors"
              data-testid="fal-lora-file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </div>
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        </div>
      </SettingsRow>

      <SettingsRow label="Negative prompt" hint="What pictures should avoid." align="start">
        <TextArea aria-label="Negative prompt" value={settings.negativePrompt} onChange={(e) => update({ negativePrompt: e.target.value })} rows={2} />
      </SettingsRow>

      <SettingsRow label="Keep the face" hint="Sends the character's main photo so their face stays the same from picture to picture." align="start">
        <ToggleSwitch checked={settings.keepFace} onChange={(on) => update({ keepFace: on })} label={<span className="sr-only">Keep the face</span>} />
      </SettingsRow>

      <div className="px-5 pb-4">
        <FalLoraGuide />
      </div>
    </>
  );
};

// How to find a link fal can download (the user's ask, 2026-10-30).
const FalLoraGuide = () => (
  <details className="group min-w-0 rounded-lg bg-raised px-4 py-3 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
    <summary className="cursor-pointer font-medium text-foreground">How to add a checkpoint or LoRA</summary>
    <div className="mt-3 flex flex-col gap-3">
      <p>
        A <b className="text-foreground">checkpoint</b> is the base model: it decides the overall look, from photo-real to anime. A <b className="text-foreground">LoRA</b> is a small add-on on top of it, for a style, an outfit or a kind of lighting.
        fal downloads both from the link you give when a picture is made, so nothing is stored in Kindred except the link.
      </p>
      <div>
        <p className="font-medium text-foreground">From Hugging Face</p>
        <ol className="ml-5 list-decimal">
          <li>Open the model's page on huggingface.co.</li>
          <li>For a whole model, copy its name from the top of the page, like <code>stabilityai/stable-diffusion-xl-base-1.0</code>, and paste it as is.</li>
          <li>For a single file, open <i>Files and versions</i>, click the <code>.safetensors</code> file and copy its <i>download</i> link. It contains <code>/resolve/main/</code>.</li>
          <li>The model has to be public: fal can't sign in to your account.</li>
        </ol>
      </div>
      <div>
        <p className="font-medium text-foreground">From Civitai</p>
        <ol className="ml-5 list-decimal">
          <li>Open the model's page on civitai.com and pick the version you want.</li>
          <li>Right-click the <i>Download</i> button and choose <i>Copy link address</i>. It looks like <code>https://civitai.com/api/download/models/123456</code>.</li>
          <li>Only files that download without signing in will work. Don't add your Civitai API key to the link: it would be sent with every picture.</li>
        </ol>
      </div>
      <div>
        <p className="font-medium text-foreground">Uploading a file</p>
        <p><i>Upload a file</i> sends a LoRA from your device to your fal.ai storage once. LoRAs are usually 20 to 200 MB. A checkpoint is several GB, so link it instead.</p>
      </div>
      <div>
        <p className="font-medium text-foreground">Good to know</p>
        <ul className="ml-5 list-disc">
          <li>Use SDXL files only (SDXL, Pony, Illustrious). SD 1.5 and FLUX files won't load here.</li>
          <li>The first picture with a new file is slow while fal downloads it; later ones are quicker.</li>
          <li>A checkpoint's name helps Kindred write prompts in its style: Pony and Illustrious models get their own tags.</li>
          <li>The model page usually says which strength and trigger words a LoRA needs. Add trigger words to the Base prompt further down.</li>
        </ul>
      </div>
    </div>
  </details>
);
