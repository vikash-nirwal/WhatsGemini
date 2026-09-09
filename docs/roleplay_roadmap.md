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
  provider. Any new per-provider capability (Phase 8) should follow this same pattern.
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
  "Character Card V2" spec that most community characters are distributed in. Phase 9
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

## Phase 3: Character Depth — Structured Fields ✅ Done
*Splitting the character's single freeform "prompt" into the distinct fields a real persona needs for consistent behavior.*

**UI / Screen Flow:**
- **Basic Character Editor:** Form fields are split into distinct sections: Personality, Scenario, First Message, and Example Dialogues.

**Implementation Steps:**
- [x] **Fix the "Example Dialogue" mislabel:** `promptComposition.ts`'s `buildSystemInstruction` now labels `character.prompt` as `"Personality & instructions: ..."` instead of the old, incorrect `"Example dialogue: ..."`. `character.prompt` itself is kept as the one personality/instructions field (already exactly what its UI card and placeholder described) rather than adding a second, redundant `personality` field with no distinct purpose.
- [x] **Example Dialogues field:** Added a new `mes_example` string field on `Character`. When present, `buildSystemInstruction` injects it as a clearly-labeled style-reference block ("Example dialogue showing {name}'s speech style... use only as a style reference, never repeat these lines verbatim").
- [x] **First Message / Greeting:** Added a new `first_mes` string field on `Character`. `chatSlice.addMessage` now seeds a brand-new chat (`chat.content.length === 0`) with this as a normal, visible AI message when the character has one set, falling back to the existing generic `LS_INITIAL_MESSAGES` seed otherwise. Unlike the generic seed pair, it is *not* flagged `isSystem` — it's a real greeting the user should see, not a hidden priming message.
- [x] **Scenario field:** Added a new `scenario` string field on `Character`. Injected into the system prompt via `buildSystemInstruction` as `"Current scenario / setting: ..."`, right after the personality line.

