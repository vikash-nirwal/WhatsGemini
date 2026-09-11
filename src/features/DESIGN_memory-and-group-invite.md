# Design: Editable memories + "pull a character into a group chat"

Status: draft for review, not yet implemented.

## 1. What already exists

Before designing anything new, here's what's already in the codebase for these two areas — the new work should extend this, not duplicate it.

**Memory** (`Character.memory: string[]`, `src/types/index.ts:113`)
- Auto-extracted every `MEMORY_EXTRACTION_INTERVAL` (12) messages by `extractCharacterMemory` (`aiSlice.ts`) → `mergeMemory` (`ai/utils/memoryExtraction.ts`), capped at `MAX_MEMORY_ENTRIES` (40).
- Injected into every prompt via `promptComposition.ts:108`.
- Editable today only in the narrow sense of **delete-a-fact**: `ScenePanel.tsx` (in-chat drawer) and `CharacterEditorPage.tsx` (character editor, step 5) both render the fact list with a "Forget" (×) button that calls `updateCharacter` with the fact filtered out.
- **Gap**: no way to add a fact by hand, and no way to fix the wording of an extracted fact without deleting and hoping the model re-extracts it later.

**Group chat / rooms** ("Phase 12", per existing comments)
- `Chat.characterIds: number[]` already supports 2+ members; `Chat.mutedParticipantIds` lets you sideline a member without removing them.
- Room-only logic already built: `roomRouting.ts` (round-robin next-speaker, `@name` mention parsing, speaker-prefix stripping), `Message.speakerId` (who in the room said this), per-speaker memory extraction (`ChatPage.tsx:316`, keyed off whichever character generated the reply, not always `characterIds[0]`).
- `Sidebar.tsx`'s "New chat" modal already has a "Group chat" mode: pick 2+ characters *up front*, `addChat({ characterIds, ... })` creates the room.
- `ParticipantsPanel.tsx` exists as a chat-header drawer, but **only supports muting/unmuting existing members** — it has no add/remove UI.
- **Gap** (this is the actual ask): there is no way to take an *existing* chat — either a 1:1 or an existing room — and pull in one more character mid-conversation. The "Participants" header button itself is only rendered when `isRoom` (`characterIds.length > 1`) is already true (`ChatPage.tsx:1014`), so a 1:1 chat has no entry point into this at all today.

So the two deliverables are:
1. **Memory CRUD**: add "add a fact manually" and "edit a fact's text" alongside the existing delete, in both places it's already surfaced (ScenePanel, CharacterEditorPage).
2. **Invite-to-room**: let the user add a character to any open chat (1:1 or room) from the chat itself, converting a 1:1 into a room on first invite, reusing all the existing room machinery above.

## 2. Editable memories

### Data model
No changes needed — `Character.memory` is already `string[]`. Editing in place just means replacing `memory[idx]` instead of splicing it out; adding just means pushing a new string.

### UI changes

Both `ScenePanel.tsx` and `CharacterEditorPage.tsx` render the same shape (fact chip/row + "Forget" button) independently. Rather than introduce a shared component right now (would touch two call sites with slightly different visual chrome — pill vs. row), extend each in place:

- **Add fact**: reuse the exact affordance already used for World tags in `ScenePanel.tsx` (`addingTag` state → inline `<Input>` → commit on Enter/blur) — same interaction pattern the user already sees for a sibling list one section down. `CharacterEditorPage` gets the same "+ Add" affordance in its Memory card.
- **Edit fact**: click the fact text (not the × button) to turn that row into an inline `<Input>` pre-filled with the current text, committed on Enter/blur, Escape to cancel — mirroring how the Author's Note textarea already commits on blur just above it in the same panel.
- Both dispatch the existing `updateCharacter` thunk (`characterSlice.ts`) with a new `memory` array — no new Redux action needed, since "add" and "edit" are both just "replace the whole array," same as delete already does.

