# WhatsGemini

WhatsGemini is a client-side AI roleplay and chat app built with **React, Redux Toolkit, TypeScript and Tailwind CSS**. Everything (characters, chats, API keys) is stored locally in your browser; there is no backend.

## 🚀 Features

**Providers**
- Chat: Google Gemini, OpenAI, Anthropic (Claude), DeepSeek, Qwen, Kimi, GLM, OpenRouter, and local Ollama. Replies stream in as they're written.
- Blocked replies show a clear error instead of an empty message; out-of-character refusals are flagged and kept out of the AI's context.
- Optional separate background model for memory and compression.
- Images: Gemini, OpenAI, Wan, GLM, or a local/remote Stable Diffusion WebUI. Video: Wan.
- Temperature plus optional Top P, Top K, frequency and presence penalties (each provider gets the ones its API supports).

**Characters**
- Step-by-step character editor with AI assist, personality traits, example dialogue, and a live test chat.
- Import/export SillyTavern / chub.ai character cards (V1, V2, V3; JSON or PNG), including alternate greetings, post-history instructions and the embedded lorebook.
- `{{char}}` / `{{user}}` placeholders are filled in with the character's and your persona's names.
- Lorebook (world info): entries injected when a keyword is mentioned (whole-word match), or always ("Always on"). Entries that mention other entries pull them in too, within a size budget.
- Emotion portraits: the character reports its mood each reply and the avatar changes to match.

**Chats**
- Personas: several user profiles, switchable per chat.
- Alternate opening greetings to pick from before the first message.
- Long-term memory: facts are extracted automatically every few messages. Edit, add, forget or pin them (pinned facts are never dropped).
- Scene panel: per-chat author's note (sent right before each reply, where models follow it best), setting tags, and memory.
- App-wide roleplay style: point of view, *action* formatting, "never speak for me", time awareness (characters know how long you were away), and custom rules.
- Group chats with several characters, @mentions, muting, and per-room shared memory.
- Branching: regenerate, edit, continue, swipe between variants, rewind.
- Automatic follow-ups (the character can message you first), and auto-compression of long histories into a structured story summary.

**Adventures**
- Reusable worlds with their own lore, and narrator-driven adventures with tappable choices and scene illustrations.

**App**
- Themes, full backup and restore, installable as a PWA.

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
npm test
```

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
 ┃ ┣ 📂 chat          conversation tree (branching)
 ┃ ┗ 📜 *Slice.ts     Redux slices (ai, chat, character, world, adventure, settings)
 ┣ 📂 pages           routes (chat, character editor, adventures, settings, ...)
 ┣ 📂 services        IndexedDB (Dexie) and backups
 ┣ 📂 store           Redux store
 ┗ 📂 utils           constants and small helpers
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

