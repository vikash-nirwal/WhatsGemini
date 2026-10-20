import { createComfyUIAdapter, referenceFileName } from "./comfyuiAdapter";
import { createFakeComfy, FAKE_PROMPT_ID } from "../comfyui/fakeServer";
import { DEFAULT_COMFYUI_SETTINGS, LS_COMFYUI_SETTINGS, saveComfySettings } from "../comfyui/settings";

const REF = { mimeType: "image/png", data: btoa("reference-photo-bytes") };
const adapter = createComfyUIAdapter({ pollIntervalMs: 1, timeoutMs: 2000 });

const install = (fake: ReturnType<typeof createFakeComfy>) => {
  (global as any).fetch = jest.fn(fake.fetch);
};

beforeEach(() => {
  localStorage.clear();
});

describe("comfyuiAdapter", () => {
  it("uploads the reference, queues the FaceID workflow, polls history and fetches the image", async () => {
    saveComfySettings({ ...DEFAULT_COMFYUI_SETTINGS, serverUrl: "http://127.0.0.1:8188/", seed: "42" });
    const fake = createFakeComfy({ pendingPolls: 2 });
    install(fake);

    const result = await adapter.generateImage({ model: "", prompt: "Aria at the beach", referenceImages: [REF], aspectRatio: "3:4" }, {});

    expect(fake.paths()).toEqual([
      "POST /upload/image",
      "POST /prompt",
      "GET /history/prompt-123",
      "GET /history/prompt-123",
      "GET /history/prompt-123",
      "GET /view",
    ]);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatch(/^data:image\/png;base64,/);

    const workflow = fake.queuedWorkflow();
    expect(workflow["9"]).toMatchObject({ class_type: "LoadImage", inputs: { image: referenceFileName(REF) } });
    expect(workflow["11"].class_type).toBe("IPAdapterFaceID");
    expect(workflow["3"].inputs.text).toBe("Aria at the beach");
    expect(workflow["6"].inputs.seed).toBe(42);
    expect(workflow["5"].inputs).toMatchObject({ width: 896, height: 1152 });
    // No LoRA set: the loader is gone and FaceID reads the checkpoint directly.
    expect(workflow["2"]).toBeUndefined();
    expect(workflow["10"].inputs.model).toEqual(["1", 0]);

    const promptCall = fake.calls.find((c) => c.path === "/prompt")!;
    expect(JSON.parse(String(promptCall.init?.body)).client_id).toEqual(expect.any(String));
    const viewCall = fake.calls.find((c) => c.path.startsWith("/view"))!;
    expect(viewCall.path).toBe("/view?filename=WhatsGemini_00001_.png&subfolder=&type=output");
  });

  it("uses the text-to-image template and uploads nothing without a reference", async () => {
    const fake = createFakeComfy();
    install(fake);

    await adapter.generateImage({ model: "", prompt: "a lighthouse" }, {});

    expect(fake.paths()[0]).toBe("POST /prompt");
    expect(fake.paths()).not.toContain("POST /upload/image");
    const workflow = fake.queuedWorkflow();
    expect(Object.values(workflow).some((n: any) => n.class_type === "LoadImage")).toBe(false);
    expect(workflow["5"].inputs).toMatchObject({ width: 1024, height: 1024 });
  });

  it("falls back to the group's references when only referenceCharacters is given", async () => {
    const fake = createFakeComfy();
    install(fake);

    await adapter.generateImage(
      { model: "", prompt: "us together", referenceCharacters: [{ name: "Aria", images: [REF] }, { name: "Kai", images: [] }] },
      {}
    );

    expect(fake.paths()[0]).toBe("POST /upload/image");
  });

  it("fills the chosen template's checkpoint and LoRA and wraps the prompt for Kontext", async () => {
    saveComfySettings({
      ...DEFAULT_COMFYUI_SETTINGS,
      referenceTemplateId: "flux-kontext-gguf",
      templateOptions: { "flux-kontext-gguf": { checkpoint: "kontext-Q3.gguf", lora: "aria.safetensors", loraStrength: 0.7 } },
    });
    const fake = createFakeComfy();
    install(fake);

    await adapter.generateImage({ model: "", prompt: "reading in a cafe", referenceImages: [REF] }, {});

    const workflow = fake.queuedWorkflow();
    expect(workflow["1"].inputs.unet_name).toBe("kontext-Q3.gguf");
    expect(workflow["2"].inputs).toMatchObject({ lora_name: "aria.safetensors", strength_model: 0.7 });
    expect(workflow["8"].inputs.text).toMatch(/same person as in the reference image.*reading in a cafe$/);
  });

  it("names the node when ComfyUI rejects the workflow", async () => {
    const fake = createFakeComfy({
      promptStatus: 400,
      promptBody: {
        error: { type: "invalid_prompt", message: "Cannot execute because node IPAdapterFaceID does not exist.", details: "Node ID '#11'" },
        node_errors: {},
      },
    });
    install(fake);

    await expect(adapter.generateImage({ model: "", prompt: "x", referenceImages: [REF] }, {})).rejects.toThrow(
      /IPAdapterFaceID does not exist.*Install the custom nodes/
    );
  });

  it("reports an error raised while the workflow runs", async () => {
    const fake = createFakeComfy({
      historyEntry: {
        outputs: {},
        status: {
          status_str: "error",
          completed: false,
          messages: [["execution_error", { node_id: "10", node_type: "IPAdapterUnifiedLoaderFaceID", exception_message: "No module named 'insightface'" }]],
        },
      },
    });
    install(fake);

    await expect(adapter.generateImage({ model: "", prompt: "x", referenceImages: [REF] }, {})).rejects.toThrow(
      /node 10 \(IPAdapterUnifiedLoaderFaceID\).*insightface/
    );
  });

  it("says CORS is the problem when the server answers a no-cors probe", async () => {
    (global as any).fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      if (init?.mode === "no-cors") return { ok: false, status: 0 };
      throw new TypeError("Failed to fetch");
    });

    await expect(adapter.generateImage({ model: "", prompt: "x" }, {})).rejects.toThrow(/blocked its reply \(CORS\).*--enable-cors-header/);
  });

  it("says ComfyUI can't be reached when nothing answers", async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(adapter.generateImage({ model: "", prompt: "x" }, {})).rejects.toThrow(/Can't reach ComfyUI at http:\/\/127\.0\.0\.1:8188/);
  });

  it("stops polling and takes the prompt off the queue when aborted", async () => {
    const fake = createFakeComfy({ pendingPolls: 1000 });
    install(fake);
    const controller = new AbortController();
    const slowAdapter = createComfyUIAdapter({ pollIntervalMs: 20, timeoutMs: 5000 });

    const run = slowAdapter.generateImage({ model: "", prompt: "x", signal: controller.signal }, {});
    setTimeout(() => controller.abort(), 50);

    await expect(run).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(fake.paths()).toContain("POST /queue");
    const queueCall = fake.calls.find((c) => c.path === "/queue")!;
    expect(JSON.parse(String(queueCall.init?.body))).toEqual({ delete: [FAKE_PROMPT_ID] });
  });

  it("ignores broken stored settings", async () => {
    localStorage.setItem(LS_COMFYUI_SETTINGS, "{not json");
    const fake = createFakeComfy();
    install(fake);

    await adapter.generateImage({ model: "", prompt: "x" }, {});

    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toBe("http://127.0.0.1:8188/prompt");
  });
});
