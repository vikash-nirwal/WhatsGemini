import { test as base, expect, Locator, Page, Route } from "@playwright/test";

// Shared e2e fixtures: every test starts past the 18+ gate and the login
// screen, with a known set of characters and chats in IndexedDB, and with AI
// replies answered locally by `mockAI` instead of a real provider.
//
// Usage:
//   import { test, expect } from "./fixtures";
//   test.use({ seed: { room: true } });          // also seed a 2-character room
//   test.use({ seed: false });                   // start with an empty database
//   test("...", async ({ page, mockAI }) => { mockAI.reply("Hi!"); ... });

export interface SeedCharacter {
  id: number;
  name: string;
  description: string;
  prompt: string;
  relationship?: string;
  accent?: [string, string];
}

export interface SeedMessage {
  id: string;
  timestamp: number;
  role: "you" | "ai";
  txt: string;
  speakerId?: number;
}

export interface SeedChat {
  id: number;
  title: string;
  timestamp: number;
  content: SeedMessage[];
  characterIds: number[];
}

export interface SeedChoice {
  id: string;
  label: string;
}

export interface SeedAdventure {
  id: number;
  title: string;
  timestamp: number;
  characterIds: number[];
  premise?: string;
  status: "active" | "completed";
  content: (SeedMessage & { choices?: SeedChoice[] })[];
}

export interface SeedData {
  characters: SeedCharacter[];
  chats: SeedChat[];
  adventures: SeedAdventure[];
}

export interface SeedOptions {
  // Number of messages in the 1:1 chat (alternating you/ai, starting with the AI).
  messages?: number;
  // Also seed a second character and a room (chat 2) with both characters.
  room?: boolean;
  // Also seed a worldless adventure (adventure 1) whose narrator has just
  // offered the ADVENTURE_CHOICES below.
  adventure?: boolean;
}

export const ARIA: SeedCharacter = {
  id: 1,
  name: "Aria",
  description: "A warm, witty companion.",
  prompt: "You are Aria: warm, witty and curious.",
  relationship: "New Friend",
  accent: ["#10B981", "#0EA5A0"],
};

export const KAI: SeedCharacter = {
  id: 2,
  name: "Kai",
  description: "A dry, sarcastic mechanic.",
  prompt: "You are Kai: dry, sarcastic and practical.",
  relationship: "Rival",
  accent: ["#6366F1", "#8B5CF6"],
};

export const ADVENTURE_OPENING = "Rain hammers the door of the sunken archive. A lantern flickers inside.";
export const ADVENTURE_CHOICES: SeedChoice[] = [
  { id: "c1", label: "Push the door open" },
  { id: "c2", label: "Knock three times" },
  { id: "c3", label: "Circle round to the back" },
];

// Formats a narrator reply the way the adventure prompt asks the model to:
// prose, then a <<<CHOICES ... CHOICES>>> block with one option per line.
export const adventureReply = (text: string, choices: string[]) =>
  `${text}\n\n<<<CHOICES\n${choices.map((c, i) => `${i + 1}. ${c}`).join("\n")}\nCHOICES>>>`;

// Fixed so every run seeds identical data (timestamps show up in the UI).
const BASE_TIME = Date.UTC(2026, 0, 15, 12, 0, 0);

