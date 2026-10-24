import type { Page } from "@playwright/test";
import { test, expect, openRoute, openChat, sendMessage, waitForReplyDone, chatMessages } from "./fixtures";

// #42: the Spending page in Settings and the monthly limit. Spending is
// seeded straight into localStorage; paid calls go to DeepSeek (a plaintext
// key is accepted as a legacy key), answered by a mock that reports usage.

const monthKey = (offset = 0) => {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() - offset, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
};

const ledger = (entries: Record<string, Record<string, { cost: number; calls: number; byKind?: Record<string, number> }>>) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(entries).map(([month, providers]) => [
        month,
        Object.fromEntries(Object.entries(providers).map(([id, p]) => [id, { tokens: 0, ...p }])),
      ])
    )
  );

const DEEPSEEK = {
  chat_provider: "deepseek",
  provider_api_key_deepseek: "sk-test-not-a-real-key",
  ai_model: "deepseek-chat",
};

// Answers DeepSeek with usage on every reply, streamed or not: 100k output
// tokens at deepseek-chat's $0.42 per million is about $0.04 a call.
const mockPaidReplies = async (page: Page) => {
  const requests: string[] = [];
  const usage = { prompt_tokens: 1000, completion_tokens: 100_000, total_tokens: 101_000 };
  await page.route("**/api.deepseek.com/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON() ?? {};
    requests.push(route.request().url());
    const text = `Paid reply ${requests.length}`;
    if (body.stream) {
      const chunks = [
        { choices: [{ delta: { content: text } }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
        { choices: [], usage },
      ];
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n",
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }], usage }),
      });
    }
  });
  return requests;
};

test.describe("spending page", () => {
  test.use({
    localStorageOverrides: {
      spending_ledger: ledger({
        [monthKey()]: {
          openai: { cost: 1.2, calls: 14, byKind: { text: 0.8, image: 0.4 } },
          fal: { cost: 0.36, calls: 9, byKind: { image: 0.36 } },
        },
        [monthKey(1)]: { deepseek: { cost: 3.5, calls: 200 } },
      }),
    },
  });

  test("shows this month by provider, past months and a limit", async ({ page }) => {
    await openRoute(page, "/settings/spending");
    await expect(page.getByTestId("spending-month-total")).toHaveText("$1.56");
    await expect(page.getByText("Estimates, not your provider's bill")).toBeVisible();

    const providers = page.getByRole("list", { name: "Spending by provider this month" }).getByRole("listitem");
    await expect(providers).toHaveCount(2);
    await expect(providers.nth(0)).toContainText("OpenAI");
    await expect(providers.nth(0)).toContainText("14 calls · text $0.80, images $0.40");
    await expect(providers.nth(0)).toContainText("$1.20");
    await expect(providers.nth(1)).toContainText("fal.ai");

    const months = page.getByRole("list", { name: "Spending by month" }).getByRole("listitem");
    await expect(months).toHaveCount(6);
    await expect(months.nth(1)).toContainText("$3.50");

    await expect(page.getByText("No monthly limit set.")).toBeVisible();
    await page.getByLabel("Monthly limit in US dollars").fill("2");
    await expect(page.getByRole("progressbar", { name: "Monthly limit used" })).toHaveAttribute("aria-valuenow", "78");
    await expect(page.getByText("$0.44 left this month.")).toBeVisible();

    // Survives a reload.
    await page.reload();
    await expect(page.getByLabel("Monthly limit in US dollars")).toHaveValue("2");
  });
});

test.describe("80% warning", () => {
  test.use({
    localStorageOverrides: {
      ...DEEPSEEK,
      spending_ledger: ledger({ [monthKey()]: { deepseek: { cost: 0.79, calls: 20 } } }),
      spending_budget: JSON.stringify({ monthlyLimit: 1, mode: "warn" }),
    },
  });

  test("records a paid reply and warns once the month passes 80%", async ({ page }) => {
    const requests = await mockPaidReplies(page);
    await openChat(page);
    await sendMessage(page, "Hello there");
    await expect(chatMessages(page).getByText("Paid reply 1")).toBeVisible();
    await waitForReplyDone(page);
    expect(requests.length).toBeGreaterThan(0);

    const toast = page.locator("[data-sonner-toast]").filter({ hasText: "You've used 80% of your $1.00 monthly limit" });
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Raise limit" }).click();

    await expect(page).toHaveURL(/#\/settings\/spending$/);
    const deepseek = page.getByRole("list", { name: "Spending by provider this month" }).getByRole("listitem").filter({ hasText: "DeepSeek" });
    await expect(deepseek).toContainText(/2\d calls/);
    await expect(page.getByText("Over 80% of the limit.")).toBeVisible();
  });
});

test.describe("hard stop", () => {
  test.use({
    localStorageOverrides: {
      ...DEEPSEEK,
      spending_ledger: ledger({ [monthKey()]: { deepseek: { cost: 1.25, calls: 30 } } }),
      spending_budget: JSON.stringify({ monthlyLimit: 1, mode: "block" }),
    },
  });

  test("blocks paid calls until the limit is raised", async ({ page }) => {
    const requests = await mockPaidReplies(page);
    await openChat(page);
    // (The one-time "reached your limit" warning already showed on the
    // fixture's seeding load, so only the blocked call's toast is expected.)
    await sendMessage(page, "Are you there?");
    await expect(page.getByText(/Monthly spending limit reached \(\$1\.25 of \$1\.00\)/)).toBeVisible();
    expect(requests).toHaveLength(0);

    const blocked = page.locator("[data-sonner-toast]").filter({ hasText: "Monthly limit reached ($1.25 of $1.00)" });
    await expect(blocked).toBeVisible();
    await blocked.getByRole("button", { name: "Raise limit" }).click();

    await expect(page).toHaveURL(/#\/settings\/spending$/);
    await expect(page.getByText(/paid calls are paused/)).toBeVisible();
    await page.getByRole("button", { name: "Raise by $5" }).click();
    await expect(page.getByLabel("Monthly limit in US dollars")).toHaveValue("7");
    await expect(page.getByRole("button", { name: "Raise by $5" })).toHaveCount(0);

    await openChat(page);
    await sendMessage(page, "How about now?");
    await expect(chatMessages(page).getByText("Paid reply 1")).toBeVisible();
    expect(requests.length).toBeGreaterThan(0);
  });
});

test.describe("hard stop with a local provider", () => {
  test.use({
    localStorageOverrides: {
      spending_ledger: ledger({ [monthKey()]: { openai: { cost: 9, calls: 30 } } }),
      spending_budget: JSON.stringify({ monthlyLimit: 1, mode: "block" }),
    },
  });

  test("never blocks Ollama", async ({ page, mockAI }) => {
    mockAI.reply("Local and free");
    await openChat(page);
    await sendMessage(page, "Still free?");
    await expect(chatMessages(page).getByText("Local and free")).toBeVisible();
    await expect(page.getByText(/Monthly spending limit reached/)).toHaveCount(0);
  });
});
