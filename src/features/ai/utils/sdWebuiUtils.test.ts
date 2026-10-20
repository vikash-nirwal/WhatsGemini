import { controlnetModuleFor, generateSDImage } from "./sdWebuiUtils";

jest.mock("./imageProcessing", () => ({
  appendCharacterImages: async (images: string[]) => images.map((data) => ({ data, mimeType: "image/png" })),
}));

// The SD WebUI request with a character's own settings (#40).
describe("generateSDImage with per-character settings", () => {
  let bodies: any[];
  let urls: string[];

  beforeEach(() => {
    localStorage.clear();
    bodies = [];
    urls = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      urls.push(String(url));
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ images: ["abc"] }) } as any;
    }) as any;
  });

  it("adds the LoRA, pins the seed and uses the character's face model", async () => {
    const images = await generateSDImage("1girl, cafe", { seed: 7 }, ["REF"], "Mira Vale", undefined, {
      seed: 99, loraName: "mira_v2", loraWeight: 0.7, loraTrigger: "mira_char", referenceMode: "reactor", reactorFaceModel: "mira_face",
    });
    expect(images).toEqual(["data:image/png;base64,abc"]);
    expect(bodies[0].prompt).toBe("<lora:mira_v2:0.7>, mira_char, 1girl, cafe");
    expect(bodies[0].seed).toBe(99);
    expect(bodies[0].alwayson_scripts.reactor.args[0]).toBe("REF");
    expect(bodies[0].alwayson_scripts.reactor.args[23]).toBe("mira_face.safetensors");
  });

  it("sends the FaceID preprocessor with a FaceID ControlNet model", async () => {
    localStorage.setItem("sd_webui_controlnet_model", "ip-adapter-faceid-plusv2_sdxl");
    await generateSDImage("1girl", {}, ["REF"], "Mira", undefined, { referenceMode: "controlnet" });
    expect(bodies[0].alwayson_scripts.controlnet.args[0]).toMatchObject({ input_image: "REF", model: "ip-adapter-faceid-plusv2_sdxl", module: "ip-adapter_face_id_plus" });
  });

  it("the character's reference mode overrides the app's", async () => {
    localStorage.setItem("sd_webui_ref_mode", "controlnet");
    await generateSDImage("1girl", {}, ["REF"], "Mira", undefined, { referenceMode: "img2img" });
    expect(urls[0]).toMatch(/\/sdapi\/v1\/img2img$/);
    expect(bodies[0].init_images).toEqual(["REF"]);
  });

  it("without settings keeps the app's behaviour", async () => {
    localStorage.setItem("sd_webui_ref_mode", "reactor");
    await generateSDImage("1girl", { seed: 7 }, ["REF"], "Mira Vale");
    expect(bodies[0].prompt).toBe("1girl");
    expect(bodies[0].seed).toBe(7);
    expect(bodies[0].alwayson_scripts.reactor.args[23]).toBe("mira.safetensors");
  });
});

describe("controlnetModuleFor", () => {
  it("picks the preprocessor that matches the IP-Adapter model", () => {
    expect(controlnetModuleFor("ip-adapter-faceid-plusv2_sd15")).toBe("ip-adapter_face_id_plus");
    expect(controlnetModuleFor("ip-adapter-faceid_sdxl")).toBe("ip-adapter_face_id");
    expect(controlnetModuleFor("ip-adapter_sd15")).toBe("ip-adapter_clip_sd15");
    expect(controlnetModuleFor("ip-adapter_sdxl")).toBe("ip-adapter_clip_sdxl");
    expect(controlnetModuleFor("control_v11p_sd15_openpose")).toBeUndefined();
  });
});
