import React from 'react';
import { TextInput, Select, Slider } from '../ui/FormControls';
import { CHAT_PROVIDER_META } from '../../features/ai/providers/registry';
import { ProviderCapabilities } from '../../features/ai/providers/types';
import { Button } from '../ui/button';
import { SettingsCard, SettingsCardHeader, SettingsRow } from './SettingsCard';
import { ProviderPicker } from './ProviderPicker';

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
  replyLengthLimit: number;
  setReplyLengthLimit: (chars: number) => void;
  compressThreshold: number;
  setCompressThreshold: (threshold: number) => void;
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
  replyLengthLimit,
  setReplyLengthLimit,
  compressThreshold,
  setCompressThreshold,
  onLogout,
}) => {
  const isOllama = chatProviderCapabilities.requiresBaseUrl;

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
          <SettingsRow label="Model">
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
    </div>
  );
};

export default TextModelSettings;
