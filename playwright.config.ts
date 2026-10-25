import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets a second checkout (another worktree) run the suite while the
// main checkout's dev server already holds port 3000 - otherwise "reuse an
// existing server" would quietly test the other checkout's code.
const port = Number(process.env.E2E_PORT || 3000);
// The app is served under the `homepage` path from package.json, in dev too.
const baseURL = `http://localhost:${port}/Kindred/`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // The dev server compiles on first request, so the very first navigation
  // can be slow; individual assertions still use the default 5s timeout.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // On CI, "github" turns each failure into an annotation on the run, which
  // anyone can read (step logs need a signed-in account).
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      // WebKit, so iOS Safari layout quirks show up.
      name: "iphone",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "pixel",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm start",
    url: baseURL,
    env: { BROWSER: "none", PORT: String(port) },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
