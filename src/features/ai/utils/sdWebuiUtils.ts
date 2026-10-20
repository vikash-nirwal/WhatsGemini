import { appendCharacterImages } from "./imageProcessing";
import { getStoredValue } from "./settings";
import { LocalImageSettings, SDImageParams } from "../../../types";
import { applyLocalImageSettings } from "./localImageSettings";
import {
  LS_SD_WEBUI_API_URL,
  DEFAULT_SD_WEBUI_API_URL,
  LS_SD_WEBUI_REF_MODE,
  DEFAULT_SD_WEBUI_REF_MODE,
  LS_SD_WEBUI_DENOISING,
  DEFAULT_SD_WEBUI_DENOISING,
  LS_SD_WEBUI_CONTROLNET_MODEL,
  DEFAULT_SD_WEBUI_CONTROLNET_MODEL,
  LS_SD_WEBUI_MODEL,
  DEFAULT_SD_WEBUI_MODEL,
  LS_SD_WEBUI_BATCH_SIZE,
  DEFAULT_SD_WEBUI_BATCH_SIZE,
  LS_IMAGE_RESOLUTION,
  DEFAULT_IMAGE_RESOLUTION,
} from "../../../utils/constants";

export const generateSDImage = async (
  derivedImagePrompt: string,
  derivedParams: SDImageParams,
  characterImages?: string[],
  characterName?: string,
  signal?: AbortSignal,
  // The character's own seed, LoRA, reference mode and face model (#40).
  localSettings?: LocalImageSettings
): Promise<string[]> => {
  const generatedImages: string[] = [];
  ({ prompt: derivedImagePrompt, params: derivedParams } = applyLocalImageSettings(derivedImagePrompt, derivedParams, localSettings));

  const sdApiUrl = getStoredValue(LS_SD_WEBUI_API_URL, DEFAULT_SD_WEBUI_API_URL);
  const refMode = localSettings?.referenceMode || getStoredValue<string>(LS_SD_WEBUI_REF_MODE, DEFAULT_SD_WEBUI_REF_MODE);
  const denoising = getStoredValue(LS_SD_WEBUI_DENOISING, DEFAULT_SD_WEBUI_DENOISING, parseFloat);
  const controlnetModel = getStoredValue(LS_SD_WEBUI_CONTROLNET_MODEL, DEFAULT_SD_WEBUI_CONTROLNET_MODEL);
  const sdModel = getStoredValue(LS_SD_WEBUI_MODEL, DEFAULT_SD_WEBUI_MODEL);
  const batchSize = getStoredValue(LS_SD_WEBUI_BATCH_SIZE, DEFAULT_SD_WEBUI_BATCH_SIZE, parseInt);

  const resolution = getStoredValue(LS_IMAGE_RESOLUTION, DEFAULT_IMAGE_RESOLUTION);
  const [widthStr, heightStr] = resolution.split('x');
  const width = parseInt(widthStr) || 512;
  const height = parseInt(heightStr) || 512;

  // Extract character image if reference mode is used
  let refImageBase64 = null;
  if (refMode !== "none" && characterImages && characterImages.length > 0) {
    const resolvedImages = await appendCharacterImages(characterImages);
    if (resolvedImages.length > 0) {
      refImageBase64 = resolvedImages[0].data;
    }
  }

  // An explicit face model wins; otherwise guess it from the first name.
  const reactorFaceModel = localSettings?.reactorFaceModel || (characterName ? `${characterName.split(' ')[0].toLowerCase()}` : "elena");

  let endpoint = '/sdapi/v1/txt2img';
  const payload: any = {
    prompt: derivedImagePrompt,
    negative_prompt: "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
    width: derivedParams.width || width,
    height: derivedParams.height || height,
    steps: derivedParams.steps || 20,
    sampler_name: derivedParams.sampler_name || "Euler a",
    batch_size: batchSize,
  };
  
  if (derivedParams.cfg_scale !== undefined) payload.cfg_scale = derivedParams.cfg_scale;
  if (derivedParams.seed !== undefined) payload.seed = derivedParams.seed;

  if (sdModel) {
    payload.override_settings = {
      sd_model_checkpoint: sdModel
    };
  }

  if (refImageBase64) {
    if (refMode === "img2img") {
      endpoint = '/sdapi/v1/img2img';
      payload.init_images = [refImageBase64];
      payload.denoising_strength = denoising;
    } else if (refMode === "controlnet") {
      payload.alwayson_scripts = {
        controlnet: {
          args: [
            {
              input_image: refImageBase64,
              model: controlnetModel,
              enabled: true
            }
          ]
        }
      };
    } else if (refMode === "reactor") {
      payload.alwayson_scripts = {
        reactor: {
          args: [
             refImageBase64, // 0: img
             true, // 1: Enable ReActor
             '0', // 2: Comma separated face number(s) from swap-source image
             '0', // 3: Comma separated face number(s) for target image
             'inswapper_128.onnx', // 4: model path
             'CodeFormer', // 5: Restore Face: None; CodeFormer; GFPGAN
             1, // 6: Restore visibility value
             true, // 7: Restore face -> Upscale
             'None', // 8: Upscaler
             1.5, // 9: Upscaler scale value
             1, // 10: Upscaler visibility
             false, // 11: Swap in source image
             true, // 12: Swap in generated image
             1, // 13: Console Log Level
             0, // 14: Gender Detection (Source)
             0, // 15: Gender Detection (Target)
             false, // 16: Save the original image(s)
             0.8, // 17: CodeFormer Weight
             false, // 18: Source Image Hash Check
             false, // 19: Target Image Hash Check
             "CPU", // 20: CPU or CUDA
             true, // 21: Face Mask Correction
             1, // 22: Select Source
             `${reactorFaceModel}.safetensors`, // 23: Filename of the face model
             `C:\\PATH_TO_FACES_IMAGES`, // 24: Path to faces
             null, // 25: skip it for API
             true, // 26: Randomly select an image
             true, // 27: Force Upscale
             0.6, // 28: Face Detection Threshold
             1 // 29: Maximum number of faces to detect
          ]
        }
      };
    }
  }

  const response = await fetch(`${sdApiUrl.replace(/\/$/, '')}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    throw new Error(`SD WebUI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.images && data.images.length > 0) {
    for (const base64d of data.images) {
      generatedImages.push(`data:image/png;base64,${base64d}`);
    }
  } else {
    throw new Error("No images returned from SD WebUI");
  }

  return generatedImages;
};
