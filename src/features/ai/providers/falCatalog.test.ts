import { addFalModel, customFalModels, listFalImageModels, setupFromSchema } from "./falCatalog";

beforeEach(() => localStorage.clear());

const page = (models: object[], more = false, cursor?: string) => ({ ok: true, status: 200, json: async () => ({ models, has_more: more, next_cursor: cursor }) });

test("the list pages through both categories and keeps it for a day", async () => {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(url);
    if (url.includes("text-to-image") && !url.includes("cursor")) return page([{ endpoint_id: "a/t2i", metadata: { display_name: "A", status: "active" } }], true, "C1");
    if (url.includes("text-to-image")) return page([{ endpoint_id: "b/t2i", metadata: { display_name: "B", status: "deprecated" } }]);
    return page([{ endpoint_id: "a/edit", metadata: { display_name: "A edit", status: "active" } }]);
  }) as unknown as typeof fetch;
  const list = await listFalImageModels("key", 1000, fetchFn);
  expect(list.map((m) => [m.id, m.category])).toEqual([["a/t2i", "text-to-image"], ["a/edit", "image-to-image"]]);
  expect(calls[1]).toContain("cursor=C1");
  await listFalImageModels("key", 2000, fetchFn);
  expect(calls).toHaveLength(3);
});

test("a model is set up from its schema", () => {
  const edit = setupFromSchema("x/edit", "X edit", { properties: { prompt: {}, image_urls: { type: "array", maxItems: 6 }, aspect_ratio: {} }, required: ["prompt", "image_urls"] }, { id: "x", schema: { properties: { image_size: {} } } });
  expect(edit).toMatchObject({ referenceEndpoint: "x/edit", referenceField: "image_urls", maxReferences: 6, referenceSize: "aspect_ratio", textEndpoint: "x", textSize: "image_size" });
  const t2i = setupFromSchema("y", "Y", { properties: { prompt: {}, image_size: {} }, required: ["prompt"] });
  expect(t2i).toMatchObject({ maxReferences: 0, textEndpoint: "y", textSize: "image_size" });
  const optional = setupFromSchema("z", "Z", { properties: { prompt: {}, image_url: { type: "string" } }, required: ["prompt"] });
  expect(optional).toMatchObject({ referenceField: "image_url", maxReferences: 1, textEndpoint: "z", textSize: "none" });
  // An image-to-image model whose schema marks only the prompt required
  // still needs a photo (Nano Banana Pro edit, 2026-10-27).
  const nano = setupFromSchema("n/edit", "N edit", { properties: { prompt: {}, image_urls: { type: "array" }, aspect_ratio: {} }, required: ["prompt"] }, { id: "n", schema: { properties: { aspect_ratio: {} } } }, true);
  expect(nano).toMatchObject({ textEndpoint: "n", textSize: "aspect_ratio", referenceField: "image_urls" });
});

test("a picked edit model finds its text-to-image partner and is kept", async () => {
  const schemaOf = (props: object, required: string[]) => ({ ok: true, status: 200, json: async () => ({ models: [{ openapi: { components: { schemas: { ModelInput: { properties: props, required } } } } }] }) });
  const fetchFn = (async (url: string) =>
    url.includes("x%2Fedit") ? schemaOf({ prompt: {}, image_urls: { type: "array" } }, ["image_urls"]) : schemaOf({ prompt: {}, image_size: {} }, ["prompt"])) as unknown as typeof fetch;
  const catalog = [{ id: "x/edit", name: "X edit", category: "image-to-image" as const, description: "" }, { id: "x", name: "X", category: "text-to-image" as const, description: "" }];
  const setup = await addFalModel(catalog[0], catalog, "key", fetchFn);
  expect(setup).toMatchObject({ textEndpoint: "x", textSize: "image_size", maxReferences: 4 });
  expect(customFalModels()["x/edit"].label).toBe("X edit");
});
