# WhatsGemini

WhatsGemini is a client-side AI roleplay and chat app built with **React, Redux Toolkit, TypeScript and Tailwind CSS**. Everything (characters, chats, API keys) is stored locally in your browser; there is no backend.

## 🚀 Features

**Providers**
- Chat: Google Gemini, OpenAI, Anthropic (Claude), DeepSeek, Qwen, Kimi, GLM, OpenRouter, and local Ollama. Replies stream in as they're written.
- Blocked replies show a clear error instead of an empty message; out-of-character refusals are flagged and kept out of the AI's context.
- Optional separate background model for memory, compression, diary entries and reply suggestions.
- Images: Gemini, OpenAI, Wan, GLM, or a local/remote Stable Diffusion WebUI. Video: Wan.
- Temperature plus optional Top P, Top K, frequency and presence penalties (each provider gets the ones its API supports).
- Each character can use its own provider, model, temperature and samplers.
- Prompt inspector: "Show what was sent" on any reply shows the exact system prompt (by section, with token estimates), history and reply.

**Characters**
- Step-by-step character editor with AI assist, personality traits, example dialogue, and a live test chat.
- Import/export SillyTavern / chub.ai character cards (V1, V2, V3; JSON or PNG), including alternate greetings, post-history instructions and the embedded lorebook.
- `{{char}}` / `{{user}}` placeholders are filled in with the character's and your persona's names.
- Lorebook (world info): entries injected when a keyword is mentioned (whole-word match), or always ("Always on"). Entries that mention other entries pull them in too, within a size budget. Advanced settings per entry: priority, a second keyword that must also appear, staying active for N messages, scan depth and a trigger chance, all read from and written to SillyTavern cards.
- Diary: a character can keep a private diary about you, written every 30 messages and readable from the Characters page; its latest entry shapes how it acts.
- Emotion portraits: the character reports its mood each reply and the avatar changes to match.
- Content rating (SFW / NSFW). NSFW needs an explicit "all characters are 18+" confirmation and is refused if the card's text suggests a minor. Group chats are only as permissive as their strictest member. NSFW characters can be hidden from the gallery.

**Chats**
- Personas: several user profiles, switchable per chat.
- Alternate opening greetings to pick from before the first message.
- Long-term memory: facts are extracted automatically every few messages, and updated or forgotten when they change. Up to 200 facts, grouped into About you, Relationship and Story; each reply gets the pinned facts plus the most relevant ones. Edit, add, forget or pin them. A chat can keep its own memory instead of sharing the character's.
- Scene panel: per-chat author's note with one-tap presets (sent right before each reply, where models follow it best), setting tags, memory, chapters and bookmarks.
- App-wide roleplay style: point of view, *action* formatting, "never speak for me", time awareness (characters know how long you were away), and custom rules.
- Group chats with several characters, @mentions, muting, and per-room shared memory.
- Branching: regenerate, edit, continue, swipe between variants, rewind.
- Automatic follow-ups (the character can message you first), and auto-compression of long histories into a structured story summary. Compression never deletes anything: older messages and branches stay readable.
- Chapters: end a chapter to get a titled summary and recap; the next reply starts fresh from it.
- Narrative tools: "Write my reply" drafts your next message, "Surprise me" brings in a twist, optional reply suggestions, and slash commands (`/roll 2d6+1` with real dice, `/timeskip`, `/scene`, `/narrate`, `/ooc`, `/image`, `/summarize`, `/help`).
- Export a chat as a readable story (Markdown), or as a JSON backup file.

**Adventures**
- Reusable worlds with their own lore, and narrator-driven adventures with tappable choices and scene illustrations. Narration streams in, long adventures are summarized like chats, and each adventure can set hard limits.

**Boundaries and privacy**
- Per-chat hard limits and an intensity setting for intimate scenes, sent right before each reply.
- `(OOC: ...)` or `((...))` messages are treated as directions to the AI, not dialogue.
- Blur NSFW images until tapped, a discreet chat list, and an optional PIN lock (a privacy screen, not encryption).
- One-time 18+ confirmation on first launch.

**App**
- Themes (Cozy, Neumorphic, Aurora, Terminal, Parchment, Material), all meeting WCAG AA text contrast; full backup and restore; installable as a PWA.
- Works on phones: the composer grows with your text and tucks its tools behind "+", long-press a message for its actions, and panels open as full-screen sheets.

---

## 🛠️ Installation & Setup

### **1️⃣ Clone the Repository**
```sh
git clone https://github.com/vikash-nirwal/WhatsGemini.git
cd WhatsGemini
```

### **2️⃣ Install Dependencies**
```sh
npm install
```

### **3️⃣ Start the App**
```sh
npm start
```

- Runs the app on `http://localhost:3000/`.
- Hot reloading enabled for development.

### **4️⃣ Run the Tests**
```sh
npm test                 # unit tests (Jest)
npm run test:e2e         # UI tests (Playwright: desktop, tablet, iPhone, Pixel)
npm run test:visual      # screenshot tests (macOS baselines, local only)
```

The first UI test run needs the browsers: `npx playwright install chromium webkit`. CI runs the type-check, unit tests and UI tests on every push (`.github/workflows/ci.yml`).

## 📂 Project Structure
```
📦 src
 ┣ 📂 components      atoms / molecules / organisms (UI building blocks)
 ┣ 📂 contexts        auth, theme, modal and sidebar providers
 ┣ 📂 features
 ┃ ┣ 📂 ai
 ┃ ┃ ┣ 📂 providers   one adapter per chat / image / video provider
 ┃ ┃ ┗ 📂 utils       prompt building, lorebook, memory, compression, images
 ┃ ┣ 📂 character     character card import/export
 ┃ ┣ 📂 chat          conversation tree (branching), slash commands, story export
 ┃ ┗ 📜 *Slice.ts     Redux slices (ai, chat, character, world, adventure, settings)
 ┣ 📂 pages           routes (chat, character editor, adventures, settings, ...)
 ┣ 📂 services        IndexedDB (Dexie) and backups
 ┣ 📂 store           Redux store
 ┗ 📂 utils           constants and small helpers
📦 e2e                 Playwright UI tests, fixtures (seeded data, mocked AI) and screenshot baselines
📜 ROADMAP.md          what's still to build
📜 PROGRESS.md         what's done and how the work is run
```

---

## 📌 Technologies Used
- **React** - Frontend framework
- **Redux Toolkit** - State management
- **React Router** - Navigation
- **Dexie.js** - IndexedDB for local storage
- **Google Gen AI SDK** plus direct REST calls for the other providers
- **TypeScript** and **Jest** (via react-scripts)
- **Tailwind CSS** - Styling

---

## 🙌 Contributing
Want to contribute? Feel free to fork the repo and submit a pull request!

---

## 📄 License
This project is open-source and available under the MIT License.

---

## 🛠️ Author
Developed by **Vikash Nirwal**.

📧 Contact: [vikasnirwal73@gmail.com](mailto:vikasnirwal73@gmail.com)

🚀 Happy Coding! 🎉

