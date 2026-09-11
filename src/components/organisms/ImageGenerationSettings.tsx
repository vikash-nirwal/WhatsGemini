import React from 'react';
import { cn } from '../../utils/cn';
import { useColorTheme } from '../../hooks/useColorTheme';
import { IMAGE_RESOLUTIONS, GEMINI_IMAGE_SIZES, GEMINI_IMAGE_SIZE_SUPPORTED_MODELS } from '../../utils/constants';
import { TextInput, TextArea, Select, Slider } from "src/components/molecules/form-controls";
import { IMAGE_PROVIDER_META } from '../../features/ai/providers/registry';
import { Button } from 'src/components/atoms/button';
import { SettingsCard, SettingsCardHeader, SettingsRow } from 'src/components/molecules/settings-card';
import { ProviderPicker } from 'src/components/molecules/ProviderPicker';
import { SegmentedControl } from 'src/components/molecules/SegmentedControl';
import { NumberStepper } from 'src/components/molecules/NumberStepper';

interface ImageGenerationSettingsProps {
  imageProvider: string;
  setImageProvider: (provider: string) => void;
  openaiApiKey: string;
  setOpenaiApiKey: (key: string) => void;
  sdWebuiApiUrl: string;
  setSdWebuiApiUrl: (url: string) => void;
  sdWebuiBatchSize: number;
  setSdWebuiBatchSize: (size: number) => void;
  fetchSdModels: () => void;
  sdWebuiModel: string;
  setSdWebuiModel: (model: string) => void;
  sdWebuiModels: { title: string; model_name: string }[];
  sdWebuiRefMode: string;
  setSdWebuiRefMode: (mode: string) => void;
  sdWebuiDenoising: number;
  setSdWebuiDenoising: (denoising: number) => void;
  sdWebuiControlnetModel: string;
  setSdWebuiControlnetModel: (model: string) => void;
  imageModel: string;
  setImageModel: (model: string) => void;
  imageModelList: { value: string; label: string }[];
  openaiImageModelList: { value: string; label: string }[];
  imageGenPrompt: string;
  setImageGenPrompt: (prompt: string) => void;
  imageResolution: string;
  setImageResolution: (res: string) => void;
  geminiImageSize: string;
  setGeminiImageSize: (size: string) => void;
  portraitSaveSize: string;
  setPortraitSaveSize: (size: string) => void;
  imageSaveDirName: string;
  handleSelectDirectory: () => void;
  LS_SD_WEBUI_MODEL: string;
}

const REF_MODE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "img2img", label: "img2img" },
  { value: "controlnet", label: "ControlNet" },
  { value: "reactor", label: "Face swap" },
];

