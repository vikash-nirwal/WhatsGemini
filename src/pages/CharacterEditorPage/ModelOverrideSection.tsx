import React, { useEffect, useState } from "react";
import { FaChevronRight } from "react-icons/fa";
import { Select, Slider, TextInput } from "src/components/molecules/form-controls";
import { ProviderPicker } from "src/components/molecules/ProviderPicker";
import { Button } from "src/components/atoms/button";
import { CHAT_PROVIDERS, CHAT_PROVIDER_META } from "src/features/ai/providers/registry";
import { getProviderApiKey } from "src/features/ai/utils/settings";
import { CharacterModelOverride, isEmptyModelOverride, resolveTurnModel } from "src/features/ai/modelResolution";
import { useAppSelector } from "src/store/hooks";
import { SamplerSettings } from "src/types";
import { PROVIDER_CHAT_MODELS } from "src/utils/constants";

interface ModelOverrideSectionProps {
  value: CharacterModelOverride | undefined;
  onChange: (value: CharacterModelOverride | undefined) => void;
}

const SAME_AS_APP = "";

const SAMPLER_FIELDS: { key: keyof SamplerSettings; label: string; step: string; min?: string; max?: string }[] = [
  { key: "topP", label: "Top P", step: "0.05", min: "0", max: "1" },
  { key: "topK", label: "Top K", step: "1", min: "1" },
  { key: "frequencyPenalty", label: "Frequency penalty", step: "0.1", min: "-2", max: "2" },
  { key: "presencePenalty", label: "Presence penalty", step: "0.1", min: "-2", max: "2" },
];

const providerLabel = (id: string) => CHAT_PROVIDER_META.find((p) => p.id === id)?.label || id;

// "Model for this character" (#32): pins a provider, model, temperature or
// samplers for one character, for example a creative model for a storyteller
// and a cheap one for everyone else. Collapsed by default since most
// characters use the app's settings. Every field left alone falls back to
// Settings > Text, and resolveTurnModel decides what a turn actually uses.
const ModelOverrideSection: React.FC<ModelOverrideSectionProps> = ({ value, onChange }) => {
  const settings = useAppSelector((state) => state.settings);
  const override = value || {};
  const provider = override.provider || SAME_AS_APP;
  // The provider whose models are offered: the chosen one, or the app's.
  const effectiveProvider = provider || settings.chatProvider;
  const resolved = resolveTurnModel(settings, { modelOverride: override });
  const isCustom = !isEmptyModelOverride(value);

  const update = (patch: Partial<CharacterModelOverride>) => onChange({ ...override, ...patch });

  // Each provider keeps its own API key, so a character on another provider
  // silently fails unless that key was saved too: say so up front.
  const [missingKey, setMissingKey] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setMissingKey(false);
    if (!provider || !CHAT_PROVIDERS[provider]?.capabilities.requiresApiKey) return;
    getProviderApiKey(provider).then((key) => {
      if (!cancelled) setMissingKey(!key);
    });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const listedModels = PROVIDER_CHAT_MODELS[effectiveProvider] || [];
  const isOllama = effectiveProvider === "ollama";
  // A model saved earlier (or fetched in Settings) that isn't in the fixed
  // list still has to show as selected.
  const modelOptions = override.model && !listedModels.includes(override.model) ? [override.model, ...listedModels] : listedModels;
  const defaultModelLabel = provider && provider !== settings.chatProvider
    ? `Default (${PROVIDER_CHAT_MODELS[provider]?.[0] || "type a model"})`
    : `Same as app (${settings.selectedModel})`;

  const setSampler = (key: keyof SamplerSettings, raw: string) => {
    const next = { ...override.samplers };
    if (raw === "" || Number.isNaN(Number(raw))) delete next[key];
    else next[key] = Number(raw);
    update({ samplers: next });
  };

  return (
    <details className="group">
      {/* A flex summary loses the browser's disclosure triangle, so draw one. */}
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        Model for this character
        <span className="text-xs font-normal text-muted-foreground">
          {isCustom ? `${providerLabel(resolved.provider)} / ${resolved.model}, temperature ${resolved.temperature}` : "same as app"}
        </span>
      </summary>

      <div className="mt-4 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          This character's replies use these instead of Settings &gt; Text. Anything left at "Same as app" follows the app setting.
        </p>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] text-muted-foreground">Provider</span>
          <ProviderPicker
            providers={[{ id: SAME_AS_APP, label: `Same as app (${providerLabel(settings.chatProvider)})` }, ...CHAT_PROVIDER_META]}
            value={provider}
            // Switching provider clears the model, which belonged to the old one.
            onChange={(id) => update({ provider: id || undefined, model: undefined })}
          />
          {missingKey && (
            <p className="text-xs text-destructive">
              No API key saved for {providerLabel(provider)} yet. Add one in Settings &gt; Text (pick that provider there), or this character's replies will fail.
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] text-muted-foreground">Model</span>
          {isOllama ? (
            <TextInput
              type="text"
              value={override.model || ""}
              onChange={(e) => update({ model: e.target.value || undefined })}
              placeholder={provider ? "e.g. llama3.1" : settings.selectedModel}
              className="max-w-sm"
            />
          ) : (
            <div className="max-w-sm">
              <Select aria-label="Model" value={override.model || ""} onChange={(e) => update({ model: e.target.value || undefined })}>
                <option value="">{defaultModelLabel}</option>
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </label>

        <div className="flex flex-col gap-1.5 max-w-sm">
          <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
            <span>Creativity (temperature)</span>
            {override.temperature != null ? (
              <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => update({ temperature: undefined })}>
                Use app setting
              </Button>
            ) : (
              <span>same as app</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Slider value={resolved.temperature} min={0} max={1} step={0.1} onChange={(t) => update({ temperature: t })} />
            </div>
            <span className="w-8 text-right text-xs font-semibold tabular-nums text-foreground">{resolved.temperature.toFixed(1)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[11.5px] text-muted-foreground">Sampling (blank = app setting)</span>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            {SAMPLER_FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {f.label}
                <TextInput
                  type="number"
                  step={f.step}
                  min={f.min}
                  max={f.max}
                  value={override.samplers?.[f.key] ?? ""}
                  onChange={(e) => setSampler(f.key, e.target.value)}
                  placeholder={settings.samplers[f.key] != null ? String(settings.samplers[f.key]) : "default"}
                />
              </label>
            ))}
          </div>
        </div>

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

export default ModelOverrideSection;
