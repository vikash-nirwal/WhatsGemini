# Design references

- `screenshots/`: the app's main screens (26 each) on desktop (1280×800) and iPhone 14, in the default theme (cozy, dark) and the WhatsApp theme (light), with realistic sample content. Taken 2026-10-25.
- `claude-design-prompt.md`: the brief for a spacious UI revamp in Claude Design; attach the screenshots with it.
- `capture-screens.spec.ts`: the Playwright script that took them. To take them again, copy it into `e2e/`, run it, and delete the copy:

```bash
cp design/capture-screens.spec.ts e2e/zz-screens.spec.ts && npx playwright test e2e/zz-screens.spec.ts --project=desktop --project=iphone; rm e2e/zz-screens.spec.ts
```

(The phone run in the default theme stops at its last, optional screen, the new-chat dialog, which is behind the drawer on phones; the other 26 are saved.)
