# WhatsGemini

Client-side AI roleplay app (React 19, Redux Toolkit, TypeScript, Tailwind, Dexie/IndexedDB). No backend. See README.md for features and structure.

## Plan and progress

- **At the start of every session, read [PROGRESS.md](PROGRESS.md).** It says what's done, what's next and any open questions. Read the matching section of [ROADMAP.md](ROADMAP.md) for the details of the item you're working on.
- Work items in the order PROGRESS.md gives unless the user says otherwise. Refer to items by their roadmap IDs (B1, T2, U4, #14, …).
- **Before ending a session that changed anything, update PROGRESS.md:** each touched item's status, commit and notes; "Where we stand"; a dated line in the session log; any new decision or working note. Keep it short: it's a status board, not a diary.
- If an item turns out different from what ROADMAP.md describes (already fixed, wrong cause, needs splitting), fix ROADMAP.md too and say so in the session log.

## Disk usage report

At the end of every turn in which you changed files or ran commands, run:

```bash
bash scripts/disk-usage.sh
```

In your closing message, give the project total and list anything that looks unused and clearable (merged and clean worktrees, a stale `build/`, caches, test artifacts, Playwright browsers no longer needed), with sizes. **Never delete anything without the user's explicit OK in that conversation.** Before deleting a worktree, confirm it is merged and has no uncommitted changes (the script shows both), and use `git worktree remove`.

## Commands

- `npm start`: dev server on port 3000 (or the `web` config in `.claude/launch.json`).
- `CI=true npm test`: unit tests once, without watch mode.
- `npm run build`: production build into `build/`.

## Conventions

- Match the surrounding code: comments explain *why* in full sentences, like the existing ones.
- Put tests next to the code they cover (`*.test.ts`).
- Use npm, not yarn.
