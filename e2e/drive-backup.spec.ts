import { test, expect, openRoute } from "./fixtures";

// Backup to Google Drive (#54): encrypted in the browser, kept in the Drive's
// app-data folder, restored with the same passphrase. Google's sign-in and
// the Drive API are faked here.

test.use({ seed: { messages: 4 } });

const PASSPHRASE = "a long secret phrase";

test("a backup is encrypted, uploaded to the app folder, and restored with its passphrase", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the Drive requests are the same on every screen");
  // Google Identity Services, faked: sign-in always succeeds.
  await page.addInitScript(() => {
    (window as any).google = {
      accounts: { oauth2: { initTokenClient: (cfg: any) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: "test-token" }), 0) }) } },
    };
  });
  let stored: Buffer | null = null;
  let uploadBody = "";
  let auth = "";
  await page.route("https://www.googleapis.com/upload/drive/v3/files**", async (route) => {
    const body = route.request().postDataBuffer()!;
    uploadBody = body.toString("latin1");
    auth = (await route.request().allHeaders())["authorization"];
    // The file part is between its header and the closing boundary.
    const start = body.indexOf("Content-Type: application/octet-stream\r\n\r\n") + "Content-Type: application/octet-stream\r\n\r\n".length;
    const end = body.lastIndexOf("\r\n--");
    stored = body.subarray(start, end);
    return route.fulfill({ json: { id: "f1", name: "backup.wgbk", createdTime: "2026-10-21T08:00:00Z" } });
  });
  await page.route("https://www.googleapis.com/drive/v3/files**", (route) => {
    const url = route.request().url();
    if (route.request().method() === "DELETE") return route.fulfill({ status: 204, body: "" });
    if (url.includes("alt=media")) return route.fulfill({ status: 200, contentType: "application/octet-stream", body: stored! });
    return route.fulfill({ json: { files: stored ? [{ id: "f1", name: "backup.wgbk", size: String(stored.length), createdTime: "2026-10-21T08:00:00Z" }] : [] } });
  });

  await openRoute(page, "/settings/data");
  await page.getByLabel("Google OAuth client ID").fill("123-test.apps.googleusercontent.com");
  await page.getByLabel(/Backup passphrase/).fill(PASSPHRASE);
  await page.getByRole("button", { name: "Back up to Drive" }).click();
  await expect(page.getByText("Backed up to Google Drive")).toBeVisible({ timeout: 20_000 });

  expect(auth).toBe("Bearer test-token");
  expect(uploadBody).toContain('"parents":["appDataFolder"]');
  expect(stored!.subarray(0, 5).toString()).toBe("WGBK1");
  // Encrypted: none of the zip's own file names are readable.
  expect(stored!.toString("latin1")).not.toContain("backup.json");
  expect(stored!.toString("latin1")).not.toContain("Aria");

  // A wrong passphrase can't open it.
  await page.getByLabel(/Backup passphrase/).fill("not the right one");
  await page.getByRole("button", { name: "Restore from Drive" }).click();
  const list = page.getByRole("list", { name: "Drive backups" });
  await list.getByRole("button", { name: /Restore the backup from/ }).click();
  await expect(page.getByRole("alert")).toContainText("That passphrase doesn't open this backup.");

  // The right one restores it, after the usual confirm.
  await page.getByLabel(/Backup passphrase/).fill(PASSPHRASE);
  await list.getByRole("button", { name: /Restore the backup from/ }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Restored \d+ chat\(s\), \d+ character\(s\), \d+ world\(s\)/)).toBeVisible({ timeout: 20_000 });
});

test("the buttons wait for a client ID and a long enough passphrase", async ({ page }) => {
  await openRoute(page, "/settings/data");
  const backup = page.getByRole("button", { name: "Back up to Drive" });
  await expect(backup).toBeDisabled();
  await page.getByLabel("Google OAuth client ID").fill("123-test.apps.googleusercontent.com");
  await page.getByLabel(/Backup passphrase/).fill("short");
  await expect(backup).toBeDisabled();
  await page.getByLabel(/Backup passphrase/).fill("long enough now");
  await expect(backup).toBeEnabled();
  // The client ID is remembered; the passphrase isn't.
  expect(await page.evaluate(() => localStorage.getItem("google_drive_client_id"))).toBe("123-test.apps.googleusercontent.com");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("long enough now");
});
