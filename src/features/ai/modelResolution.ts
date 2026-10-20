import { Character, SamplerSettings } from "../../types";
import { PROVIDER_CHAT_MODELS } from "../../utils/constants";
import type { SettingsState } from "../settingsSlice";

export type CharacterModelOverride = NonNullable<Character["modelOverride"]>;

export type TurnModelSettings = Pick<SettingsState, "chatProvider" | "selectedModel" | "temperature" | "samplers">;

export interface TurnModel {
  provider: string;
  model: string;
  temperature: number;
  samplers: SamplerSettings;
  overridden: boolean; // true when the character's own settings changed anything
}

// Ollama has no fixed model list (see PROVIDER_CHAT_MODELS), so it's named
// here. Checked against this rather than CHAT_PROVIDERS so this stays a pure
// module that tests can load without the provider SDKs.
const isKnownProvider = (id: string) => id === "ollama" || id in PROVIDER_CHAT_MODELS;

const definedOnly = (samplers?: SamplerSettings): SamplerSettings =>
  Object.fromEntries(Object.entries(samplers || {}).filter(([, v]) => v != null && !Number.isNaN(v)));

// Which provider, model, temperature and samplers a character's turn uses
// (#32): the character's modelOverride where it sets something, the app's
// text model settings otherwise.
//
// A provider override without a model takes that provider's first listed
// model, unless it's the app's own provider, which keeps the app's model.
// An override that can't name a model (Ollama with no model typed in) or
// names an unknown provider is ignored rather than sent somewhere broken.
// Samplers merge key by key, so a character can change just Top P.
export const resolveTurnModel = (settings: TurnModelSettings, character?: Pick<Character, "modelOverride">): TurnModel => {
  const override = character?.modelOverride;
  let provider = settings.chatProvider;
  let model = settings.selectedModel;

  const wantedProvider = override?.provider?.trim();
  const wantedModel = override?.model?.trim();
  if (wantedProvider && wantedProvider !== settings.chatProvider && isKnownProvider(wantedProvider)) {
    const fallbackModel = PROVIDER_CHAT_MODELS[wantedProvider]?.[0];
    if (wantedModel || fallbackModel) {
      provider = wantedProvider;
      model = wantedModel || fallbackModel!;
    }
  } else if (wantedModel && (!wantedProvider || wantedProvider === settings.chatProvider)) {
    model = wantedModel;
  }

  const temperature = override?.temperature != null && !Number.isNaN(override.temperature) ? override.temperature : settings.temperature;
  const ownSamplers = definedOnly(override?.samplers);
  const samplers = { ...settings.samplers, ...ownSamplers };

  const overridden =
    provider !== settings.chatProvider ||
    model !== settings.selectedModel ||
    temperature !== settings.temperature ||
    Object.keys(ownSamplers).length > 0;
  return { provider, model, temperature, samplers, overridden };
};

// True when an override has nothing in it, so the editor can drop it
// instead of saving an empty object.
export const isEmptyModelOverride = (override?: CharacterModelOverride): boolean =>
  !override ||
  (!override.provider?.trim() && !override.model?.trim() && override.temperature == null && Object.keys(definedOnly(override.samplers)).length === 0);

// What the editor saves: strings trimmed, blank fields and unset samplers
// dropped, and undefined when nothing is left, so a character without an
// override never carries an empty object.
export const cleanModelOverride = (override?: CharacterModelOverride): CharacterModelOverride | undefined => {
  if (isEmptyModelOverride(override)) return undefined;
  const cleaned: CharacterModelOverride = {};
  const provider = override!.provider?.trim();
  const model = override!.model?.trim();
  const samplers = definedOnly(override!.samplers);
  if (provider) cleaned.provider = provider;
  if (model) cleaned.model = model;
  if (override!.temperature != null && !Number.isNaN(override!.temperature)) cleaned.temperature = override!.temperature;
  if (Object.keys(samplers).length > 0) cleaned.samplers = samplers;
  return cleaned;
};
