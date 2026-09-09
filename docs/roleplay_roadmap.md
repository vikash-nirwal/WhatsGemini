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

## Phase 4: Detailed Character Creation System ✅ Done
*A full-fledged, multi-step creator for characters from scratch, replacing the single-page basic form. This brings the creation tools on par with dedicated roleplay apps like Character.ai or JanitorAI.*

**UI / Screen Flow:**
- **Screen 1: Basic Identity:** Avatar uploader (with AI generation & cropping), Name, Tagline, and discoverability Tags (Fantasy, Sci-Fi, NSFW, etc.).
- **Screen 2: Core Persona:** Text areas for Personality and Instructions, with a live token-cost preview and an "AI Assist: Expand my idea" button.
- **Screen 3: Scenario & Context:** World setup, First Message, and an AI button to "Generate Greeting from Scenario". Includes Alternate Greetings.
- **Screen 4: Example Dialogues:** A mock chat UI to build examples, plus an AI generator to draft examples based on tone.
- **Screen 5: Test & Finalize:** A live side-by-side Test Chat panel to chat with the draft character before saving.

**Implementation Steps:**
- [x] **Guided Creation Wizard:** `CharacterEditorPage.tsx` is now a 5-step stepper (Identity → Personality → Scenario & Greeting → Example Dialogues → Review & Save) instead of one long scrolling form. A clickable step pill row shows progress (checkmark for completed steps); jumping forward re-validates every step in between. Step 5 is "Test & Finalize": the review summary (plus the Memory card when editing) on the left and a live Test Chat pane on the right (see below).
- [x] **Tags & Categories:** Added `tags: string[]` on `Character`, plus a new reusable `TagInput` chip component (`components/ui/FormControls.tsx`) wired into step 1 and into character export/import/duplicate.
- [x] **Advanced Prompt Authoring Tools:** Real-time token count added for the Personality field (`~N tokens`, live via the existing `estimateTokens` heuristic). The in-memory Test Chat pane is covered below.
- [x] **Auto-Generation Assistants:** Added `generateAssistText` thunk (`aiSlice.ts`) - a bare one-shot `generateOnce` call with a caller-built instruction, same pattern summarization/memory-extraction already use. Wired to two buttons: "AI Assist: Expand my idea" on the Personality step (turns a short idea into a fuller personality/instructions paragraph, replacing the field in place) and "Generate Greeting from Scenario" on the Scenario & Greeting step (drafts a `first_mes` from the personality + scenario, in the character's voice, asterisk-actions included). Both show inline "Expanding.../Generating..." loading state and an inline error line (no `alert()`) on failure.
- [x] **Test Chat pane:** New `src/components/character/TestChatPane.tsx`, rendered on step 5. Builds a transient `Character` (id `-1`, never written anywhere) from the wizard's live form state and runs it through the exact same `buildTurnContext` → `generateAIResponse` pipeline the real chat uses, so what you test is what you'll get. Messages live only in component state: no Dexie record, no chat in the sidebar, no per-chat usage tracking. Seeds itself with `first_mes` whenever that field changes, has a clear button, typing indicator, Markdown rendering, and an inline error strip. (Note: `generateAIResponse` still flips the global `ai.loading`/`tokenCount`/`costEstimate` slice fields - harmless on the editor page, just not attributed to any chat.)
- [x] **Avatar Generation & Cropping:** New `generateAvatarImage` thunk (`aiSlice.ts`) builds a portrait-optimized prompt from name + appearance and sends it through the existing `generateImage` helper on the configured image provider (Gemini / OpenAI / SD WebUI), passing reference images through. `AvatarGenerateButton.tsx` (loading + inline error) sits under the portrait and hands the resulting image to `AvatarCropDialog.tsx`: a canvas pan-drag + zoom-slider crop inside a fixed 300×400 (3:4) viewport whose "Apply Crop" exports a PNG, writes it through the Image Save Directory handle, and returns a `local:` ref that replaces slot 0 of `appearanceImages`. The crop dialog also auto-opens on the first uploaded reference image, and a "Re-crop Portrait" button appears once a portrait exists (resolves `local:` refs back to a blob URL via the directory handle). Both paths require an Image Save Directory set in Settings and surface errors inline. Known nits: the original uploaded file stays on disk after a crop replaces it, and object URLs aren't revoked.

Files touched (final slice): `src/features/aiSlice.ts` (new `generateAvatarImage` thunk), `src/pages/CharacterEditorPage.tsx` (step 5 → "Test & Finalize" two-column layout, crop-dialog state, avatar generate/re-crop wiring), and new `src/components/character/{TestChatPane,AvatarCropDialog,AvatarGenerateButton}.tsx`. Verified: `tsc --noEmit` clean, `messageTree.test.ts` (27 tests) passes, and the Test Chat pane was exercised live in-browser - a draft "Mira, a cheerful baker who answers in one short sentence" replied in character with a single sentence, with no chat or character persisted. Avatar generation and cropping were **not** live-verified from automation (they need a configured image provider plus a File System Access directory pick, which can't be driven headlessly) - worth one manual try.

Files touched (AI-assist slice): `src/features/aiSlice.ts` (new `generateAssistText` thunk), `src/pages/CharacterEditorPage.tsx` (assist buttons + loading/error state; also fixed an unrelated pre-existing `.substr()` deprecation in `handleImageUpload` while in the file). Verified live in-browser with real API calls: "Expand my idea" turned "A grumpy blacksmith who secretly loves poetry" into a full personality paragraph; "Generate Greeting from Scenario" produced an in-character, asterisk-formatted greeting matching both the expanded personality and the scenario. Both results carried through correctly to the Review step and persisted through save. `messageTree.test.ts` (27 tests) still passes unchanged.

Files touched: `src/types/index.ts` (`tags` on `Character`), `src/components/ui/FormControls.tsx` (new `TagInput`), `src/features/characterSlice.ts`, `src/pages/CharacterEditorPage.tsx` (full stepper rewrite), `src/pages/CharacterPage.tsx` (export). Note: step validation surfaces inline (a dismissable banner keyed off `blockedMessage` state) rather than via `alert()` - a blocking native dialog is both bad UX and breaks browser-automation testing (confirmed live: it froze the tab until closed). Verified live in-browser end to end: stepped through all 5 screens creating a character with tags, personality, scenario, greeting, and example dialogue; confirmed the empty-name guard shows inline (no dialog) and clears once fixed; confirmed tags round-tripped correctly through save and re-edit. `messageTree.test.ts` (27 tests) still passes unchanged.

---

## Phase 5: User Persona Expansion ✅ Done
*Fleshing out the user's side of the roleplay with detailed, data-driven personas.*

**UI / Screen Flow:**
- **Persona Manager:** A dedicated settings page listing saved personas (e.g., "Myself", "Elven Mage").
- **Persona Editor:** Fields for Name, Appearance, Backstory, and writing style preferences.
- **Chat Interface:** A dropdown near the chat input to swap personas on the fly.

**Implementation Steps:**
- [x] **Richer Persona Fields:** `UserProfile` (`types/index.ts`) now has `id`, `name`, `bio`, `appearance?`, `backstory?`.
- [x] **Pass Persona as Data:** `buildSystemInstruction`/`buildTurnContext` (`promptComposition.ts`) now take the active persona as an explicit final parameter instead of reading `localStorage` directly; all 7 call sites in `ChatPage.tsx` plus `TestChatPane.tsx` updated to resolve and pass it.
- [x] **Multiple Personas:** `settingsSlice.ts` replaced the single `userProfile` field with `personas: UserProfile[]` + `activePersonaId`, with `addPersona`/`updatePersona`/`deletePersona`/`setActivePersonaId`/`setPersonas` reducers and a `selectActivePersona` selector. A one-time migration converts an existing single-persona `localStorage` value into a one-item array on first load, so upgrading users don't lose their existing profile. `UserProfileSettings.tsx` is now a full persona manager (add/edit-in-place/delete/mark-active, card per persona). Per-chat override: `Chat.personaId` (new field) + `updateChatPersona` thunk (`chatSlice.ts`), surfaced as a "Persona" action in the chat header (only shown once 2+ personas exist) opening a small picker modal - "Use global default (X)" or any specific persona - rather than the inline dropdown the UI mockup describes, to match this app's existing pattern for per-chat settings (Auto Follow-up, Scene panel both use the same header-action-opens-modal shape).

Files touched: `src/types/index.ts` (`UserProfile` fields, `Chat.personaId`), `src/utils/constants.ts` (`LS_USER_PERSONAS`, `LS_ACTIVE_PERSONA_ID`), `src/features/settingsSlice.ts` (personas array + migration + selector), `src/store/store.ts` (persistence), `src/features/chatSlice.ts` (`updateChatPersona`), `src/features/ai/utils/promptComposition.ts`, `src/pages/ChatPage.tsx` (persona resolution + header action + modal), `src/components/settings/UserProfileSettings.tsx` (rewritten), `src/pages/SettingsPage.tsx` (wiring + import/export, with backward-compat for old single-persona exports), `src/components/Sidebar.tsx` (reads the active persona instead of the old singular profile), `src/components/character/TestChatPane.tsx` (passes the active persona through for realistic test replies). Verified live in-browser: added two personas ("Vikash", "Elven Mage") via the new manager, confirmed the chat header's Persona action only appears with 2+ personas, confirmed picking "Elven Mage" for one chat persisted as that chat's override (modal re-opened showing it checked) independent of the global active persona, and confirmed resetting back to "Use global default" worked. `tsc --noEmit` clean, `messageTree.test.ts` (27 tests) passes.

**Caution for next session:** while iterating on this phase with the dev server's hot-reload running, the old `localStorage["whatsgemini_user_profile"]` key on this machine's browser got overwritten with the literal string `"undefined"` - almost certainly an HMR race (the `store.subscribe` persistence callback firing mid-reload against a state shape that no longer had the old field). The real persona name/bio that was there before is likely unrecoverable; a placeholder was re-entered live during verification and the user was told to double-check/correct it. Prefer restarting the dev server (not just relying on HMR) after a `SettingsState`-shape change, or dispatch through the reducer rather than trust a live `store.subscribe` during an in-place reducer swap.

---

## Phase 6: Autonomous Auto-Reply System ✅ Done
*Overhauling the existing basic `autoReply` flag into a robust, autonomous follow-up system. This makes characters feel alive and proactive by sending timed follow-ups when the user is silent, up to a configurable limit.*

**UI / Screen Flow:**
- **Chat header (not Character Editor):** An "Auto Follow-up" action opens the existing per-chat settings modal - a toggle, "Min delay (seconds)"/"Max delay (seconds)" fields (the actual wait is randomized between them each time), and "Max follow-ups".
- **Sidebar Chat List:** A dynamic badge on the chat row. Shows "Typing..." while a follow-up's delay is ticking down, and "Waiting for you" once the follow-up limit is reached for that streak.
- **Main Chat Window:** A distinct "thinking of reaching out..." indicator (a pulsing clock, not the three-dot typing indicator) displays while the delay timer is active. Typing in the message box pushes the countdown out instead of firing on top of a half-written reply.

**Implementation Steps:**
- [x] **Evaluate Existing System:** Kept and extended the existing `Chat.autoReply` + `sendCharacterFollowup`/`triggerAutoFollowup` + scheduling `useEffect` in `ChatPage.tsx` (already a working, tab-local `setTimeout` MVP) rather than replacing it with a background worker - the gap vs. the roadmap's ask was a fixed single-value cooldown, no cancellation, and no visible indicators, not the timer mechanism itself. Kept per-chat (not per-character) since that's the existing pattern (Auto Follow-up, Scene panel, Persona are all per-chat header actions) - see Phase 5's note for the same reasoning.
- [x] **State & Limit Tracking:** Unchanged - `Chat.autoReply.followupCount`/`maxFollowups` and the reset-on-real-user-message logic (`chatSlice.ts`'s `addMessage`) already did this correctly.
- [x] **Delay Engine & Smart Cancellation:** `Chat.autoReply.cooldownMinutes` (a single fixed wait) replaced with `minDelaySeconds`/`maxDelaySeconds` - `ChatPage.tsx`'s scheduling effect now rolls a random delay in that range once per (chat, message, settings) combination (cached in a ref, so it doesn't re-roll every render) via `normalizeAutoReply`, which also migrates any chat still holding the old `cooldownMinutes` shape into an equivalent fixed range. Cancellation: `MessageInput` gained an `onDraftActivity` callback (fired while the draft is non-empty) that `ChatPage` uses to push the "activity" timestamp forward, so the effect recomputes a later due time instead of firing while the user is mid-draft - typing doesn't cancel the follow-up outright, it delays it, which avoids permanently blocking follow-ups just because the box briefly had text in it.
- [x] **Context-Aware Push Prompting:** The follow-up directive (previously copy-pasted as a raw string in two places in `ChatPage.tsx`) is now a single exported `AUTO_REPLY_DIRECTIVE` constant in `promptComposition.ts`, used by both the scheduler/manual-followup path and the regenerate-a-followup path.
- [x] **Visibility:** New ephemeral (not persisted) `pendingFollowups: Record<chatId, dueAtTimestamp>` in `chatSlice`'s Redux state, set/cleared by the scheduling effect via a new `setPendingFollowupAt` reducer. `ChatWindow` renders a `FollowupIndicator` (pulsing clock + "thinking of reaching out...") whenever it's set for the open chat and no real generation is in flight; `Sidebar` reads the same map to show "Typing..." on any chat row, and derives "Waiting for you" straight from `chat.autoReply.followupCount >= maxFollowups` (works for every chat in the list, not just the open one, since it's read from persisted data).

Files touched: `src/types/index.ts` (`Chat.autoReply` shape), `src/features/ai/utils/promptComposition.ts` (`AUTO_REPLY_DIRECTIVE`), `src/features/chatSlice.ts` (`pendingFollowups` + `setPendingFollowupAt`), `src/pages/ChatPage.tsx` (`normalizeAutoReply`, randomized delay ref, typing-activity tracking, modal fields, indicator wiring), `src/components/MessageInput.tsx` (`onDraftActivity`), `src/components/ChatWindow.tsx` (`FollowupIndicator`, `isFollowupPending`), `src/components/Sidebar.tsx` (badges). Verified live in-browser end to end on a real chat with a real provider: set min/max delay to 8s/12s, watched the sidebar "Typing..." badge and the chat window's "thinking of reaching out..." bubble appear, watched a real in-character follow-up (using the centralized directive, not repeating its last message) land on schedule, confirmed the streak stops at `maxFollowups` and both the modal ("2/2 follow-up(s) sent") and the sidebar ("Waiting for you") reflect it, and confirmed sending a real message resets the streak and starts a fresh countdown. `tsc --noEmit` clean, `messageTree.test.ts` (27 tests) passes.

**Caution for next session:** the typing-interrupt (`onDraftActivity` pushing the due time out) is implemented and type-checks, and the underlying mechanism (advancing `activitySince` and letting the effect's dependency array recompute a later `dueInMs`) is straightforward, but it was **not** cleanly reproduced live - the browser-automation round-trips in this session were slow enough (several real seconds per tool call) that the 8-12s test window kept elapsing before the "type into the box" step landed, so the follow-up fired before the interrupt could be observed in action. Worth a quick manual check next time: open a chat with auto follow-up on a short delay, and start typing right as the "thinking of reaching out..." indicator appears - confirm it doesn't fire out from under you.

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
