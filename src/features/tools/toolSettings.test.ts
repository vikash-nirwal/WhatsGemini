import { cleanToolSettings, DEFAULT_TOOL_SETTINGS, enabledGroups, loadToolSettings, saveToolSettings, toolSummary } from "./toolSettings";

beforeEach(() => localStorage.clear());

describe("tool settings", () => {
  it("starts with everything off", () => {
    expect(loadToolSettings()).toEqual(DEFAULT_TOOL_SETTINGS);
    expect(enabledGroups()).toEqual([]);
    expect(toolSummary(loadToolSettings())).toBe("Off");
  });

  it("remembers what was switched on", () => {
    saveToolSettings({ on: true, groups: { ...DEFAULT_TOOL_SETTINGS.groups, dice: true, web: true }, reader: false });
    expect(enabledGroups()).toEqual(["dice", "web"]);
    expect(toolSummary(loadToolSettings())).toBe("2 on");
  });

  it("offers nothing with the master switch off", () => {
    const settings = { on: false, groups: { ...DEFAULT_TOOL_SETTINGS.groups, dice: true }, reader: false };
    expect(enabledGroups(settings)).toEqual([]);
    expect(toolSummary(settings)).toBe("Off");
  });

  it("takes only what it knows from an imported value", () => {
    expect(cleanToolSettings({ on: "yes", groups: { dice: true, hack: true, web: 1 }, reader: true })).toEqual({ on: false, groups: { ...DEFAULT_TOOL_SETTINGS.groups, dice: true }, reader: true });
    expect(cleanToolSettings("nonsense")).toEqual(DEFAULT_TOOL_SETTINGS);
    localStorage.setItem("character_tools", "{not json");
    expect(loadToolSettings()).toEqual(DEFAULT_TOOL_SETTINGS);
  });
});
