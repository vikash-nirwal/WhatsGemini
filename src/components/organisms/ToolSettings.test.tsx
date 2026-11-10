import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import ToolSettings from "./ToolSettings";
import { enabledGroups, loadToolSettings } from "src/features/tools/toolSettings";

// CRA's Jest can't resolve Radix's package subpath exports, so the Radix
// switch is swapped for a plain button with the same role and props.
jest.mock("src/components/atoms/switch", () => ({
  Switch: ({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) => (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange(!checked)} />
  ),
}));

const switches = () => screen.getAllByRole("switch");

beforeEach(() => localStorage.clear());

describe("ToolSettings", () => {
  it("starts with everything off, and the tool switches locked", () => {
    render(<ToolSettings />);
    // The master switch, five kinds of tool and the reader service.
    expect(switches()).toHaveLength(7);
    switches().forEach((s) => expect(s).toHaveAttribute("aria-checked", "false"));
    expect(switches()[0]).toBeEnabled();
    expect(switches()[1]).toBeDisabled();
  });

  it("switches a tool on once tools are on, and saves it", () => {
    const onChange = jest.fn();
    render(<ToolSettings onChange={onChange} />);
    fireEvent.click(switches()[0]);
    expect(loadToolSettings().on).toBe(true);
    expect(enabledGroups()).toEqual([]);
    fireEvent.click(switches()[1]);
    expect(enabledGroups()).toEqual(["dice"]);
    expect(onChange).toHaveBeenCalledTimes(2);
    // The reader service waits for "Reading a link".
    expect(switches()[6]).toBeDisabled();
    fireEvent.click(switches()[5]);
    expect(switches()[6]).toBeEnabled();
  });

  it("switching tools off keeps the choices but offers none", () => {
    render(<ToolSettings />);
    fireEvent.click(switches()[0]);
    fireEvent.click(switches()[2]);
    fireEvent.click(switches()[0]);
    expect(loadToolSettings().groups.facts).toBe(true);
    expect(enabledGroups()).toEqual([]);
  });
});
