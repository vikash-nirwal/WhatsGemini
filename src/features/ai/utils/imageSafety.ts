import { AISafetySettings } from "../../../types";

// The safety settings for one picture. "Off for 18+ characters" becomes off
// only when the caller says everyone in the picture is an 18+ character
// (allAdults); a backdrop, a map or a portrait has no such cast and stays on.
// The adapter only sees on or off.
export const imageSafetyFor = (settings: AISafetySettings, adults = false): AISafetySettings => {
  if (settings.falSafetyChecker !== "adults") return settings;
  return { ...settings, falSafetyChecker: !adults };
};
