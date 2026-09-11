import React, { useState, useEffect, useCallback } from "react";
import Modal from "src/components/molecules/Modal";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { TextInput, TextArea, Select, FieldLabel, Slider } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import {
  LS_IMAGE_MODEL,
  DEFAULT_IMAGE_MODEL,
  LS_IMAGE_GEN_PROMPT,
  DEFAULT_IMAGE_GEN_PROMPT,
  LS_IMAGE_RESOLUTION,
  DEFAULT_IMAGE_RESOLUTION,
  IMAGE_RESOLUTIONS,
  LS_USE_SD_WEBUI,
  LS_SD_WEBUI_API_URL,
  DEFAULT_SD_WEBUI_API_URL,
  LS_SD_WEBUI_BATCH_SIZE,
  DEFAULT_SD_WEBUI_BATCH_SIZE,
  LS_SD_WEBUI_REF_MODE,
  DEFAULT_SD_WEBUI_REF_MODE,
  LS_SD_WEBUI_DENOISING,
  DEFAULT_SD_WEBUI_DENOISING,
  LS_SD_WEBUI_CONTROLNET_MODEL,
  DEFAULT_SD_WEBUI_CONTROLNET_MODEL,
  LS_SD_WEBUI_MODELS,
  LS_SD_WEBUI_MODEL,
  DEFAULT_SD_WEBUI_MODEL,
  imageModels,
} from "../../utils/constants";

import { useAppDispatch } from "../../store/hooks";
import {
  setImageModel as setGlobalImageModel,
  setImageGenPrompt as setGlobalImageGenPrompt,
  setImageResolution as setGlobalImageResolution,
  setUseSdWebui as setGlobalUseSdWebui,
  setSdWebuiApiUrl as setGlobalSdWebuiApiUrl,
  setSdWebuiBatchSize as setGlobalSdWebuiBatchSize,
  setSdWebuiRefMode as setGlobalSdWebuiRefMode,
  setSdWebuiDenoising as setGlobalSdWebuiDenoising,
  setSdWebuiControlnetModel as setGlobalSdWebuiControlnetModel,
  setSdWebuiModels as setGlobalSdWebuiModels,
  setSdWebuiModel as setGlobalSdWebuiModel
} from "../../features/settingsSlice";