export const buildSeed = ({ messages = 30, room = false, adventure = false }: SeedOptions = {}): SeedData => {
  const chatMessages: SeedMessage[] = Array.from({ length: messages }, (_, i) => ({
    id: `seed-1-${i}`,
    timestamp: BASE_TIME + i * 60_000,
    role: i % 2 === 0 ? "ai" : "you",
    txt: i % 2 === 0 ? `Aria message ${i + 1}: how was your day?` : `User message ${i + 1}: it was fine, thanks.`,
    ...(i % 2 === 0 ? { speakerId: ARIA.id } : {}),
  }));
  const data: SeedData = {
    characters: [ARIA],
    chats: [{ id: 1, title: ARIA.name, timestamp: BASE_TIME + messages * 60_000, content: chatMessages, characterIds: [ARIA.id] }],
    adventures: [],
  };
  if (room) {
    data.characters.push(KAI);
    const roomMessages: SeedMessage[] = [
      { id: "seed-2-0", timestamp: BASE_TIME, role: "ai", txt: "Aria: Welcome to the garage!", speakerId: ARIA.id },
      { id: "seed-2-1", timestamp: BASE_TIME + 60_000, role: "ai", txt: "Kai: Don't touch anything.", speakerId: KAI.id },
      { id: "seed-2-2", timestamp: BASE_TIME + 120_000, role: "you", txt: "Hi both." },
    ];
    data.chats.push({ id: 2, title: "Aria & Kai", timestamp: BASE_TIME + 180_000, content: roomMessages, characterIds: [ARIA.id, KAI.id] });
  }
  if (adventure) {
    data.adventures.push({
      id: 1,
      title: "The Sunken Archive",
      timestamp: BASE_TIME,
      characterIds: [],
      premise: "A flooded library hides a map to the old city.",
      status: "active",
      // Not empty: an empty adventure would ask the AI for an opening turn
      // as soon as it opens.
      content: [{ id: "seed-adv-0", timestamp: BASE_TIME, role: "ai", txt: ADVENTURE_OPENING, choices: ADVENTURE_CHOICES }],
    });
  }
  return data;
};

// localStorage keys that get a fresh profile straight into the app: past the
// age gate, and on Ollama, which needs no API key (so no login screen).
export const BASE_LOCAL_STORAGE: Record<string, string> = {
  age_confirmed_18: "true",
  chat_provider: "ollama",
  // Pretend a backup was just made, so the backup reminder banner never
  // shifts the layout under a test.
  last_backup_at: String(Date.now()),
  first_used_at: String(Date.now()),
  // Seeded chats are dated January 2026, so "Previously on..." (#46) would
  // otherwise show (and call the AI) in every test. Its own spec turns it on.
  recap_after_days: "0",
  // Same for the relationship check (#30), which would otherwise add a
  // helper call to every test that sends in the 30-message seed.
  roleplay_style: JSON.stringify({ relationshipSuggestions: false, arcSuggestions: false }),
};

// Writes straight into the app's Dexie database with the raw IndexedDB API.
// Runs after the app has opened (and so created) the database once, so the
// schema already matches what Dexie expects.
const writeSeed = async (page: Page, data: SeedData) => {
  await page.evaluate(async (seed) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["characters", "chats", "adventures"], "readwrite");
      for (const c of seed.characters) tx.objectStore("characters").put(c);
      for (const c of seed.chats) tx.objectStore("chats").put(c);
      for (const a of seed.adventures) tx.objectStore("adventures").put(a);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
};

export interface MockAIRequest {
  stream: boolean;
  model?: string;
  messages: { role: string; content: string }[];
  // The last user-role message: what the app actually asked for this turn.
  prompt: string;
}

type Responder = string | ((req: MockAIRequest) => string);

export interface MockAI {
  // Sets the reply for every following request (a fixed string, or a function
  // of the request). The default reply is "Mock reply N", N counting from 1.
  reply: (responder: Responder) => void;
  // Queues one-off replies, used in order before falling back to `reply`.
  replyOnce: (...texts: string[]) => void;
  // Every chat/completions request seen so far, oldest first.
  requests: MockAIRequest[];
  // Holds back every answer from now until the returned release is called,
  // for a task still running when you leave its screen.
  hold: () => () => void;
}

