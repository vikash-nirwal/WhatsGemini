// Background life on this device (#199): statuses, their own talk, life
// events, rumors and the rest can run on the free in-browser model (#55),
// keeping your paid key for the chats themselves. Off unless you pick a
// model; kept on this device.

export const LS_BACKGROUND_ON_DEVICE = "background_on_device";

// Smallest first: background writing is short, and these download fastest.
export const ON_DEVICE_MODELS = ["Llama-3.2-1B-Instruct-q4f16_1-MLC", "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", "gemma-2-2b-it-q4f16_1-MLC", "Llama-3.2-3B-Instruct-q4f16_1-MLC"];

export const onDeviceModel = (): string | undefined => {
  try {
    const model = localStorage.getItem(LS_BACKGROUND_ON_DEVICE) || "";
    return ON_DEVICE_MODELS.includes(model) ? model : undefined;
  } catch {
    return undefined;
  }
};

export const setOnDeviceModel = (model: string | undefined) => {
  try {
    if (model) localStorage.setItem(LS_BACKGROUND_ON_DEVICE, model);
    else localStorage.removeItem(LS_BACKGROUND_ON_DEVICE);
  } catch {
    // Only a convenience.
  }
};