interface ImageSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ImageSettingsModal: React.FC<ImageSettingsModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useAppDispatch();
  const [imageModelList, setImageModelList] = useState<{value: string, label: string}[]>(() => {
    return imageModels.map((m: string) => ({ value: m, label: m }));
  });

  const [imageModel, setImageModel] = useState(() => localStorage.getItem(LS_IMAGE_MODEL) || DEFAULT_IMAGE_MODEL);
  const [imageGenPrompt, setImageGenPrompt] = useState(() => localStorage.getItem(LS_IMAGE_GEN_PROMPT) || DEFAULT_IMAGE_GEN_PROMPT);
  const [imageResolution, setImageResolution] = useState<string>(() => localStorage.getItem(LS_IMAGE_RESOLUTION) || DEFAULT_IMAGE_RESOLUTION);
  const [useSdWebui, setUseSdWebui] = useState<boolean>(() => localStorage.getItem(LS_USE_SD_WEBUI) === "true");
  const [sdWebuiApiUrl, setSdWebuiApiUrl] = useState<string>(() => localStorage.getItem(LS_SD_WEBUI_API_URL) || DEFAULT_SD_WEBUI_API_URL);
  const [sdWebuiBatchSize, setSdWebuiBatchSize] = useState<number>(() => parseInt(localStorage.getItem(LS_SD_WEBUI_BATCH_SIZE) || "1", 10) || DEFAULT_SD_WEBUI_BATCH_SIZE);
  const [sdWebuiRefMode, setSdWebuiRefMode] = useState<string>(() => localStorage.getItem(LS_SD_WEBUI_REF_MODE) || DEFAULT_SD_WEBUI_REF_MODE);
  const [sdWebuiDenoising, setSdWebuiDenoising] = useState<number>(() => parseFloat(localStorage.getItem(LS_SD_WEBUI_DENOISING) || String(DEFAULT_SD_WEBUI_DENOISING)));
  const [sdWebuiControlnetModel, setSdWebuiControlnetModel] = useState<string>(() => localStorage.getItem(LS_SD_WEBUI_CONTROLNET_MODEL) || DEFAULT_SD_WEBUI_CONTROLNET_MODEL);
  const [sdWebuiModels, setSdWebuiModels] = useState<{title: string, model_name: string}[]>(() => {
    const stored = localStorage.getItem(LS_SD_WEBUI_MODELS);
    return stored ? JSON.parse(stored) : [];
  });
  const [sdWebuiModel, setSdWebuiModel] = useState<string>(() => localStorage.getItem(LS_SD_WEBUI_MODEL) || DEFAULT_SD_WEBUI_MODEL);

  const fetchSdModels = useCallback(async () => {
    try {
      const response = await fetch(`${sdWebuiApiUrl.replace(/\/$/, "")}/sdapi/v1/sd-models`);
      if (!response.ok) throw new Error("Failed to fetch SD models");
      const data = await response.json();
      const mappedModels = data.map((m: any) => ({title: m.title, model_name: m.model_name}));
      setSdWebuiModels(mappedModels);
      localStorage.setItem(LS_SD_WEBUI_MODELS, JSON.stringify(mappedModels));
      dispatch(setGlobalSdWebuiModels(mappedModels));

      if (!sdWebuiModel || !mappedModels.find((m: any) => m.title === sdWebuiModel)) {
         setSdWebuiModel(mappedModels[0].title);
         localStorage.setItem(LS_SD_WEBUI_MODEL, mappedModels[0].title);
         dispatch(setGlobalSdWebuiModel(mappedModels[0].title));
      }
    } catch (error) {
      console.error("Error fetching SD models:", error);
    }
  }, [sdWebuiApiUrl, sdWebuiModel, dispatch]);

  useEffect(() => {
    const stored = localStorage.getItem(LS_IMAGE_MODEL);
    if (!stored) return;
    setImageModelList(prev => prev.some(m => m.value === stored) ? prev : [...prev, { value: stored, label: stored }]);
  }, []);

  useEffect(() => {
    if (useSdWebui && sdWebuiApiUrl) {
      fetchSdModels();
    }
  }, [useSdWebui, sdWebuiApiUrl, fetchSdModels]);

  useEffect(() => {
    if (isOpen) {
      localStorage.setItem(LS_IMAGE_MODEL, imageModel);
      dispatch(setGlobalImageModel(imageModel));
      localStorage.setItem(LS_IMAGE_GEN_PROMPT, imageGenPrompt);
      dispatch(setGlobalImageGenPrompt(imageGenPrompt));
      localStorage.setItem(LS_IMAGE_RESOLUTION, imageResolution);
      dispatch(setGlobalImageResolution(imageResolution));
      localStorage.setItem(LS_USE_SD_WEBUI, String(useSdWebui));
      dispatch(setGlobalUseSdWebui(useSdWebui));
      localStorage.setItem(LS_SD_WEBUI_API_URL, sdWebuiApiUrl);
      dispatch(setGlobalSdWebuiApiUrl(sdWebuiApiUrl));
      localStorage.setItem(LS_SD_WEBUI_BATCH_SIZE, String(sdWebuiBatchSize));
      dispatch(setGlobalSdWebuiBatchSize(sdWebuiBatchSize));
      localStorage.setItem(LS_SD_WEBUI_REF_MODE, sdWebuiRefMode);
      dispatch(setGlobalSdWebuiRefMode(sdWebuiRefMode));
      localStorage.setItem(LS_SD_WEBUI_DENOISING, String(sdWebuiDenoising));
      dispatch(setGlobalSdWebuiDenoising(sdWebuiDenoising));
      localStorage.setItem(LS_SD_WEBUI_CONTROLNET_MODEL, sdWebuiControlnetModel);
      dispatch(setGlobalSdWebuiControlnetModel(sdWebuiControlnetModel));
      localStorage.setItem(LS_SD_WEBUI_MODEL, sdWebuiModel);
      dispatch(setGlobalSdWebuiModel(sdWebuiModel));
    }
  }, [imageModel, imageGenPrompt, imageResolution, useSdWebui, sdWebuiApiUrl, sdWebuiBatchSize, sdWebuiRefMode, sdWebuiDenoising, sdWebuiControlnetModel, sdWebuiModel, isOpen, dispatch]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Image Generation Settings">
      <div className="flex flex-col gap-4 text-left p-1">
        <ToggleSwitch
          checked={useSdWebui}
          onChange={setUseSdWebui}
          label="Use Local/Remote SD WebUI Forge"
        />

        {useSdWebui ? (
          <>
            <div>
              <FieldLabel>SD WebUI Forge API URL</FieldLabel>
              <TextInput
                type="text"
                value={sdWebuiApiUrl}
                onChange={(e) => setSdWebuiApiUrl(e.target.value)}
                placeholder="http://127.0.0.1:7860"
              />
            </div>

            <div>
              <FieldLabel>Batch Size (Number of Images)</FieldLabel>
              <TextInput
                type="number"
                min="1"
                max="8"
                value={sdWebuiBatchSize}
                onChange={(e) => setSdWebuiBatchSize(parseInt(e.target.value, 10))}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-sm font-medium text-foreground">SD Model</label>
                <Button type="button" variant="link" onClick={fetchSdModels} className="h-auto p-0 text-xs text-primary hover:text-primary-hover no-underline hover:no-underline">
                  Refresh Models
                </Button>
              </div>
              <Select
                value={sdWebuiModel}
                onChange={(e) => {
                  setSdWebuiModel(e.target.value);
                  localStorage.setItem(LS_SD_WEBUI_MODEL, e.target.value);
                  dispatch(setGlobalSdWebuiModel(e.target.value));
                }}
              >
                <option value="">Default (From SD WebUI)</option>
                {sdWebuiModels.map((m) => (
                  <option key={m.title} value={m.title}>
                    {m.model_name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <FieldLabel>Reference Image Mode</FieldLabel>
              <Select value={sdWebuiRefMode} onChange={(e) => setSdWebuiRefMode(e.target.value)}>
                <option value="none">None (Text to Image only)</option>
                <option value="img2img">img2img API</option>
                <option value="controlnet">ControlNet (Alwayson Scripts)</option>
                <option value="reactor">Face Swap (ReActor Extension)</option>
              </Select>
            </div>

            {sdWebuiRefMode === "img2img" && (
              <div>
                <div className="flex justify-between text-sm text-muted-foreground mb-2">
                  <span>Denoising Strength</span>
                  <span className="font-mono text-xs">{sdWebuiDenoising}</span>
                </div>
                <Slider value={sdWebuiDenoising} min={0} max={1} step={0.05} onChange={setSdWebuiDenoising} />
              </div>
            )}

            {sdWebuiRefMode === "controlnet" && (
              <div>
                <FieldLabel>ControlNet Model Name</FieldLabel>
                <TextInput
                  type="text"
                  value={sdWebuiControlnetModel}
                  onChange={(e) => setSdWebuiControlnetModel(e.target.value)}
                  placeholder="e.g. ip-adapter_sd15"
                />
              </div>
            )}
          </>
        ) : (
          <div>
            <FieldLabel>Image Generation Model</FieldLabel>
            <Select value={imageModel} onChange={(e) => setImageModel(e.target.value)}>
              {imageModelList.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <FieldLabel>Base Prompt</FieldLabel>
          <TextArea
            value={imageGenPrompt}
            onChange={(e) => setImageGenPrompt(e.target.value)}
            placeholder="e.g. Create a high quality, detailed image..."
            className="min-h-[60px]"
          />
        </div>

        <div>
          <FieldLabel>Processing Resolution</FieldLabel>
          <Select value={imageResolution} onChange={(e) => setImageResolution(e.target.value)}>
            {IMAGE_RESOLUTIONS.map((res) => (
              <option key={res} value={res}>{res}</option>
            ))}
          </Select>
        </div>
      </div>
    </Modal>
  );
};

export default ImageSettingsModal;
