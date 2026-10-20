import fs from "fs";
import path from "path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect, openRoute, ADVENTURE_OPENING, SeedOptions } from "./fixtures";

// T6: an axe-core scan of the main pages. The app has known violations today
// (listed with their node counts in a11y-baseline.json); the test fails only
// on something new: a rule not in the baseline for that page and viewport,
// or more failing elements than the baseline allows. When a fix lowers a
// count, rewrite the baseline so it can't creep back up:
//
//   A11Y_UPDATE_BASELINE=1 E2E_PORT=3100 npx playwright test a11y --workers=1
//
// (one worker, because every test rewrites the shared file).

const BASELINE_FILE = path.join(__dirname, "a11y-baseline.json");

// WCAG 2.0-2.2 A and AA rules: what the app is actually expected to meet.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface BaselineEntry {
  page: string;
  rule: string;
  // Failing elements, per Playwright project (viewport).
  counts: Record<string, number>;
  help: string;
}

const readBaseline = (): BaselineEntry[] => {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  } catch {
    return [];
  }
};

const writeBaseline = (entries: BaselineEntry[]) => {
  entries.sort((a, b) => a.page.localeCompare(b.page) || a.rule.localeCompare(b.rule));
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(entries, null, 2) + "\n");
};

// Lets entrance animations (message fade-ins, dialogs) finish first: a
// half-faded element would fail colour contrast on one run and not the next.
const settle = async (page: Page) => {
  await page.evaluate(() => document.fonts.ready);
  // Endless ones (spinners, pulsing status dots) never finish, so only
  // finite animations are waited for.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity).length
      )
    )
    .toBe(0);
  await page.waitForTimeout(300);
};

interface PageCase {
  name: string;
  route: string;
  seed?: SeedOptions | false;
  ready: (page: Page) => Promise<void>;
}

const pages: PageCase[] = [
  // First run (empty database) gets the welcome screen; once there are
  // characters, home is a "select a chat" placeholder.
  { name: "home (first run)", route: "/", seed: false, ready: (p) => expect(p.getByRole("heading", { name: "Welcome to WhatsGemini" })).toBeVisible({ timeout: 30_000 }) },
  { name: "home", route: "/", ready: (p) => expect(p.getByText("Select a chat from the sidebar to continue a conversation.")).toBeVisible({ timeout: 30_000 }) },
  { name: "chat", route: "/chat/1", ready: (p) => expect(p.getByText("Aria message 29: how was your day?")).toBeVisible({ timeout: 30_000 }) },
  { name: "character gallery", route: "/characters", ready: (p) => expect(p.getByRole("heading", { name: "Aria" })).toBeVisible({ timeout: 30_000 }) },
  { name: "character editor", route: "/characters/new", ready: (p) => expect(p.getByRole("textbox", { name: "Character Name" })).toBeVisible({ timeout: 30_000 }) },
  { name: "settings", route: "/settings/profile", ready: (p) => expect(p.getByRole("button", { name: "Back" }).first()).toBeVisible({ timeout: 30_000 }) },
  { name: "adventure gallery", route: "/adventures", seed: { adventure: true }, ready: (p) => expect(p.getByText("The Sunken Archive").first()).toBeVisible({ timeout: 30_000 }) },
  { name: "adventure", route: "/adventures/1", seed: { adventure: true }, ready: (p) => expect(p.getByText(ADVENTURE_OPENING)).toBeVisible({ timeout: 30_000 }) },
];

// A3: the default cozy dark theme gets every page above. Each other color
// theme and light/dark mode gets only the two pages that show the most kinds
// of controls and text, on one desktop and one phone viewport, which keeps
// the run short while still catching a contrast regression in any theme.
// Their baseline entries carry the theme in the page key, e.g.
// "chat [aurora light]".
//
// The character editor's target-size entries on Pixel (every theme) are not
// small controls: its sticky Back/Next bar covers whichever suggestion chips
// sit at the bottom of the screen, and axe counts a partly covered chip as
// too small. How many chips that hits depends on each theme's font metrics.
const THEMES = ["cozy", "neumorphic", "aurora", "terminal", "parchment", "material"] as const;
const MODES = ["dark", "light"] as const;
const THEMED_PAGES = ["chat", "character editor"];
const THEMED_PROJECTS = ["desktop", "pixel"];

interface ScanCase {
  key: string;
  pc: PageCase;
  // Absent for cozy dark, which is what the app starts in.
  theme?: { color: (typeof THEMES)[number]; mode: (typeof MODES)[number] };
}

const cases: ScanCase[] = pages.map((pc) => ({ key: pc.name, pc }));
for (const color of THEMES) {
  for (const mode of MODES) {
    if (color === "cozy" && mode === "dark") continue;
    for (const pc of pages.filter((p) => THEMED_PAGES.includes(p.name))) {
      cases.push({ key: `${pc.name} [${color} ${mode}]`, pc, theme: { color, mode } });
    }
  }
}

for (const { key, pc, theme } of cases) {
  test.describe(key, () => {
    if (pc.seed !== undefined) test.use({ seed: pc.seed });
    if (theme) test.use({ localStorageOverrides: { color_theme: theme.color, theme: theme.mode } });

    test(`a11y: no new axe violations on ${key}`, async ({ page }, testInfo) => {
      const project = testInfo.project.name;
      test.skip(!!theme && !THEMED_PROJECTS.includes(project), "Other themes are scanned on desktop and Pixel only");
      await openRoute(page, pc.route);
      await pc.ready(page);
      await settle(page);

      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const found = new Map(violations.map((v) => [v.id, v]));

      if (process.env.A11Y_UPDATE_BASELINE) {
        const others = readBaseline();
        // Drop this page and project's old counts, keep everyone else's.
        for (const e of others) if (e.page === key) delete e.counts[project];
        for (const v of violations) {
          let entry = others.find((e) => e.page === key && e.rule === v.id);
          if (!entry) others.push((entry = { page: key, rule: v.id, counts: {}, help: v.help }));
          entry.counts[project] = v.nodes.length;
        }
        writeBaseline(others.filter((e) => Object.keys(e.counts).length > 0));
        return;
      }

      const allowed = new Map(readBaseline().filter((e) => e.page === key).map((e) => [e.rule, e.counts[project] ?? 0]));
      const problems = [...found.values()]
        .filter((v) => v.nodes.length > (allowed.get(v.id) ?? 0))
        .map((v) => {
          const targets = v.nodes.slice(0, 5).map((n) => `    ${n.target.join(" ")}`).join("\n");
          return `${v.id} (${v.impact}): ${v.nodes.length} element(s), baseline ${allowed.get(v.id) ?? 0}. ${v.help}\n${targets}\n    ${v.helpUrl}`;
        });
      expect(problems, `New accessibility violations on ${key} (${project}):\n${problems.join("\n")}`).toEqual([]);
    });
  });
}
