# Progress

Where the [ROADMAP.md](ROADMAP.md) work stands. ROADMAP.md says *what* and *why* for each item; this file says *what's done*. Update it at the end of every session that changes anything (see CLAUDE.md).

Status values: `todo`, `in progress`, `done`, `skipped` (with a reason), `blocked` (with what it's waiting on).

## Where we stand

- **Current phase:** Phase 0, on branch `phase-0-bug-fixes` (not pushed, no PR yet).
- **Next up:** B4 (memory updates and forgetting), then B5, then B6.
- **Open questions for the user:** none yet.

## Phase 0: Logic bugs

| # | Item | Status | Commit | Notes |
|---|------|--------|--------|-------|
| B1 | Mood portrait wipes custom emotions | done | see log | Not checked in the app (needs an image provider); the fix is a one-line spread. |
| B2 | Group-chat impersonate posts as first character | done | see log | Checked in the app: picked Kai, impersonated, stored `speakerId` was Kai. The composer banner names the picked speaker. |
| B3 | Compression/truncation use the global seed count | done | see log | `countSeedMessages` / `countProtectedPrefix` in `transcript.ts`; `truncateHistory` moved there and now also protects the compression summary. Tests in `transcript.test.ts`. Legacy chats whose seed messages were never flagged `isSystem` aren't detected (only the display filter in ChatWindow handles those). |
| B4 | Memory can't update or forget facts | todo | | |
| B5 | Compression destroys branches and history | todo | | Large. B6 depends on it. Also picks up B7's leftover: run auto-compression on edit-and-resend. |
| B6 | Adventures skip the chat pipeline | todo | | After B5. |
| B7 | Edit-and-resend drops image prompt, skips compression | done (partly) | see log | Image prompt/params kept. Auto-compression on this path moved to B5, because today's compression would delete the branch the edit just made. |

## Phase 0.5: UI tests and layout fixes

| # | Item | Status | Commit | Notes |
|---|------|--------|--------|-------|
| T1 | Playwright setup, 4 viewport projects | todo | | |
| T2 | Seed fixtures and mocked AI replies | todo | | |
| T3 | Layout geometry checks | todo | | Added alongside each U fix. |
| T4 | Flow tests | todo | | |
| T5 | Screenshot tests | todo | | |
| T6 | Accessibility scan | todo | | |
| T7 | GitHub Actions CI | todo | | |
| U1 | Multi-line input overflows composer | todo | | |
| U2 | Composer covers latest messages | todo | | |
| U3 | Phone composer too narrow | todo | | |
| U4 | Sidebar crowds chat at tablet width | todo | | |
| U5 | Mobile drawer stays open after navigating | todo | | |
| U6 | `100vh` wrong on phones | todo | | |
| U7 | Bubbles waste space on touch | todo | | |
| U8 | Scroll button and toasts collide with composer | todo | | |
| U9 | Wizard step bars scroll sideways on phones | todo | | |

## Phases 1–7: Features

All `todo`. Item numbers 1–33 match ROADMAP.md. Rows are added here when an item is started, so this file stays short.

| # | Item | Status | Commit | Notes |
|---|------|--------|--------|-------|

## Decisions

Choices made along the way that a later session shouldn't revisit. Add the date.

- 2026-10-20: Work happens on a branch per phase (`phase-0-bug-fixes` first), not directly on `main`.
- 2026-10-20: Layout is tested with Playwright in real browsers. Jest/jsdom stays for logic and component behavior only, since jsdom can't measure layout.

## Working notes

Facts that save the next session time.

- **Run the app:** `.claude/launch.json` has a `web` config (`npm start`, port 3000) for the browser pane.
- **Get past the login and 18+ gate without a key:** set localStorage `age_confirmed_18 = "true"` and `chat_provider = "ollama"` (a keyless provider), then reload.
- **Seed test data:** IndexedDB database `ChatAppDB`, tables `chats`, `characters`, `worlds`, `adventures`, `settings`. Message roles are `"you"` and `"ai"` (not `user`/`model`). "Try a sample character" on the home screen creates character + chat 1.
- **Lockfiles:** both `package-lock.json` and `yarn.lock` exist. Use npm (the scripts and README do).

## Session log

Newest first. One or two lines per session: what changed, and anything left half-done.

- 2026-10-20: Fixed B1, B2, B3 and B7 (image prompt part) in one commit on `phase-0-bug-fixes`. 211 unit tests pass, typecheck clean.
- 2026-10-20: With the user's OK, cleared about 760 MB: removed the merged `image-backup-2` worktree, `build/` and `node_modules/.cache/gh-pages`. The local branch `worktree-image-backup-2` still exists (merged in PR #1). The dev-server caches were kept.
- 2026-10-20: Reviewed the app; wrote ROADMAP.md (logic bugs, UI tests and layout bugs, 33 feature ideas). Added `.claude/launch.json`, this file, CLAUDE.md and `scripts/disk-usage.sh`. No app code changed.
