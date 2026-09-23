import React from 'react';
import { TextInput, Select, Slider } from "src/components/molecules/form-controls";
import { CHAT_PROVIDER_META } from '../../features/ai/providers/registry';
import { ProviderCapabilities } from '../../features/ai/providers/types';
import { Button } from 'src/components/atoms/button';
import { SettingsCard, SettingsCardHeader, SettingsRow } from 'src/components/molecules/settings-card';
import { ProviderPicker } from 'src/components/molecules/ProviderPicker';
import { SegmentedControl } from 'src/components/molecules/SegmentedControl';
import { TextArea } from "src/components/molecules/form-controls";
import ToggleSwitch from 'src/components/atoms/ToggleSwitch';
import { RoleplayPov, RoleplayStyle, SamplerSettings } from '../../types';

// Which sampler knobs each chat provider's adapter actually forwards (see
// the adapters) - shown so an ignored setting isn't a silent no-op.
const SAMPLER_SUPPORT: Record<string, string> = {
  gemini: "Gemini: all four (some models reject the penalties).",
  anthropic: "Anthropic: Top K only.",
  ollama: "Ollama: all four.",
  qwen: "Qwen: all four.",
};
const DEFAULT_SAMPLER_SUPPORT = "This provider: Top P and the two penalties (Top K is not part of its API).";

const POV_OPTIONS: { value: RoleplayPov; label: string }[] = [
  { value: "auto", label: "Any" },
  { value: "first", label: "1st" },
  { value: "second", label: "2nd" },
  { value: "third", label: "3rd" },
];

interface TextModelSettingsProps {
  temperature: number;
  setTemperature: (temp: number) => void;
  chatProvider: string;
  setChatProvider: (provider: string) => void;
  chatProviderCapabilities: ProviderCapabilities;
  providerApiKey: string;
  setProviderApiKey: (key: string) => void;
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;
  ollamaModels: string[];
  fetchOllamaModels: () => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  modelList: { value: string; label: string }[];
  canFetchModels: boolean;
  fetchModels: () => void;
  replyLengthLimit: number;
  setReplyLengthLimit: (chars: number) => void;
  compressThreshold: number;
  setCompressThreshold: (threshold: number) => void;
  samplers: SamplerSettings;
  setSamplers: (samplers: SamplerSettings) => void;
  roleplayStyle: RoleplayStyle;
  setRoleplayStyle: (style: RoleplayStyle) => void;
  onLogout: () => void;
}

