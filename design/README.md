# Design reference

- `canvas-system.css`: the stylesheet of the Claude Design canvas the UI revamp (#148–#157) followed (https://claude.ai/artifact/M3jbFgiyZEipQ2G5PS5HSt). `src/styles/tokens.css` takes its values from here.
- `capture-screens.spec.ts`: a Playwright script that screenshots the app's main screens (desktop and iPhone, two themes), for a future design pass. To use it, copy it into `e2e/`, run it, and delete the copy:

```bash
cp design/capture-screens.spec.ts e2e/zz-screens.spec.ts && npx playwright test e2e/zz-screens.spec.ts --project=desktop --project=iphone; rm e2e/zz-screens.spec.ts
```
