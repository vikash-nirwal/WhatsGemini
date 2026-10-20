import { test as base, expect, Page, Route } from "@playwright/test";

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

export interface SeedData {
  characters: SeedCharacter[];
  chats: SeedChat[];
}

export interface SeedOptions {
  // Number of messages in the 1:1 chat (alternating you/ai, starting with the AI).
  messages?: number;
  // Also seed a second character and a room (chat 2) with both characters.
  room?: boolean;
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

// Fixed so every run seeds identical data (timestamps show up in the UI).
const BASE_TIME = Date.UTC(2026, 0, 15, 12, 0, 0);

export const buildSeed = ({ messages = 30, room = false }: SeedOptions = {}): SeedData => {
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
      const tx = db.transaction(["characters", "chats"], "readwrite");
      for (const c of seed.characters) tx.objectStore("characters").put(c);
      for (const c of seed.chats) tx.objectStore("chats").put(c);
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

  await page.route("**/chat/completions", async (route: Route) => {
    const body = route.request().postDataJSON() ?? {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
    const req: MockAIRequest = { stream: !!body.stream, model: body.model, messages, prompt: lastUser?.content ?? "" };
    requests.push(req);
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
        await expect(page.getByRole("heading", { name: "Welcome to WhatsGemini" })).toBeVisible({ timeout: 30_000 });
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

export const sendMessage = async (page: Page, text: string) => {
  const input = page.getByLabel("Message input");
  await input.fill(text);
  await page.getByRole("button", { name: "Send Message" }).click();
};