const TextModelSettings: React.FC<TextModelSettingsProps> = ({
  temperature,
  setTemperature,
  chatProvider,
  setChatProvider,
  chatProviderCapabilities,
  providerApiKey,
  setProviderApiKey,
  ollamaBaseUrl,
  setOllamaBaseUrl,
  ollamaModels,
  fetchOllamaModels,
  selectedModel,
  setSelectedModel,
  modelList,
  canFetchModels,
  fetchModels,
  replyLengthLimit,
  setReplyLengthLimit,
  compressThreshold,
  setCompressThreshold,
  samplers,
  setSamplers,
  roleplayStyle,
  setRoleplayStyle,
  onLogout,
}) => {
  const isOllama = chatProviderCapabilities.requiresBaseUrl;

  // Blank input = unset = the provider's own default.
  const samplerInput = (key: keyof SamplerSettings, step: string, placeholder: string, min?: string, max?: string) => (
    <TextInput
      type="number"
      step={step}
      min={min}
      max={max}
      value={samplers[key] ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        const next = { ...samplers };
        if (raw === "" || Number.isNaN(Number(raw))) delete next[key];
        else next[key] = Number(raw);
        setSamplers(next);
      }}
      placeholder={placeholder}
      className="w-40"
    />
  );
  const updateStyle = (patch: Partial<RoleplayStyle>) => setRoleplayStyle({ ...roleplayStyle, ...patch });

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <div className="p-5 flex flex-col gap-3">
          <SettingsCardHeader title="Provider" hint="Chat and image generation providers can be set independently" />
          <ProviderPicker providers={CHAT_PROVIDER_META} value={chatProvider} onChange={setChatProvider} />
        </div>

        {chatProviderCapabilities.requiresApiKey && (
          <SettingsRow label="API key" hint="Stored encrypted, only on this device.">
            <TextInput
              type="password"
              value={providerApiKey}
              onChange={(e) => setProviderApiKey(e.target.value)}
              placeholder="Paste your API key here..."
            />
          </SettingsRow>
        )}

        {chatProviderCapabilities.requiresApiKey && (
          <SettingsRow label="Log out" hint="Clears the saved API key for this provider on this device - you'll need to re-enter it to use the app again.">
            <Button
              type="button"
              variant="outline"
              onClick={onLogout}
              className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            >
              Log out
            </Button>
          </SettingsRow>
        )}

        {isOllama && (
          <SettingsRow label="Ollama server URL" hint="Ollama's OpenAI-compatible endpoint - no API key needed.">
            <TextInput
              type="text"
              value={ollamaBaseUrl}
              onChange={(e) => setOllamaBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
            />
          </SettingsRow>
        )}

        {isOllama ? (
          <SettingsRow
            label="Model"
            hint={
              <Button
                type="button"
                variant="link"
                onClick={fetchOllamaModels}
                className="h-auto p-0 text-xs text-primary hover:text-primary-hover no-underline hover:no-underline"
              >
                Fetch installed models
              </Button>
            }
          >
            <TextInput
              type="text"
              list="ollama-model-options"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder="e.g. llama3.1"
            />
            <datalist id="ollama-model-options">
              {ollamaModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </SettingsRow>
        ) : (
          <SettingsRow
            label="Model"
            hint={
              canFetchModels ? (
                <Button
                  type="button"
                  variant="link"
                  onClick={fetchModels}
                  className="h-auto p-0 text-xs text-primary hover:text-primary-hover no-underline hover:no-underline"
                >
                  Fetch available models
                </Button>
              ) : undefined
            }
          >
            <Select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {modelList.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </Select>
          </SettingsRow>
        )}
      </SettingsCard>

      <SettingsCard>
        <SettingsRow label="Creativity" hint="Temperature" align="start">
          <div className="flex justify-between text-xs text-subtle mb-2">
            <span>Precise</span>
            <span className="text-foreground font-semibold tabular-nums">{temperature.toFixed(1)}</span>
            <span>Creative</span>
          </div>
          <Slider value={temperature} min={0} max={1} step={0.1} onChange={setTemperature} />
        </SettingsRow>

        <SettingsRow
          label="Reply length target"
          hint="Characters. The model finishes its thought within this budget instead of being cut off. 0 = no target."
          align="start"
        >
          <TextInput
            type="number"
            min="0"
            step="50"
            value={replyLengthLimit}
            onChange={(e) => setReplyLengthLimit(Number(e.target.value))}
            placeholder="0 for no limit"
            className="w-40"
          />
        </SettingsRow>

        <SettingsRow
          label="Auto-compress history"
          hint="Messages. Once the chat has this many messages, the oldest half are summarized into one pinned note. 0 = disabled."
          align="start"
        >
          <TextInput
            type="number"
            min="0"
            step="10"
            value={compressThreshold}
            onChange={(e) => setCompressThreshold(Number(e.target.value))}
            placeholder="0 to disable"
            className="w-40"
          />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader
            title="Advanced sampling"
            hint={`Leave blank to use the provider's default. ${SAMPLER_SUPPORT[chatProvider] || DEFAULT_SAMPLER_SUPPORT}`}
          />
        </div>
        <SettingsRow label="Top P" hint="0-1. Lower keeps word choice to the most likely options." align="start">
          {samplerInput("topP", "0.05", "default", "0", "1")}
        </SettingsRow>
        <SettingsRow label="Top K" hint="Only sample from the K most likely next words." align="start">
          {samplerInput("topK", "1", "default", "1")}
        </SettingsRow>
        <SettingsRow label="Frequency penalty" hint="Discourages repeating the same words and stock phrases. Try 0.2-0.5." align="start">
          {samplerInput("frequencyPenalty", "0.1", "0", "-2", "2")}
        </SettingsRow>
        <SettingsRow label="Presence penalty" hint="Nudges the model toward new topics instead of circling back." align="start">
          {samplerInput("presencePenalty", "0.1", "0", "-2", "2")}
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader title="Roleplay style" hint="Rules added to every character's prompt, so you don't have to repeat them in each one." />
        </div>
        <SettingsRow label="Narration point of view" hint="Any = let each character's own prompt decide." align="start">
          <SegmentedControl value={roleplayStyle.pov} onChange={(v) => updateStyle({ pov: v as RoleplayPov })} options={POV_OPTIONS} />
        </SettingsRow>
        <SettingsRow label="Actions in *asterisks*" hint="Narration and actions in asterisks, dialogue in plain text." align="start">
          <ToggleSwitch checked={roleplayStyle.actionsInAsterisks} onChange={(v) => updateStyle({ actionsInAsterisks: v })} />
        </SettingsRow>
        <SettingsRow label="Never speak for me" hint="Characters won't write your character's dialogue, actions or decisions." align="start">
          <ToggleSwitch checked={roleplayStyle.neverSpeakForUser} onChange={(v) => updateStyle({ neverSpeakForUser: v })} />
        </SettingsRow>
        <SettingsRow label="Time awareness" hint="Tell characters the current date/time and how long you were away, so they can react to it." align="start">
          <ToggleSwitch checked={roleplayStyle.timeAwareness} onChange={(v) => updateStyle({ timeAwareness: v })} />
        </SettingsRow>
        <SettingsRow label="Extra rules" hint="Anything else every character should follow." align="start">
          <TextArea
            value={roleplayStyle.customInstructions}
            onChange={(e) => updateStyle({ customInstructions: e.target.value })}
            placeholder="e.g. Keep replies under three paragraphs. Use British spelling."
            className="resize-none min-h-[80px]"
          />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
};

export default TextModelSettings;