const sseBody = (text: string) => {
  // Split into a few chunks so the app's streaming path really accumulates deltas.
  const words = text.split(/(?<= )/);
  const chunks = words.map((w) => `data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
  chunks.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
  chunks.push("data: [DONE]\n\n");
  return chunks.join("");
};

const installMockAI = async (page: Page): Promise<MockAI> => {
  const requests: MockAIRequest[] = [];
  const queue: string[] = [];
  let responder: Responder = () => `Mock reply ${requests.length}`;
  let gate: Promise<void> | null = null;

  await page.route("**/chat/completions", async (route: Route) => {
    const body = route.request().postDataJSON() ?? {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
    // A message with a photo (#48) has an array of parts; the prompt is its text.
    const content = lastUser?.content;
    const prompt = Array.isArray(content) ? content.filter((p: any) => p?.type === "text").map((p: any) => p.text).join("\n") : content ?? "";
    const req: MockAIRequest = { stream: !!body.stream, model: body.model, messages, prompt };
    requests.push(req);
    if (gate) await gate;
    const text = queue.length ? queue.shift()! : typeof responder === "function" ? responder(req) : responder;
    if (req.stream) {
      await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: sseBody(text) });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });
    }
  });
  // The settings page asks the provider for its model list.
  await page.route("**/v1/models", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ id: "mock-model" }] }) })
  );

  return {
    reply: (r) => {
      responder = r;
    },
    replyOnce: (...texts) => {
      queue.push(...texts);
    },
    requests,
    hold: () => {
      let release = () => {};
      gate = new Promise<void>((resolve) => {
        release = () => {
          gate = null;
          resolve();
        };
      });
      return release;
    },
  };
};

interface Fixtures {
  seed: SeedOptions | false;
  localStorageOverrides: Record<string, string>;
  mockAI: MockAI;
  seeded: SeedData | null;
}

export const test = base.extend<Fixtures>({
  seed: [{}, { option: true }],
  localStorageOverrides: [{}, { option: true }],

  mockAI: async ({ page }, use) => {
    await use(await installMockAI(page));
  },

  // Auto fixture: runs before every test, so `page` starts on about:blank
  // with storage ready. The test's own first page.goto() is then a full load
  // that reads the seeded data.
  seeded: [
    async ({ page, seed, localStorageOverrides, mockAI }, use) => {
      void mockAI; // installed before the first navigation, so no request escapes
      const storage = { ...BASE_LOCAL_STORAGE, ...localStorageOverrides };
      await page.addInitScript((entries) => {
        // Only on the first load of this test: a test that changes one of
        // these keys (say, the theme) must see its change survive a reload.
        try {
          if (sessionStorage.getItem("__e2e_init")) return;
          sessionStorage.setItem("__e2e_init", "1");
          for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
        } catch {
          // about:blank has no storage; the app's own origin always does.
        }
      }, storage);

      let data: SeedData | null = null;
      if (seed !== false) {
        data = buildSeed(seed);
        await page.goto("./");
        // The home screen only renders once Dexie has opened the database
        // and the (empty) character list has loaded.
        await expect(page.getByRole("heading", { name: "Welcome to Kindred" })).toBeVisible({ timeout: 30_000 });
        await writeSeed(page, data);
        await page.goto("about:blank");
      }
      await use(data);
    },
    { auto: true },
  ],
});

export { expect };

// Opens a hash route (e.g. "/chat/1") with a full page load.
export const openRoute = async (page: Page, route: string) => {
  await page.goto(`./#${route}`);
};

export const openChat = async (page: Page, chatId = 1) => {
  await openRoute(page, `/chat/${chatId}`);
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
};

// Runs one of the chat header's actions by its label. From 1024px up the
// primary ones are icon buttons in the header; everything else (and every
// action below 1024px) sits in the header's "More options" menu.
export const headerAction = async (page: Page, label: string) => {
  const header = page.locator("header").first();
  const button = header.getByRole("button", { name: label, exact: true });
  if (await button.isVisible()) {
    await button.click();
    return;
  }
  await header.getByRole("button", { name: "More options" }).locator("visible=true").click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
};

export const sendMessage = async (page: Page, text: string) => {
  const input = page.getByLabel("Message input");
  await input.fill(text);
  await page.getByRole("button", { name: "Send Message" }).click();
};

// Waits until the AI has finished replying: the composer's Stop button gives
// way to Send again, so the message actions are enabled.
export const waitForReplyDone = async (page: Page) => {
  // A reply can start a moment after the send (a fake clock, a busy
  // machine): give it a second to show the Stop button before waiting for
  // it to go, so "done" never means "not started yet".
  await page.getByRole("button", { name: "Stop Generating" }).waitFor({ timeout: 1000 }).catch(() => {});
  await expect(page.getByRole("button", { name: "Stop Generating" })).toHaveCount(0);
  // An empty composer shows the voice-note button where Send goes (#149),
  // so wait for the box to take input again rather than for Send.
  await expect(page.getByLabel("Message input")).toBeEnabled();
};

// The chat bubble holding `text`, so a message action ("Edit", "Regenerate",
// "Previous variant"...) is clicked on that message and not another one (see
// messageAction for the actions behind the hover toolbar).
// The chat's message list. Message text also shows in the chat list's
// previews (#115), so look for it here rather than on the whole page.
export const chatMessages = (page: Page) => page.getByRole("region", { name: "Messages" });

export const messageBubble = (page: Page, text: string) =>
  page.locator('[data-slot="message-bubble"]').filter({ hasText: text });

// Runs one of a message's actions (#149). A touch screen opens the
// long-press sheet; with a mouse, React and Reply sit in the toolbar that
// appears beside a hovered bubble and everything else is in its "More"
// menu. `bubble` is the bubble's locator, or text inside it.
export const messageAction = async (page: Page, bubble: Locator | string, name: string, options: { exact?: boolean } = {}) => {
  const target = typeof bubble === "string" ? messageBubble(page, bubble).last() : bubble;
  if (await page.evaluate(() => window.matchMedia("(hover: none)").matches)) {
    await target.dispatchEvent("contextmenu");
    await page.getByRole("menu", { name: "Message actions" }).getByRole("menuitem", { name, exact: options.exact }).click();
    return;
  }
  await target.hover();
  const toolbar = target.locator('[data-slot="message-toolbar"]');
  const direct = toolbar.getByRole("button", { name, exact: options.exact });
  if ((await direct.count()) > 0) {
    await direct.first().click();
    return;
  }
  await toolbar.getByRole("button", { name: "More message actions" }).click();
  await page.getByRole("menuitem", { name, exact: options.exact }).click();
};

// Contact info (#151): the character everywhere - their life, inner life,
// how you two are, memory and look - opened from the chat header's title.
export const openContactInfo = async (page: Page) => {
  await page.locator("header").first().getByRole("button", { name: /contact info$/ }).click();
  await expect(page.getByRole("button", { name: "Close contact info" })).toBeVisible();
};

// Flows that use the composer's tool buttons or per-message action buttons
// skip phones for now: both are being redesigned there (a "+" tool menu and
// a long-press message menu), so selectors written today would only break.
export const PHONE_REDESIGN_SKIP = "phone composer/message actions are being redesigned (U3/U7)";

// Opens a collapsed <details> section, retrying until it's really open: a
// click on its summary while the step is still settling can be lost.
export const openDetails = async (section: Locator) => {
  await expect(async () => {
    if ((await section.getAttribute("open")) === null) await section.locator("summary").first().click();
    await expect(section).toHaveAttribute("open", "", { timeout: 1000 });
  }).toPass();
};

// The character editor's steps (#154), by title: the side list on desktop,
// Next and Back on smaller screens (Advanced has its own button there).
const EDITOR_STEPS = ["Who they are", "Look", "Personality", "World and story", "Their life", "Test and finish"];
export const editorStep = async (page: Page, name: string) => {
  const title = page.locator('[data-slot="editor-form"] h2').first();
  const nav = page.getByRole("navigation", { name: "Editor sections" });
  if (await nav.isVisible()) {
    await nav.getByRole("button", { name }).first().click();
  } else if (name === "Advanced") {
    await page.getByRole("button", { name: "Advanced", exact: true }).click();
  } else {
    if ((await title.textContent()) === "Advanced") await page.getByRole("button", { name: "Back to the steps" }).click();
    for (let i = 0; i < 7; i++) {
      const at = EDITOR_STEPS.indexOf((await title.textContent()) || "");
      const want = EDITOR_STEPS.indexOf(name);
      if (at === want) break;
      await page.getByRole("button", { name: at < want ? "Next" : "Back", exact: true }).last().click();
    }
  }
  await expect(title).toHaveText(name);
};
