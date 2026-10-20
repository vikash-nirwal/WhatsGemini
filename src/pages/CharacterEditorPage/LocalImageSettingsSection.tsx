import React from "react";
import { FaChevronRight } from "react-icons/fa";
import { Select, TextInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { cleanLocalImageSettings } from "src/features/ai/utils/localImageSettings";
import { LocalImageSettings } from "src/types";

interface LocalImageSettingsSectionProps {
  value: LocalImageSettings | undefined;
  onChange: (value: LocalImageSettings | undefined) => void;
}

const REFERENCE_MODES: { value: NonNullable<LocalImageSettings["referenceMode"]> | ""; label: string }[] = [
  { value: "", label: "Same as app" },
  { value: "controlnet", label: "Face ID (IP-Adapter / FaceID)" },
  { value: "reactor", label: "ReActor face swap" },
  { value: "img2img", label: "Edit the main reference (img2img / FLUX Kontext)" },
  { value: "none", label: "Don't use reference photos" },
];

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

// "Local image settings" (#40): a seed, LoRA, reference mode and ReActor
// face model for this character when pictures are made locally, with the
// Stable Diffusion WebUI or ComfyUI. Collapsed by default; cloud providers
// ignore it.
const LocalImageSettingsSection: React.FC<LocalImageSettingsSectionProps> = ({ value, onChange }) => {
  const settings = value || {};
  const update = (patch: Partial<LocalImageSettings>) => onChange({ ...settings, ...patch });
  const isCustom = !!cleanLocalImageSettings(value);
  const summary = [
    settings.loraName?.trim() && `LoRA ${settings.loraName.trim()}`,
    settings.seed != null && `seed ${settings.seed}`,
    settings.referenceMode && REFERENCE_MODES.find((m) => m.value === settings.referenceMode)?.label,
  ].filter(Boolean).join(", ");

  const numberOrUndefined = (raw: string) => (raw === "" || Number.isNaN(Number(raw)) ? undefined : Number(raw));

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        Local image settings
        <span className="text-xs font-normal text-muted-foreground">{summary || "same as app"}</span>
      </summary>

      <div className="mt-4 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          For pictures made locally with the Stable Diffusion WebUI or ComfyUI. A fixed seed and a LoRA trained on this character keep the face the same from picture to picture. In ComfyUI the reference mode picks the matching bundled workflow.
        </p>

        <div className="flex flex-col gap-1.5 max-w-sm">
          <span className="text-[11.5px] text-muted-foreground">Seed (blank = random each time)</span>
          <div className="flex gap-2">
            <TextInput
              type="number"
              min="0"
              step="1"
              aria-label="Seed"
              value={settings.seed ?? ""}
              onChange={(e) => update({ seed: numberOrUndefined(e.target.value) })}
              placeholder="random"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => update({ seed: randomSeed() })}>
              Pick one
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 max-w-xl sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[11.5px] text-muted-foreground sm:col-span-2">
            LoRA file name
            <TextInput type="text" value={settings.loraName || ""} onChange={(e) => update({ loraName: e.target.value })} placeholder="e.g. mira_v2" />
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] text-muted-foreground">
            LoRA weight
            <TextInput
              type="number"
              min="0"
              max="2"
              step="0.05"
              value={settings.loraWeight ?? ""}
              onChange={(e) => update({ loraWeight: numberOrUndefined(e.target.value) })}
              placeholder="0.8"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] text-muted-foreground sm:col-span-3">
            LoRA trigger word
            <TextInput type="text" value={settings.loraTrigger || ""} onChange={(e) => update({ loraTrigger: e.target.value })} placeholder="e.g. mira_char" />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 max-w-sm">
          <span className="text-[11.5px] text-muted-foreground">How reference photos are used</span>
          <Select
            aria-label="How reference photos are used"
            value={settings.referenceMode || ""}
            onChange={(e) => update({ referenceMode: (e.target.value || undefined) as LocalImageSettings["referenceMode"] })}
          >
            {REFERENCE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 max-w-sm">
          <span className="text-[11.5px] text-muted-foreground">ReActor face model, SD WebUI only (blank = the first name)</span>
          <TextInput type="text" value={settings.reactorFaceModel || ""} onChange={(e) => update({ reactorFaceModel: e.target.value })} placeholder="e.g. mira" />
        </label>

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">How to train a LoRA for this character</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Collect 15–30 pictures of the character: the reference sheet (Identity step) plus a few portraits in different poses and lighting.</li>
            <li>Train with Kohya_ss or OneTrainer on the same base model you generate with. Under an hour on a mid-range GPU.</li>
            <li>Put the .safetensors file in the WebUI's models/Lora folder (ComfyUI: models/loras) and enter its name and trigger word here.</li>
          </ol>
        </details>

        {isCustom && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(undefined)}>
              Reset to app settings
            </Button>
          </div>
        )}
      </div>
    </details>
  );
};

export default LocalImageSettingsSection;
