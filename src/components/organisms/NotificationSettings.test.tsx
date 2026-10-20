import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NotificationSettings from "./NotificationSettings";
import { notificationsEnabled } from "src/features/notifications/notifications";

// CRA's Jest can't resolve Radix's package subpath exports, so the Radix
// switch is swapped for a plain button with the same role and props.
jest.mock("src/components/atoms/switch", () => ({
  Switch: ({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) => (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange(!checked)} />
  ),
}));

// jsdom has no Notification API; this stand-in only needs the permission.
const FakeNotification = {
  permission: "default" as NotificationPermission,
  requestPermission: jest.fn(async (): Promise<NotificationPermission> => "granted"),
};

const theSwitch = () => screen.getByRole("switch", { name: "Notify me of new messages" });

beforeEach(() => {
  localStorage.clear();
  FakeNotification.permission = "default";
  FakeNotification.requestPermission.mockClear();
  (window as any).Notification = FakeNotification;
});

afterAll(() => {
  delete (window as any).Notification;
});

describe("NotificationSettings", () => {
  it("is off by default and asks for permission when turned on", async () => {
    FakeNotification.requestPermission.mockImplementationOnce(async () => {
      FakeNotification.permission = "granted";
      return "granted";
    });
    render(<NotificationSettings />);
    expect(theSwitch()).not.toBeChecked();

    fireEvent.click(theSwitch());
    await waitFor(() => expect(theSwitch()).toBeChecked());
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(notificationsEnabled()).toBe(true);
  });

  it("stays off when the user declines the prompt", async () => {
    FakeNotification.requestPermission.mockImplementationOnce(async () => {
      FakeNotification.permission = "denied";
      return "denied";
    });
    render(<NotificationSettings />);
    fireEvent.click(theSwitch());

    expect(await screen.findByRole("status")).toHaveTextContent("blocked notifications");
    expect(theSwitch()).not.toBeChecked();
    expect(notificationsEnabled()).toBe(false);
  });

  it("explains a block made earlier and doesn't ask again", () => {
    FakeNotification.permission = "denied";
    render(<NotificationSettings />);
    expect(screen.getByRole("status")).toHaveTextContent("allow notifications in the browser's site settings");
    expect(theSwitch()).toBeDisabled();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it("says so when the browser has no notifications", () => {
    delete (window as any).Notification;
    render(<NotificationSettings />);
    expect(screen.getByRole("status")).toHaveTextContent("Add to Home Screen");
    expect(theSwitch()).toBeDisabled();
  });

  it("turns off without asking anything", async () => {
    FakeNotification.permission = "granted";
    localStorage.setItem("notifications_enabled", "true");
    render(<NotificationSettings />);
    expect(theSwitch()).toBeChecked();

    fireEvent.click(theSwitch());
    await waitFor(() => expect(theSwitch()).not.toBeChecked());
    expect(notificationsEnabled()).toBe(false);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });
});