### Validation / limits
- Trim whitespace, ignore empty submissions (mirrors `commitTag`'s `if (trimmed)` guard).
- Manually-added facts still count against `MAX_MEMORY_ENTRIES` (40) and go through the same trim-oldest-first eviction in `mergeMemory` — but manual adds bypass `mergeMemory` entirely (they're not "new facts from extraction," they're direct array edits), so apply the same 40-cap inline: if pushing would exceed it, drop the oldest entry first. Worth a one-line note in the UI ("40 facts max, oldest drop off") only if it comes up as confusing — not blocking for v1.
- No dedup-against-existing check on manual add (unlike extraction's dedup) — the user typing a near-duplicate on purpose is their call.

### Not doing
- Not adding per-fact metadata (timestamp, source, pinned/protected-from-eviction flag). Nothing in the ask calls for it, and it would mean a data migration from `string[]` to `{text, ...}[]` touching every read site (`promptComposition.ts`, `mergeMemory`, both panels, `TestChatPane`). Revisit only if the user asks for it explicitly.

## 3. Invite a character into an existing chat (→ group chat)

### Data model
No new fields. Inviting character N into chat C is exactly: `chat.characterIds = [...chat.characterIds, N.id]`. Everything downstream (round-robin, `@mention`, `isRoom` detection, per-speaker memory) already keys off `characterIds.length > 1`, so a 1:1 chat becomes a fully working room the instant this array has 2 entries — no new "room" concept to build.

### New thunk: `updateChatCharacterIds`
Add to `chatSlice.ts`, modeled directly on `updateChatMutedParticipants` (`chatSlice.ts:216`):

```ts
export const addChatParticipant = createAsyncThunk(
  "chat/addChatParticipant",
  async ({ chatId, characterId }: { chatId: number; characterId: number }, { dispatch, rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      if (chat.characterIds?.includes(characterId)) return { chatId, characterIds: chat.characterIds };
      chat.characterIds = [...(chat.characterIds || []), characterId];
      await dbService.updateChat(chat);
      dispatch(fetchChats());
      return { chatId, characterIds: chat.characterIds };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);
```

(A symmetric `removeChatParticipant` is natural to add at the same time — "pull someone out" — since `ParticipantsPanel` currently can only mute, never remove. Small addition, same shape.)

### UI changes

**Entry point.** `ChatPage.tsx:1014` currently gates the "Participants" header button on `isRoom`. Change this to *always* show a "Participants"-equivalent action once there's at least one character in the chat, relabeled contextually:
- 1:1 chat: header action reads "Invite someone" (or similar), opens participants panel directly into "add" mode.
- Existing room: keeps today's "Participants" label/behavior, plus a new "+" affordance inside the panel.

**`ParticipantsPanel.tsx` gets an "Add participant" section**, above or below the existing member list:
- A character picker limited to characters *not already in this chat* (filter `characters` by `!characterIds.includes(c.id)`), reusing the same `CharacterAvatar` + name-row visual as the member list, in a small searchable list (mirror `Sidebar.tsx`'s existing character-search input used in its own New Chat modal — same filter-as-you-type pattern, not a new component).
- Selecting a character dispatches `addChatParticipant({ chatId, characterId })` and closes/collapses the picker back to the member list, now showing the new member.

**Announcing the join.** When a character is invited mid-conversation, drop a lightweight `isSystem` message into `chat.content` (same mechanism already used for the generic seed messages in `addMessage`, `chatSlice.ts:66`) along the lines of `"{Name} joined the chat."` — gives the existing chat log a visible seam instead of the new participant silently appearing mid-thread with no explanation, and gives the model itself a cue in its own context that this person is new to the conversation.
- Optional, worth deciding with the user before building: should the newly-invited character immediately send an opening line (their `first_mes`, if set)? Leaning yes — it mirrors how a brand-new 1:1 chat already seeds itself from `first_mes` in `addMessage` — but flag it as a separate small toggle/behavior rather than bundling silently, since an uninvited AI message firing off automatically could surprise the user.

### Interplay with existing room features
- Round-robin (`resolveNextSpeaker`) already treats "the active participant list" as live input each call — no change needed, the newly added character is simply in rotation from their next `resolveNextSpeaker` call.
- `@mention` targeting already resolves against whatever `roomCharacters` is passed in per-render (`ChatPage.tsx:604,673`) — again no change needed once `characterIds` includes the new member.
- Per-speaker memory extraction (`ChatPage.tsx:317-328`) is keyed by whoever the actual speaker was, so the newly invited character accrues their *own* memory from this point forward, not retroactively from before they joined — correct behavior, no code change needed.
- `characterIds[0]` stays "the primary" for header title/avatar purposes in existing single-character code paths; inviting a second (or third) character never changes who's `[0]`, so a 1:1 chat's original character stays the visual anchor even after it becomes a room. Worth confirming this reads correctly in the UI (header currently shows `roomCharacters.map(c => c.name).join(", ")` once `isRoom`, so this should already look right without changes).

### Not doing
- Not building "remove a character's history" or "fork the chat" on invite — inviting someone doesn't touch existing `content`/`tree`, mirrors how muting already works (member list only, history untouched).
- Not handling the case of inviting the *same* character twice — thunk above no-ops on duplicate `characterId`.

## 4. Open questions for the user before implementation

1. Should an invited character send their `first_mes` greeting immediately, or just silently join and wait for the next natural turn/mention?
2. Should `ParticipantsPanel` also get a "remove participant" action now (symmetric with add), or keep mute as the only way to sideline someone and add "remove" later if asked?
3. For memory editing — is inline click-to-edit the right interaction, or would a small pencil icon next to the × be clearer (avoids accidentally entering edit mode when the user meant to just read the list)?

## 5. Files touched (implementation checklist, once approved)

- `src/features/chatSlice.ts` — add `addChatParticipant` (and optionally `removeChatParticipant`) thunks + reducer cases.
- `src/components/molecules/ParticipantsPanel.tsx` — add-participant picker UI.
- `src/pages/ChatPage.tsx` — un-gate the Participants header action from `isRoom`; wire "invited" system message (+ optional greeting).
- `src/components/organisms/ScenePanel.tsx` — add/edit affordances for Memory section.
- `src/pages/CharacterEditorPage.tsx` — same add/edit affordances in the step-5 Memory card.
