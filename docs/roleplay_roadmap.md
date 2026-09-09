# WhatsGemini: Roleplay Platform Roadmap

This document outlines the phased plan to transform **WhatsGemini** from a standard AI
chat interface into a fully-fledged, immersive roleplay platform (similar to
Character.ai, SillyTavern, or JanitorAI).

Phases are ordered to front-load small, low-risk wins that build directly on
infrastructure the app already has, before tackling the larger schema changes later on.
Each phase is scoped to be shippable and independently useful on its own.

---

## Foundations already in place

Worth knowing before reading the phases below, so they aren't accidentally re-built:

- **Conversation tree, not a flat log.** `src/features/chat/messageTree.ts` is a full
  parent/child message DAG (`addChildNode`, `updateNodeMessage`, `deleteBranch`,
  `getSiblingInfo`, `findDefaultLeafFrom`). Editing your own last message and
  Regenerate both already create sibling branches under the same parent
  (`src/pages/ChatPage.tsx`); `deleteBranch` already removes a node *and every
  descendant that followed it* — that's the primitive Phase 1 below builds on.
- **Provider adapter registry.** `src/features/ai/providers/registry.ts` supports
  Gemini, OpenAI, Anthropic, DeepSeek, Qwen, Kimi, and Ollama for chat (plus Gemini/
  OpenAI/local SD WebUI for images) behind one shared `ChatProviderAdapter` interface,
  with a `ProviderCapabilities` flag system (`requiresApiKey`, `requiresBaseUrl`,
  `supportsImageGen`, Gemini-only safety settings) already used to gate Settings UI per
  provider. Any new per-provider capability (Phase 7) should follow this same pattern.
- **Context-length management, by message count.** `compressThreshold` auto-summarizes
  aged-out history into one pinned message (`autoCompressChat`,
  `src/features/aiSlice.ts`), `maxChatLength` hard-truncates the oldest messages
  (`truncateHistory`, `src/features/ai/utils/chatHistoryUtils.ts`), and
  `replyLengthLimit` caps output length via a prompt directive. All three trigger on
  message *count*, not token count — that gap is exactly what Phase 2 closes.
- **Post-hoc token/cost display.** After each reply, `MessageInput.tsx` shows tokens
  used and an estimated cost, read from the provider's own `usageMetadata` and
  `MODEL_PRICING` (`src/utils/constants.ts`). This is reactive, not predictive — nothing
  today estimates tokens *before* a send.
- **Character-initiated follow-ups, voice, auto-selfies, safety settings** already
  exist per character (`Chat.autoReply`, `Character.voiceURI`, `Character.autoSelfie`,
  global `AISafetySettings`) — not revisited below.
- **A single global user persona already exists** — `UserProfileSettings.tsx`, just
  `{ name, bio }`, read directly out of `localStorage` inside `promptComposition.ts`
  rather than passed in as data. Phase 5 builds on this.
- **Custom character JSON import/export already exists** (`CharacterPage.tsx`) but is
  WhatsGemini's own ad-hoc shape — it shares no fields with the TavernAI/SillyTavern
  "Character Card V2" spec that most community characters are distributed in. Phase 8
  is about closing that gap, not adding import/export from scratch.

---

## Phase 1: Message Timeline Controls ✅ Done
*Rewind, delete, and continue — all built on the conversation tree that already exists. This phase gives users full editorial control over the narrative flow.*

**UI / Screen Flow:**
- **Message Context Menu:** Clicking/long-pressing a message reveals new options: "Delete from here" and "Continue generating".
- **Chat Header/Footer:** A "Rewind" button to quickly undo the last turn.

**Implementation Steps:**
- [x] **Delete a Message:** `ChatPage.handleDeleteBranch` no longer requires sibling variants — it now works on any message, always showing a trash icon (both the user dropdown-adjacent row and the AI inline action row). When the node has siblings it behaves exactly as before ("delete this variant"); when it doesn't, `deleteBranch` still removes the node's entire descendant subtree, but the fallback leaf becomes the node's *parent* instead of a sibling — i.e. it rewinds the chat back to just before that message. Confirmation copy adapts to which case applies.
- [x] **Rewind / Truncate Chat:** Added a "Rewind last turn" icon (`FaHistory`, danger-styled) to the chat header actions (`ChatPage.tsx`). `handleRewindLastTurn` finds the last user message in the active path and calls the same `handleDeleteBranch` primitive on it — one primitive, two entry points, as intended.
- [x] **"Continue" Generation:** Added a "Continue" button (next to Regenerate) shown only on the last message in the active path when it's from the AI. `handleContinueMessage` builds history ending on the partial AI message itself (so the model can see what it already said), adds a "continue, don't repeat yourself" directive, and on completion concatenates the new text onto the *same* tree node via `updateNodeMessage` (not a new sibling). Handles messages that end in an embedded `[Image Context: ...]` tag by splicing the continuation in *before* the tag so it stays anchored at the end (required for `stripImageContextTag`'s display-time stripping).
- [x] *Message Editing (Already Implemented)*
- [x] *Regenerate Response (Already Implemented)*