Files touched: `src/types/index.ts` (`scenario`/`first_mes`/`mes_example` on `Character`), `src/features/ai/utils/promptComposition.ts`, `src/features/chatSlice.ts` (`addMessage`'s first-message seeding), `src/features/characterSlice.ts` (`addCharacter` destructure), `src/pages/CharacterEditorPage.tsx` (three new form cards + create/edit/import wiring), `src/pages/CharacterPage.tsx` (character JSON export). Verified live in-browser end to end: created a character ("Nova") with all four fields filled in, confirmed the First Message rendered as a normal visible chat bubble on first open (not hidden), and confirmed the model's actual reply picked up the personality (dry wit), the scenario (coming home after work), and the example dialogue's asterisk-action formatting. `messageTree.test.ts` (27 tests) still passes unchanged.

---

## Phase 4: Detailed Character Creation System 🟡 Partially done
*A full-fledged, multi-step creator for characters from scratch, replacing the single-page basic form. This brings the creation tools on par with dedicated roleplay apps like Character.ai or JanitorAI.*

**UI / Screen Flow:**
- **Screen 1: Basic Identity:** Avatar uploader (with AI generation & cropping), Name, Tagline, and discoverability Tags (Fantasy, Sci-Fi, NSFW, etc.).
- **Screen 2: Core Persona:** Text areas for Personality and Instructions, with a live token-cost preview and an "AI Assist: Expand my idea" button.
- **Screen 3: Scenario & Context:** World setup, First Message, and an AI button to "Generate Greeting from Scenario". Includes Alternate Greetings.
- **Screen 4: Example Dialogues:** A mock chat UI to build examples, plus an AI generator to draft examples based on tone.
- **Screen 5: Test & Finalize:** A live side-by-side Test Chat panel to chat with the draft character before saving.

**Implementation Steps:**
- [x] **Guided Creation Wizard:** `CharacterEditorPage.tsx` is now a 5-step stepper (Identity → Personality → Scenario & Greeting → Example Dialogues → Review & Save) instead of one long scrolling form. A clickable step pill row shows progress (checkmark for completed steps); jumping forward re-validates every step in between. Step 5 is "Review & Save" rather than the roadmap's live "Test & Finalize" chat pane - deferred, see below.
- [x] **Tags & Categories:** Added `tags: string[]` on `Character`, plus a new reusable `TagInput` chip component (`components/ui/FormControls.tsx`) wired into step 1 and into character export/import/duplicate.
- [x] **Advanced Prompt Authoring Tools (partial):** Real-time token count added for the Personality field only (`~N tokens`, live via the existing `estimateTokens` heuristic). The in-memory "Test Chat" pane is deferred (see below).
- [x] **Auto-Generation Assistants:** Added `generateAssistText` thunk (`aiSlice.ts`) - a bare one-shot `generateOnce` call with a caller-built instruction, same pattern summarization/memory-extraction already use. Wired to two buttons: "AI Assist: Expand my idea" on the Personality step (turns a short idea into a fuller personality/instructions paragraph, replacing the field in place) and "Generate Greeting from Scenario" on the Scenario & Greeting step (drafts a `first_mes` from the personality + scenario, in the character's voice, asterisk-actions included). Both show inline "Expanding.../Generating..." loading state and an inline error line (no `alert()`) on failure.
- [ ] **Test Chat pane:** Deferred - step 5 is a static review summary, not a live in-memory chat session.
- [ ] **Avatar Generation & Cropping:** Deferred - avatar upload still has no AI generation or canvas cropping step.

Files touched (this slice): `src/features/aiSlice.ts` (new `generateAssistText` thunk), `src/pages/CharacterEditorPage.tsx` (assist buttons + loading/error state; also fixed an unrelated pre-existing `.substr()` deprecation in `handleImageUpload` while in the file). Verified live in-browser with real API calls: "Expand my idea" turned "A grumpy blacksmith who secretly loves poetry" into a full personality paragraph; "Generate Greeting from Scenario" produced an in-character, asterisk-formatted greeting matching both the expanded personality and the scenario. Both results carried through correctly to the Review step and persisted through save. `messageTree.test.ts` (27 tests) still passes unchanged.

Files touched: `src/types/index.ts` (`tags` on `Character`), `src/components/ui/FormControls.tsx` (new `TagInput`), `src/features/characterSlice.ts`, `src/pages/CharacterEditorPage.tsx` (full stepper rewrite), `src/pages/CharacterPage.tsx` (export). Note: step validation surfaces inline (a dismissable banner keyed off `blockedMessage` state) rather than via `alert()` - a blocking native dialog is both bad UX and breaks browser-automation testing (confirmed live: it froze the tab until closed). Verified live in-browser end to end: stepped through all 5 screens creating a character with tags, personality, scenario, greeting, and example dialogue; confirmed the empty-name guard shows inline (no dialog) and clears once fixed; confirmed tags round-tripped correctly through save and re-edit. `messageTree.test.ts` (27 tests) still passes unchanged.

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

## Phase 6: Autonomous Auto-Reply System
*Overhauling the existing basic `autoReply` flag into a robust, autonomous follow-up system. This makes characters feel alive and proactive by sending timed follow-ups when the user is silent, up to a configurable limit.*

**UI / Screen Flow:**
- **Character Editor:** A new toggle for "Autonomous Follow-ups" (disabled by default) with sliders for "Max consecutive follow-ups" (e.g., 3) and "Delay interval" (e.g., 30s - 2m).
- **Sidebar Chat List:** A dynamic badge on the character's chat row. Shows "Typing..." when a follow-up is ticking down, and a "Waiting for you" icon when the auto-reply limit is reached.
- **Main Chat Window:** A typing indicator displays while the delay timer is active. If the user starts typing, the indicator pauses/cancels.

**Implementation Steps:**
- [ ] **Evaluate Existing System:** Assess the current `Chat.autoReply` implementation. Decide whether to refactor it to support timers and limits, or rip it out and replace it with a dedicated background worker/timer queue in Redux.
- [ ] **State & Limit Tracking:** Add `autoReplyCount` to the active chat state. Increment it on every autonomous send. Reset it to 0 the moment the user sends a message. Stop scheduling follow-ups if `autoReplyCount >= maxFollowUps`.
- [ ] **Delay Engine & Smart Cancellation:** Implement a timer mechanism (e.g., `setTimeout` linked to Redux or a saga) that waits before triggering the next generation. Add an interrupt listener so if the user types or sends a message, the pending auto-reply timer is cleared immediately.
- [ ] **Context-Aware Push Prompting:** Modify `buildSystemInstruction` or the message dispatch payload. If `isAutoReply` is true, append a hidden system directive to the prompt: *"[System Note: The user has not responded. Take the initiative, advance the plot, ask a direct question, or perform a physical action.]"* to prevent the LLM from simply repeating its last message.

---

## Phase 7: Impersonation
*Allowing the user to steer the scene by writing dialogue/actions as the AI character.*

**UI / Screen Flow:**
- **Composer Mode Toggle:** A button in the input bar (e.g., a "Mask" icon) that switches the input field color to indicate "Impersonation Mode".

**Implementation Steps:**
- [ ] **Impersonate Mode State:** Add a toggle in `MessageInput.tsx`. When active, submitted text is processed with `role: "model"` instead of `role: "user"`.
- [ ] **Tree Insertion:** Pass the custom role through `addChildNode`. The tree structure inherently supports consecutive AI messages, so the next actual AI generation will simply read the impersonated message as part of its own history.

---

## Phase 8: Advanced Generation Settings
*Exposing granular LLM controls (Temperature, Top-P, Top-K, Repetition Penalty) globally and per-character.*

**UI / Screen Flow:**
- **Global Settings:** Advanced sliders in the AI Settings menu for Top-P, Top-K, etc., dynamically gated by the selected provider.
- **Character Overrides:** An "Advanced Options" accordion in the Character Editor to set character-specific generation rules (e.g., high temp for a chaotic bot).

**Implementation Steps:**
- [ ] **Widen the Adapter Contract:** Add `topP`, `topK`, and penalty fields to `ChatCallOptions` in `types.ts`. Implement mapping for these in the Gemini and OpenAI adapters. Use `ProviderCapabilities` to disable unsupported fields (like Top-K for OpenAI).
- [ ] **Global Settings State:** Add these fields to the Redux `settings` slice.
- [ ] **Per-Character Overrides:** Add a `generationOverrides` object to the `Character` schema. Update `aiSlice.ts` to merge these overrides over the global settings when building `turnConfig`.

---

## Phase 9: Character Card Portability
*Supporting the community standard "Character Card V2" spec (TavernAI/SillyTavern) for importing/exporting characters.*

**UI / Screen Flow:**
- **Import/Export Buttons:** In the Character Library, add options to "Import JSON/PNG Card" and "Export as V2 Card".

**Implementation Steps:**
- [ ] **Field Mapping Spec:** Write a translation layer mapping V2 spec fields (`name`, `description`, `personality`, `first_mes`, `mes_example`) to WhatsGemini's internal schema.
- [ ] **JSON Import/Export:** Implement file reader/writer logic for `.json` files conforming to the spec.
- [ ] **PNG Card Parsing (Stretch):** Implement a lightweight PNG chunk reader to extract the `tEXt` chunk labeled `chara`, parse the Base64 JSON inside it, and load it into the app. Implement the reverse for exporting.

---

## Phase 10: Lorebooks / World Info
*A dynamic memory injection system that brings specific lore into context only when relevant keywords are mentioned.*

**UI / Screen Flow:**
- **Lorebook Editor:** A new tab in the Character Editor (or a global page) listing entries. Each entry has a "Keywords" input tag box and a "Content" text area.
- **Token Preview:** A metric showing how much context an entry will consume when triggered.

**Implementation Steps:**
- [ ] **World Info Schema:** Create a `LoreEntry` type (`{ id, keywords: string[], content: string }`) and store it either per-character or globally.
- [ ] **Keyword Trigger System:** Before generating a reply, run a fast string matching algorithm (e.g., Aho-Corasick or simple regex) against the last N messages to find active keywords.
- [ ] **Dynamic Injection:** Append the `content` of triggered entries to a dedicated section (e.g., `[World Info]`) in the system prompt via `buildSystemInstruction`.

---

## Phase 11: Multi-Character Chatrooms — Data Model
*The foundational schema changes required to support group chats with multiple AI bots.*

**UI / Screen Flow:**
- *(No direct UI yet, this is purely data layer migration).*

**Implementation Steps:**
- [ ] **Schema Migration:** Change `Chat.characterId` (string/scalar) to `Chat.characterIds: string[]`. Add a `speakerId` to `Message` for AI turns to identify which bot generated the message. Write a Dexie DB migration script to upgrade existing chats safely.
- [ ] **Speaker-Labeled History:** Update `buildChatHistory` to prefix each message with the speaker's name (e.g., `User: hello`, `BotName: hi`) so the LLM understands the multi-party context.
- [ ] **Audit Single-Character Assumptions:** Refactor image generation, auto-selfie, memory extraction, and voice paths to query the specific `speakerId` of the current message rather than assuming a single `chat.characterId`.

---

## Phase 12: Multi-Character Chatrooms — Room UI
*The frontend interfaces for creating and managing group chats.*

**UI / Screen Flow:**
- **Room Creator:** A UI to name the room, set a scenario, and pick multiple characters from the library using a checkbox list.
- **Chat Interface:** A multi-select or swipeable UI above the input box to dictate who should reply next.
- **Participant Sidebar:** A drawer showing members in the room with quick mute/unmute toggles.

**Implementation Steps:**
- [ ] **Room Creation UI:** Build the form and wire it to create a new `Chat` record with multiple `characterIds`.
- [ ] **Turn Routing Engine:** Implement logic to determine the next speaker. Allow manual overriding (e.g., clicking a bot's avatar to force their reply). Support `@BotName` parsing in the user's message to trigger a specific bot.
- [ ] **Mute/Active State:** Add a `mutedParticipantIds` array to the `Chat` state so bots can be temporarily silenced without being removed from the room.
