import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ComfyUISettings from "./ComfyUISettings";
import { createFakeComfy } from "src/features/ai/comfyui/fakeServer";
import { loadComfySettings, loadCustomWorkflows } from "src/features/ai/comfyui/settings";

// CRA's Jest can't resolve Radix's package subpath exports, so the
// Radix-backed Select is swapped for a native one (same props).
jest.mock("src/components/molecules/form-controls", () => ({
  Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
  TextInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  TextArea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

const SIMPLE_WORKFLOW = {
  "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "mine.safetensors" } },
  "6": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["4", 1] } },
  "3": { class_type: "KSampler", inputs: { seed: 1, positive: ["6", 0], model: ["4", 0] } },
};

beforeEach(() => localStorage.clear());

describe("ComfyUISettings", () => {
  it("saves the server URL and seed to its own settings as they're typed", () => {
    render(<ComfyUISettings />);

    fireEvent.change(screen.getByLabelText("ComfyUI server URL"), { target: { value: "http://192.168.1.20:8188" } });
    fireEvent.change(screen.getByLabelText("ComfyUI seed"), { target: { value: "12a3" } });

    expect(loadComfySettings()).toMatchObject({ serverUrl: "http://192.168.1.20:8188", seed: "123" });
  });

  it("shows the model fields and requirements of the picked workflows", () => {
    render(<ComfyUISettings />);
    expect(screen.getByLabelText("Checkpoint for SDXL + IP-Adapter FaceID")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Workflow with a reference photo"), { target: { value: "flux-kontext-gguf" } });

    expect(loadComfySettings().referenceTemplateId).toBe("flux-kontext-gguf");
    expect(screen.queryByLabelText("Checkpoint for SDXL + IP-Adapter FaceID")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Checkpoint for FLUX.1 Kontext dev (GGUF)"), { target: { value: "kontext-Q3.gguf" } });
    expect(loadComfySettings().templateOptions["flux-kontext-gguf"]).toEqual({ checkpoint: "kontext-Q3.gguf" });
    expect(screen.getByTestId("comfyui-setup-note").textContent).toMatch(/ComfyUI-GGUF/);
  });

  it("offers only text-only workflows for pictures without a reference", () => {
    render(<ComfyUISettings />);
    const options = within(screen.getByLabelText("Workflow without a reference"))
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(["sdxl-txt2img"]);
  });

  it("tests the connection, reports the device and flags a missing custom node pack", async () => {
    const fake = createFakeComfy({
      knownNodes: { CheckpointLoaderSimple: { input: { required: { ckpt_name: [["juggernautXL.safetensors", "pony.safetensors"]] } } } },
    });
    (global as any).fetch = jest.fn(fake.fetch);
    render(<ComfyUISettings />);

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    const status = await screen.findByText(/Connected to ComfyUI 0\.3\.60, mps \(16 GB\)/);
    expect(status.textContent).toMatch(/Missing nodes: IPAdapterUnifiedLoaderFaceID, IPAdapterFaceID/);
    expect(screen.getByTestId("comfyui-requirements-sdxl-faceid").textContent).toMatch(/ComfyUI_IPAdapter_plus \(not installed\)/);
    expect(fake.paths()).toContain("GET /system_stats");
    // The installed checkpoints become suggestions for the checkpoint field.
    const options = within(screen.getByTestId("comfyui-ckpt-sdxl-faceid")).getAllByRole("option", { hidden: true });
    expect(options.map((o) => o.getAttribute("value"))).toEqual(["juggernautXL.safetensors", "pony.safetensors"]);
  });

  it("shows the CORS hint when ComfyUI runs without --enable-cors-header", async () => {
    (global as any).fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      if (init?.mode === "no-cors") return { ok: false, status: 0 };
      throw new TypeError("Failed to fetch");
    });
    render(<ComfyUISettings />);

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/--enable-cors-header/);
  });

  it("imports a pasted API workflow with guessed mappings and can delete it", () => {
    render(<ComfyUISettings />);

    fireEvent.change(screen.getByLabelText("Name for the imported workflow"), { target: { value: "My SD 1.5" } });
    fireEvent.change(screen.getByLabelText("Workflow JSON"), { target: { value: JSON.stringify(SIMPLE_WORKFLOW) } });
    fireEvent.click(screen.getByRole("button", { name: "Import pasted JSON" }));

    expect(screen.getByTestId("comfyui-import-status").textContent).toMatch(/Imported "My SD 1\.5".*Prompt.*Checkpoint/);
    const [stored] = loadCustomWorkflows();
    expect(stored.name).toBe("My SD 1.5");
    expect(stored.mappings).toEqual(
      expect.arrayContaining([
        { placeholder: "positivePrompt", nodeId: "6", input: "text" },
        { placeholder: "seed", nodeId: "3", input: "seed" },
        { placeholder: "checkpoint", nodeId: "4", input: "ckpt_name" },
      ])
    );
    expect(screen.getByTestId("comfyui-mapping-editor")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete My SD 1.5" }));
    expect(loadCustomWorkflows()).toEqual([]);
  });

  it("refuses a UI-format workflow and says how to export the right one", () => {
    render(<ComfyUISettings />);

    fireEvent.change(screen.getByLabelText("Workflow JSON"), { target: { value: JSON.stringify({ nodes: [], links: [] }) } });
    fireEvent.click(screen.getByRole("button", { name: "Import pasted JSON" }));

    expect(screen.getByRole("alert").textContent).toMatch(/Export \(API\)/);
    expect(loadCustomWorkflows()).toEqual([]);
  });

  it("generates a test picture through the adapter", async () => {
    const fake = createFakeComfy({ pendingPolls: 0 });
    (global as any).fetch = jest.fn(fake.fetch);
    render(<ComfyUISettings />);

    fireEvent.click(screen.getByRole("button", { name: "Generate a test picture" }));

    const img = await screen.findByAltText("ComfyUI test result");
    expect(img.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    expect(fake.paths()).toEqual(["POST /prompt", "GET /history/prompt-123", "GET /view"]);
  });

  it("lists the setup needs: launch flag, VRAM and the active templates' nodes", () => {
    render(<ComfyUISettings />);
    const note = screen.getByTestId("comfyui-setup-note").textContent!;
    expect(note).toMatch(/--enable-cors-header/);
    expect(note).toMatch(/8 GB/);
    expect(note).toMatch(/12 GB/);
    expect(note).toMatch(/ComfyUI_IPAdapter_plus/);
  });
});