Files touched: `src/pages/ChatPage.tsx`, `src/components/ChatWindow.tsx`, `src/components/chat/ChatMessage.tsx`. Verified in-browser (dev server) against a real chat: delete-with-siblings, delete-without-siblings (rewind), header rewind button, and continue (including the image-context-tag edge case) all confirmed working; `messageTree.test.ts` (27 tests) still passes unchanged since no tree primitives needed modification.

---

## Phase 2: Token-Aware Context Budget ✅ Done
*Transitioning from message-count limits to precise token-based memory management, ensuring the AI never "forgets" unpredictably due to varying message lengths.*

**UI / Screen Flow:**
- **Chat Input Bar:** A small dynamic badge (e.g., "Tokens: 4.2k / 8k") that updates as the user types.
- **Settings Menu:** Sliders for context limits are now represented in tokens (e.g., 4096 tokens) rather than message counts (e.g., 50 messages).

**Implementation Steps:**
- [x] **Client-Side Token Estimator:** New `src/features/ai/utils/tokenEstimator.ts` — `estimateTokens` (chars/4 heuristic, the commonly-cited rule of thumb for English text; there's no tokenizer dependency in this project), `estimateMessageTokens` (adds a small fixed per-message overhead), and `estimateHistoryTokens`. No new dependency added.
- [x] **Pre-Send Budget Indicator:** `MessageInput.tsx` now takes `contextTokens`/`maxContextTokens` props (computed in `ChatPage.tsx` from `buildSystemInstruction` + the active chat's messages, and a new `getModelContextWindow(providerId, model)` lookup in `constants.ts` alongside the existing `MODEL_PRICING` tables). Renders a "Context: 4.2k / 1.0M tokens" row + thin progress bar above the input, recomputing the draft's own token estimate live via `useMemo` on every keystroke and color-coding green→amber→red at 60%/85% utilization.
- [x] **Token-Aware Compression/Truncation:** `truncateHistory` and `buildAutoCompressedMessages` (`chatHistoryUtils.ts`) now walk backwards from the newest message accumulating `estimateMessageTokens`, cutting off/summarizing once the accumulated count exceeds `maxChatLength`/`compressThreshold` (same settings fields, reinterpreted as tokens instead of message counts - both still default to `0` = disabled/unlimited, so existing users see no behavior change unless they'd set a nonzero value). The newest message always survives regardless of its own size, so neither path can empty the history. Settings UI hints in `TextModelSettings.tsx`/`ChatInterfaceSettings.tsx` updated to describe tokens.

Files touched: `src/features/ai/utils/tokenEstimator.ts` (new), `src/features/ai/utils/chatHistoryUtils.ts`, `src/features/aiSlice.ts` (comments only), `src/utils/constants.ts` (`MODEL_CONTEXT_WINDOW`/`PROVIDER_MODEL_CONTEXT_WINDOW`/`getModelContextWindow`), `src/pages/ChatPage.tsx`, `src/components/MessageInput.tsx`, `src/components/settings/TextModelSettings.tsx`, `src/components/settings/ChatInterfaceSettings.tsx`. Verified in-browser: live budget bar updates per keystroke; set `compressThreshold` to a deliberately tiny value (80 tokens) and sent a message - the "Compressed history" summary card correctly fired once the token budget (not message count) was exceeded, then reset the setting back to `0`.

---

## Phase 3: Character Depth — Structured Fields
*Splitting the character's single freeform "prompt" into the distinct fields a real persona needs for consistent behavior.*

**UI / Screen Flow:**
- **Basic Character Editor:** Form fields are split into distinct sections: Personality, Scenario, First Message, and Example Dialogues.

**Implementation Steps:**
- [ ] **Fix the "Example Dialogue" mislabel:** Update `promptComposition.ts` so `character.prompt` is correctly labeled as instructions instead of `"Example dialogue: ..."`.
- [ ] **Personality / Instructions field:** Define a `personality` string field on the `Character` type. Update the builder to inject this as behavioral instructions.
- [ ] **Example Dialogues field:** Add a `mes_example` string field. Update prompt composition to format these clearly as few-shot user/bot exchanges so the LLM adopts the tone and format (e.g., using asterisks for actions).
- [ ] **First Message / Greeting:** Add a `first_mes` field. When a new chat initializes with this character, use this string instead of the generic `LS_INITIAL_MESSAGES`.
- [ ] **Scenario field:** Add a `scenario` string field. Inject this into the system prompt to define the current environmental context or plot setup.

---

## Phase 4: Detailed Character Creation System
*A full-fledged, multi-step creator for characters from scratch, replacing the single-page basic form. This brings the creation tools on par with dedicated roleplay apps like Character.ai or JanitorAI.*

**UI / Screen Flow:**
- **Screen 1: Basic Identity:** Avatar uploader (with AI generation & cropping), Name, Tagline, and discoverability Tags (Fantasy, Sci-Fi, NSFW, etc.).
- **Screen 2: Core Persona:** Text areas for Personality and Instructions, with a live token-cost preview and an "AI Assist: Expand my idea" button.
- **Screen 3: Scenario & Context:** World setup, First Message, and an AI button to "Generate Greeting from Scenario". Includes Alternate Greetings.
- **Screen 4: Example Dialogues:** A mock chat UI to build examples, plus an AI generator to draft examples based on tone.
- **Screen 5: Test & Finalize:** A live side-by-side Test Chat panel to chat with the draft character before saving.

**Implementation Steps:**
- [ ] **Guided Creation Wizard:** Implement a multi-step form UI (using a stepper component) that handles the `Character` object state across the 5 screens.
- [ ] **Advanced Prompt Authoring Tools:** Add real-time token calculation per field. Build the "Test Chat" pane utilizing a temporary in-memory chat session that bypasses the database until the character is saved.
- [ ] **Auto-Generation Assistants:** Wire up lightweight prompt chains to the AI provider to power the "Expand my idea" and "Generate Greeting" buttons.
- [ ] **Avatar Generation & Cropping:** Integrate the existing image generator adapter. Add a simple canvas-based cropping tool for avatars.
- [ ] **Tags & Categories:** Add a `tags: string[]` array to the `Character` schema and build a multi-select chip UI component.

---

## Phase 5: User Persona Expansion
*Fleshing out the user's side of the roleplay with detailed, data-driven personas.*

**UI / Screen Flow:**
- **Persona Manager:** A dedicated settings page listing saved personas (e.g., "Myself", "Elven Mage").
- **Persona Editor:** Fields for Name, Appearance, Backstory, and writing style preferences.
- **Chat Interface:** A dropdown near the chat input to swap personas on the fly.

**Implementation Steps:**
- [ ] **Richer Persona Fields:** Expand the global `UserProfile` type to include `appearance` and `backstory`.
- [ ] **Pass Persona as Data:** Refactor `buildSystemInstruction` to accept the persona object as a parameter rather than reading `localStorage` directly, decoupling the logic.
- [ ] **Multiple Personas:** Migrate from a single object to an array of personas with an `activePersonaId`. Update the UI to allow creating, editing, and switching between them globally or per-chat.

---

## Phase 6: Impersonation
*Allowing the user to steer the scene by writing dialogue/actions as the AI character.*

**UI / Screen Flow:**
- **Composer Mode Toggle:** A button in the input bar (e.g., a "Mask" icon) that switches the input field color to indicate "Impersonation Mode".

**Implementation Steps:**
- [ ] **Impersonate Mode State:** Add a toggle in `MessageInput.tsx`. When active, submitted text is processed with `role: "model"` instead of `role: "user"`.
- [ ] **Tree Insertion:** Pass the custom role through `addChildNode`. The tree structure inherently supports consecutive AI messages, so the next actual AI generation will simply read the impersonated message as part of its own history.

---

## Phase 7: Advanced Generation Settings
*Exposing granular LLM controls (Temperature, Top-P, Top-K, Repetition Penalty) globally and per-character.*

**UI / Screen Flow:**
- **Global Settings:** Advanced sliders in the AI Settings menu for Top-P, Top-K, etc., dynamically gated by the selected provider.
- **Character Overrides:** An "Advanced Options" accordion in the Character Editor to set character-specific generation rules (e.g., high temp for a chaotic bot).

**Implementation Steps:**
- [ ] **Widen the Adapter Contract:** Add `topP`, `topK`, and penalty fields to `ChatCallOptions` in `types.ts`. Implement mapping for these in the Gemini and OpenAI adapters. Use `ProviderCapabilities` to disable unsupported fields (like Top-K for OpenAI).
- [ ] **Global Settings State:** Add these fields to the Redux `settings` slice.
- [ ] **Per-Character Overrides:** Add a `generationOverrides` object to the `Character` schema. Update `aiSlice.ts` to merge these overrides over the global settings when building `turnConfig`.

---

## Phase 8: Character Card Portability
*Supporting the community standard "Character Card V2" spec (TavernAI/SillyTavern) for importing/exporting characters.*

**UI / Screen Flow:**
- **Import/Export Buttons:** In the Character Library, add options to "Import JSON/PNG Card" and "Export as V2 Card".

**Implementation Steps:**
- [ ] **Field Mapping Spec:** Write a translation layer mapping V2 spec fields (`name`, `description`, `personality`, `first_mes`, `mes_example`) to WhatsGemini's internal schema.
- [ ] **JSON Import/Export:** Implement file reader/writer logic for `.json` files conforming to the spec.
- [ ] **PNG Card Parsing (Stretch):** Implement a lightweight PNG chunk reader to extract the `tEXt` chunk labeled `chara`, parse the Base64 JSON inside it, and load it into the app. Implement the reverse for exporting.

---

## Phase 9: Lorebooks / World Info
*A dynamic memory injection system that brings specific lore into context only when relevant keywords are mentioned.*

**UI / Screen Flow:**
- **Lorebook Editor:** A new tab in the Character Editor (or a global page) listing entries. Each entry has a "Keywords" input tag box and a "Content" text area.
- **Token Preview:** A metric showing how much context an entry will consume when triggered.

**Implementation Steps:**
- [ ] **World Info Schema:** Create a `LoreEntry` type (`{ id, keywords: string[], content: string }`) and store it either per-character or globally.
- [ ] **Keyword Trigger System:** Before generating a reply, run a fast string matching algorithm (e.g., Aho-Corasick or simple regex) against the last N messages to find active keywords.
- [ ] **Dynamic Injection:** Append the `content` of triggered entries to a dedicated section (e.g., `[World Info]`) in the system prompt via `buildSystemInstruction`.

---

## Phase 10: Multi-Character Chatrooms — Data Model
*The foundational schema changes required to support group chats with multiple AI bots.*

**UI / Screen Flow:**
- *(No direct UI yet, this is purely data layer migration).*

**Implementation Steps:**
- [ ] **Schema Migration:** Change `Chat.characterId` (string/scalar) to `Chat.characterIds: string[]`. Add a `speakerId` to `Message` for AI turns to identify which bot generated the message. Write a Dexie DB migration script to upgrade existing chats safely.
- [ ] **Speaker-Labeled History:** Update `buildChatHistory` to prefix each message with the speaker's name (e.g., `User: hello`, `BotName: hi`) so the LLM understands the multi-party context.
- [ ] **Audit Single-Character Assumptions:** Refactor image generation, auto-selfie, memory extraction, and voice paths to query the specific `speakerId` of the current message rather than assuming a single `chat.characterId`.

---

## Phase 11: Multi-Character Chatrooms — Room UI
*The frontend interfaces for creating and managing group chats.*

**UI / Screen Flow:**
- **Room Creator:** A UI to name the room, set a scenario, and pick multiple characters from the library using a checkbox list.
- **Chat Interface:** A multi-select or swipeable UI above the input box to dictate who should reply next.
- **Participant Sidebar:** A drawer showing members in the room with quick mute/unmute toggles.

**Implementation Steps:**
- [ ] **Room Creation UI:** Build the form and wire it to create a new `Chat` record with multiple `characterIds`.
- [ ] **Turn Routing Engine:** Implement logic to determine the next speaker. Allow manual overriding (e.g., clicking a bot's avatar to force their reply). Support `@BotName` parsing in the user's message to trigger a specific bot.
- [ ] **Mute/Active State:** Add a `mutedParticipantIds` array to the `Chat` state so bots can be temporarily silenced without being removed from the room.
