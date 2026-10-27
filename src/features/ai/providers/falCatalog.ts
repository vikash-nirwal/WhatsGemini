// fal.ai's own model list (the user's ask, 2026-10-27): rather than the few
// image models the app knows by heart, every text-to-image and image-editing
// model fal offers, from its public models API (api.fal.ai/v1/models, which
// allows calls from the browser). A model picked from it is set up from its
// own input schema: where reference photos go, and how the size is given.

export const FAL_MODELS_API = "https://api.fal.ai/v1/models";
const LS_CATALOG = "fal_model_catalog";
const LS_CUSTOM = "fal_custom_models";
const CATALOG_FOR_MS = 24 * 60 * 60 * 1000;
export const FALLBACK_TEXT_ENDPOINT = "fal-ai/bytedance/seedream/v4/text-to-image";

export type FalSizeStyle = "image_size" | "aspect_ratio" | "resolution_mode" | "none";

export interface FalModelSetup {
  label: string;
  referenceEndpoint: string;
  referenceField: string;
  maxReferences: number;
  referenceSize: FalSizeStyle;
  textEndpoint: string;
  textSize: FalSizeStyle;
}

export interface FalCatalogEntry {
  id: string;
  name: string;
  category: "text-to-image" | "image-to-image";
  description: string;
}

const auth = (apiKey?: string): HeadersInit => (apiKey ? { Authorization: `Key ${apiKey}` } : {});

const read = <T,>(key: string): T | undefined => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Only a convenience: it's fetched again next time.
  }
};

// Every active text-to-image and image-to-image model, a page of 100 at a
// time; kept for a day.
export const listFalImageModels = async (apiKey?: string, now = Date.now(), fetchFn: typeof fetch = fetch): Promise<FalCatalogEntry[]> => {
  const cached = read<{ at: number; models: FalCatalogEntry[] }>(LS_CATALOG);
  if (cached && now - cached.at < CATALOG_FOR_MS && cached.models.length) return cached.models;
  const models: FalCatalogEntry[] = [];
  for (const category of ["text-to-image", "image-to-image"] as const) {
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await fetchFn(`${FAL_MODELS_API}?category=${category}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: auth(apiKey) });
      if (!res.ok) throw new Error(res.status === 429 ? "fal.ai is busy; try again in a minute." : `fal.ai's model list didn't load (${res.status}).`);
      const body = await res.json();
      for (const m of body.models || []) {
        if (m?.metadata?.status && m.metadata.status !== "active") continue;
        models.push({ id: m.endpoint_id, name: m.metadata?.display_name || m.endpoint_id, category, description: (m.metadata?.description || "").slice(0, 200) });
      }
      if (!body.has_more || !body.next_cursor) break;
      cursor = body.next_cursor;
    }
  }
  write(LS_CATALOG, { at: now, models });
  return models;
};

type Schema = { properties?: Record<string, { type?: string; maxItems?: number }>; required?: string[] };

// The input schema of one endpoint, from the same API.
const inputSchema = async (id: string, apiKey?: string, fetchFn: typeof fetch = fetch): Promise<Schema | undefined> => {
  const res = await fetchFn(`${FAL_MODELS_API}?endpoint_id=${encodeURIComponent(id)}&expand=openapi-3.0`, { headers: auth(apiKey) });
  if (!res.ok) throw new Error(res.status === 429 ? "fal.ai is busy; try again in a minute." : `Couldn't read ${id} from fal.ai (${res.status}).`);
  const schemas = (await res.json())?.models?.[0]?.openapi?.components?.schemas || {};
  const key = Object.keys(schemas).find((k) => k.endsWith("Input"));
  return key ? schemas[key] : undefined;
};

const sizeStyleOf = (schema: Schema | undefined): FalSizeStyle => {
  const p = schema?.properties || {};
  return "image_size" in p ? "image_size" : "aspect_ratio" in p ? "aspect_ratio" : "resolution_mode" in p ? "resolution_mode" : "none";
};

const REFERENCE_FIELDS = ["image_urls", "reference_image_urls", "image_url", "reference_image_url", "input_image_url"];

// The text-to-image models an edit model may go with, likeliest first:
// fal names them alike (nano-banana-pro/edit and nano-banana-pro).
export const textSiblingsOf = (id: string) =>
  Array.from(new Set([id.replace(/\/edit$/, ""), id.replace(/\/edit$/, "/text-to-image"), id.replace(/\/image-to-image$/, "/text-to-image"), id.replace(/\/image-to-image$/, "")])).filter((c) => c !== id);

// How to call a model, from its schema (and, for an edit model that needs a
// photo, the text-to-image model that goes with it). `editModel`: fal lists
// it under image-to-image. Their schemas often mark only the prompt as
// required, though the model fails without a photo ("Field required", the
// user's report 2026-10-27), so the category counts too.
export const setupFromSchema = (id: string, name: string, schema: Schema | undefined, text?: { id: string; schema: Schema | undefined }, editModel = false): FalModelSetup => {
  const props = schema?.properties || {};
  const field = REFERENCE_FIELDS.find((f) => f in props);
  const many = field ? props[field]?.type === "array" : false;
  const needsPhoto = Boolean(field && (editModel || schema?.required?.includes(field)));
  const own: FalSizeStyle = sizeStyleOf(schema);
  return {
    label: name,
    referenceEndpoint: id,
    referenceField: field || "image_url",
    maxReferences: field ? (many ? Math.min(props[field]?.maxItems || 4, 10) : 1) : 0,
    referenceSize: own,
    textEndpoint: needsPhoto ? text?.id || FALLBACK_TEXT_ENDPOINT : id,
    textSize: needsPhoto ? (text ? sizeStyleOf(text.schema) : "image_size") : own,
  };
};

export const customFalModels = (): Record<string, FalModelSetup> => read<Record<string, FalModelSetup>>(LS_CUSTOM) || {};

// Sets up a model picked from the list and keeps it for the adapter.
export const addFalModel = async (entry: FalCatalogEntry, catalog: FalCatalogEntry[], apiKey?: string, fetchFn: typeof fetch = fetch): Promise<FalModelSetup> => {
  const schema = await inputSchema(entry.id, apiKey, fetchFn);
  const props = schema?.properties || {};
  const field = REFERENCE_FIELDS.find((f) => f in props);
  const editModel = entry.category === "image-to-image";
  let text: { id: string; schema: Schema | undefined } | undefined;
  if (field && (editModel || schema?.required?.includes(field))) {
    const match = textSiblingsOf(entry.id).find((c) => catalog.some((m) => m.id === c && m.category === "text-to-image"));
    if (match) text = { id: match, schema: await inputSchema(match, apiKey, fetchFn).catch(() => undefined) };
  }
  const setup = setupFromSchema(entry.id, entry.name, schema, text, editModel);
  write(LS_CUSTOM, { ...customFalModels(), [entry.id]: setup });
  return setup;
};