const ImageGenerationSettings: React.FC<ImageGenerationSettingsProps> = ({
  imageProvider,
  setImageProvider,
  openaiApiKey,
  setOpenaiApiKey,
  sdWebuiApiUrl,
  setSdWebuiApiUrl,
  sdWebuiBatchSize,
  setSdWebuiBatchSize,
  fetchSdModels,
  sdWebuiModel,
  setSdWebuiModel,
  sdWebuiModels,
  sdWebuiRefMode,
  setSdWebuiRefMode,
  sdWebuiDenoising,
  setSdWebuiDenoising,
  sdWebuiControlnetModel,
  setSdWebuiControlnetModel,
  imageModel,
  setImageModel,
  imageModelList,
  openaiImageModelList,
  imageGenPrompt,
  setImageGenPrompt,
  imageResolution,
  setImageResolution,
  geminiImageSize,
  setGeminiImageSize,
  portraitSaveSize,
  setPortraitSaveSize,
  imageSaveDirName,
  handleSelectDirectory,
  LS_SD_WEBUI_MODEL,
}) => {
  const { is } = useColorTheme();
  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <div className="p-5 flex flex-col gap-3">
          <SettingsCardHeader title="Provider" hint="Chat and image providers are set independently" />
          <ProviderPicker providers={IMAGE_PROVIDER_META} value={imageProvider} onChange={setImageProvider} />
        </div>

        {imageProvider === 'sdwebui' ? (
          <>
            <SettingsRow label="API URL" hint="Your local Forge / WebUI instance.">
              <TextInput
                type="text"
                value={sdWebuiApiUrl}
                onChange={(e) => setSdWebuiApiUrl(e.target.value)}
                placeholder="http://127.0.0.1:7860"
              />
            </SettingsRow>

            <SettingsRow
              label="SD model"
              hint={
                <Button
                  type="button"
                  variant="link"
                  onClick={fetchSdModels}
                  className="h-auto p-0 text-xs text-primary hover:text-primary-hover no-underline hover:no-underline"
                >
                  Refresh models
                </Button>
              }
            >
              <Select
                value={sdWebuiModel}
                onChange={(e) => {
                  setSdWebuiModel(e.target.value);
                  localStorage.setItem(LS_SD_WEBUI_MODEL, e.target.value);
                }}
              >
                <option value="">Default (From SD WebUI)</option>
                {sdWebuiModels.map((m) => (
                  <option key={m.title} value={m.title}>
                    {m.model_name}
                  </option>
                ))}
              </Select>
            </SettingsRow>

            <SettingsRow label="Images per request" hint="1-8. Higher counts take longer.">
              <NumberStepper value={sdWebuiBatchSize} min={1} max={8} onChange={setSdWebuiBatchSize} />
            </SettingsRow>

            <SettingsRow label="Reference image mode" hint="How the character's appearance images are used." align="start">
              <SegmentedControl value={sdWebuiRefMode} onChange={setSdWebuiRefMode} options={REF_MODE_OPTIONS} />

              {sdWebuiRefMode === 'reactor' && (
                <div className="mt-3">
                  <p className="text-xs text-primary font-medium mb-1">
                    ReActor requires the "sd-webui-reactor-sfw" extension installed in Forge.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This passes the character image natively to inswapper to perform a highly accurate
                    post-process face swap over the generated subject.
                  </p>
                </div>
              )}

              {sdWebuiRefMode === 'img2img' && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-subtle mb-2">
                    <span>Keep the reference</span>
                    <span className="text-foreground font-semibold tabular-nums">{sdWebuiDenoising}</span>
                    <span>Reimagine</span>
                  </div>
                  <Slider value={sdWebuiDenoising} min={0} max={1} step={0.05} onChange={setSdWebuiDenoising} />
                </div>
              )}

              {sdWebuiRefMode === 'controlnet' && (
                <div className="mt-3">
                  <TextInput
                    type="text"
                    value={sdWebuiControlnetModel}
                    onChange={(e) => setSdWebuiControlnetModel(e.target.value)}
                    placeholder="e.g. ip-adapter_sd15"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Make sure this model is installed in your Forge/WebUI.
                  </p>
                </div>
              )}
            </SettingsRow>
          </>
        ) : imageProvider === 'openai' ? (
          <>
            <SettingsRow label="API key" hint="Stored encrypted, only on this device.">
              <TextInput
                type="password"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="Paste your API key here..."
              />
            </SettingsRow>

            <SettingsRow label="Model" hint={'Used when "send pic" or similar is queried.'}>
              <Select value={imageModel} onChange={(e) => setImageModel(e.target.value)}>
                {openaiImageModelList.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </Select>
            </SettingsRow>
          </>
        ) : (
          <SettingsRow label="Model" hint={'Used when "send pic" or similar is queried.'}>
            <Select value={imageModel} onChange={(e) => setImageModel(e.target.value)}>
              {imageModelList.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </Select>
          </SettingsRow>
        )}
      </SettingsCard>

      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader title="Output" />
        </div>

        <SettingsRow label="Base prompt" hint="Prepended whenever an image is requested." align="start">
          <TextArea
            value={imageGenPrompt}
            onChange={(e) => setImageGenPrompt(e.target.value)}
            placeholder="e.g. Create a high quality, detailed image..."
          />
        </SettingsRow>

        {imageProvider === 'sdwebui' && (
          <SettingsRow label="Default resolution">
            <SegmentedControl
              value={imageResolution}
              onChange={setImageResolution}
              options={IMAGE_RESOLUTIONS.map((res) => ({ value: res, label: res }))}
            />
          </SettingsRow>
        )}

        {imageProvider === 'gemini' && GEMINI_IMAGE_SIZE_SUPPORTED_MODELS.includes(imageModel) && (
          <SettingsRow label="Image size" hint="Higher sizes cost more and take longer. Applies to this model's generations, including character portraits.">
            <SegmentedControl
              value={geminiImageSize}
              onChange={setGeminiImageSize}
              options={GEMINI_IMAGE_SIZES.map((size) => ({ value: size, label: size }))}
            />
          </SettingsRow>
        )}

        <SettingsRow label="Portrait save size" hint="Every character portrait - main avatar and emotion portraits alike, generated or uploaded - is resized to this before being saved, regardless of what resolution it came in at.">
          {(() => {
            const [w, h] = portraitSaveSize.split("x").map((n) => parseInt(n, 10) || 0);
            const clamp = (n: number) => Math.max(32, Math.min(2048, n));
            return (
              <div className="flex items-center gap-2">
                <TextInput
                  type="number"
                  min="32"
                  max="2048"
                  value={w}
                  onChange={(e) => setPortraitSaveSize(`${clamp(Number(e.target.value))}x${h}`)}
                  className="w-24"
                />
                <span className="text-muted-foreground text-sm">×</span>
                <TextInput
                  type="number"
                  min="32"
                  max="2048"
                  value={h}
                  onChange={(e) => setPortraitSaveSize(`${w}x${clamp(Number(e.target.value))}`)}
                  className="w-24"
                />
                <span className="text-xs text-subtle">px</span>
              </div>
            );
          })()}
        </SettingsRow>

        <SettingsRow label="Save generated images to" hint="Browsers may ask you to re-approve write access when you return.">
          <div className="flex items-center gap-2.5">
            <div className={cn("flex-1 h-10 rounded-lg bg-background border border-input flex items-center px-3 text-sm truncate", is("aurora") && "surface-sunken")}>
              {imageSaveDirName}
            </div>
            <Button onClick={handleSelectDirectory} variant="outline" className="whitespace-nowrap">
              Change folder
            </Button>
          </div>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
};

export default ImageGenerationSettings;
