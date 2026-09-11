# Adding a new color theme

WhatsGemini has two independent visual axes:

1. **Light/dark mode** — `theme`/`toggleTheme` in `src/contexts/ThemeContext.tsx`,
   toggles the `.dark` class on `<html>`. Not what this doc is about.
2. **Color theme** — `colorTheme`/`setColorTheme`, today `"cozy"` (default),
   `"neumorphic"`, `"aurora"`. Sets `data-theme="name"` on `<html>`. **This is
   what adding a new theme means.**

A theme can optionally add a **third, independent sub-axis** — a choice within
the theme itself. Aurora does this: `data-palette="violet|ocean|forest|sunset"`
picks which brand hue the theme uses, on top of whichever `data-theme` and
`.dark` are already set. Only add this if your theme genuinely needs more than
one look; most themes won't.

Everything renders off two selectors on `<html>`: `[data-theme="name"]` and
`[data-theme="name"].dark`. `tokens.css` is the only file that needs to know
what a theme's colors actually *are* — components never hardcode a color, they
read a CSS variable or a handful of always-safe utility classes (below).

## The mechanism in one paragraph

Every component either (a) uses a Tailwind class that resolves through a CSS
variable (`bg-card`, `text-foreground`, `border-input`, ...) — automatically
theme-reactive, nothing to do — or (b) opts into one of 6 generic surface
classes (`surface-sunken`, `surface-raised`, `surface-raised-sm`, `cta-surface`,
`surface-elevated`, `surface-panel`) as a **plain static string, unconditionally**.
Those 6 classes are only ever *defined* inside a specific theme's
`[data-theme="x"]` block in `tokens.css`, so under any theme that doesn't
define them they're simply absent selectors — free no-ops. This is why adding
a theme almost never means touching a `.tsx` file: you add CSS, and every
component that already opted into these classes picks up your theme
automatically. `useColorTheme()`'s `is()` helper is the escape hatch for the
rare component whose actual DOM shape differs per theme (see "Structural
exceptions" below) — a new theme only needs it if it wants a third distinct
shape there, not for anything else.

---

## Step-by-step: adding a theme

Say you're adding a theme called **"lumen"**. Here's the exact sequence,
in order.

### 1. Pick your base colors

Decide, for both light and dark:
- A page background, a card/surface color, a primary brand color, a
  secondary/neutral surface, and text colors with enough contrast on each.
- Convert every color to an `R G B` triple (not hex) — e.g. `#4F46E5` →
  `79 70 229`. `tokens.css` stores colors this way so Tailwind's
  `rgb(var(--x) / <alpha-value>)` pattern can vary opacity per-usage.

### 2. Add the two blocks to `tokens.css`

Append near the bottom, following the exact shape of the `aurora`/`neumorphic`
blocks already there. Every var below is **required** (copy cozy's `:root`
values for anything you don't want to change):

```css
[data-theme="lumen"] {
  --background: 245 245 250;
  --foreground: 20 20 30;
  --card: 255 255 255;
  --card-foreground: 20 20 30;
  --popover: 255 255 255;
  --popover-foreground: 20 20 30;
  --primary: 79 70 229;          /* #4F46E5 */
  --primary-foreground: 255 255 255;
  --primary-hover: 99 91 245;
  --secondary: 237 237 245;
  --secondary-foreground: 20 20 30;
  --muted: 237 237 245;
  --muted-foreground: 100 100 120;
  --accent: 237 237 245;
  --accent-foreground: 20 20 30;
  --destructive: 220 38 38;
  --destructive-foreground: 255 255 255;
  --success: 22 163 74;
  --success-foreground: 255 255 255;
  --overlay: 20 20 30;
  --subtle: 140 140 160;
  --border: 220 220 235;
  --input: 220 220 235;
  --ring: 79 70 229;
  --radius: 10px;
  --shadow-soft: rgba(20, 20, 60, 0.08);
  --shadow-mid: rgba(20, 20, 60, 0.14);
  --shadow-strong: rgba(20, 20, 60, 0.2);

  /* app brand palette - see "Required tokens" table below for what each means */
  --color-app-bg: 245 245 250;
  --color-panel-bg: 255 255 255;
  --color-panel2-bg: 237 237 245;
  --color-panel3-bg: 237 237 245;
  --color-hover-bg: 237 237 245;
  --color-chat-bg: 245 245 250;
  --color-text-main: 20 20 30;
  --color-text-muted: 100 100 120;
  --color-text-faint: 150 150 170;
  --color-primary: 79 70 229;
  --color-primary-hover: 99 91 245;
  --color-accent: 79 70 229;
  --color-accent-2: 99 91 245;
  --color-on-accent: 255 255 255;
  --color-secondary: 237 237 245;
  --color-secondary-hover: 230 230 242;
  --color-on-secondary: 20 20 30;
  --color-border-main: 220 220 235;
}

[data-theme="lumen"].dark {
  --background: 18 18 26;
  --foreground: 240 240 248;
  --card: 28 28 40;
  --card-foreground: 240 240 248;
  --popover: 28 28 40;
  --popover-foreground: 240 240 248;
  --primary: 129 121 245;
  --primary-foreground: 255 255 255;
  --primary-hover: 148 141 255;
  --secondary: 36 36 50;
  --secondary-foreground: 240 240 248;
  --muted: 36 36 50;
  --muted-foreground: 160 160 180;
  --accent: 36 36 50;
  --accent-foreground: 240 240 248;
  --destructive: 248 113 113;
  --destructive-foreground: 20 20 30;
  --success: 74 222 128;
  --success-foreground: 15 21 18;
  --overlay: 18 18 26;
  --subtle: 160 160 180;
  --border: 48 48 64;
  --input: 48 48 64;
  --ring: 129 121 245;
  --shadow-soft: rgba(0, 0, 0, 0.3);
  --shadow-mid: rgba(0, 0, 0, 0.45);
  --shadow-strong: rgba(0, 0, 0, 0.6);

  --color-app-bg: 18 18 26;
  --color-panel-bg: 28 28 40;
  --color-panel2-bg: 36 36 50;
  --color-panel3-bg: 36 36 50;
  --color-hover-bg: 36 36 50;
  --color-chat-bg: 18 18 26;
  --color-text-main: 240 240 248;
  --color-text-muted: 160 160 180;
  --color-text-faint: 120 120 140;
  --color-primary: 129 121 245;
  --color-primary-hover: 148 141 255;
  --color-accent: 129 121 245;
  --color-accent-2: 148 141 255;
  --color-on-accent: 255 255 255;
  --color-secondary: 36 36 50;
  --color-secondary-hover: 44 44 58;
  --color-on-secondary: 240 240 248;
  --color-border-main: 48 48 64;
}
```

That alone is a **complete, working theme** — every component falls back to
its plain flat/bordered look with lumen's colors. Everything past this point
is optional polish.

### 3. Register it in `src/utils/constants.ts`

```ts
export const COLOR_THEMES = [
  { value: "cozy", label: "Cozy", description: "Warm terracotta and cream - the original look" },
  { value: "neumorphic", label: "Neumorphic", description: "Soft gray-green palette with raised, pillowy surfaces" },
  { value: "aurora", label: "Aurora", description: "Vibrant gradient look with a choice of 4 accent palettes" },
  { value: "lumen", label: "Lumen", description: "Clean indigo-on-white, high-contrast" },
] as const;
```

(`COLOR_THEMES` is declared `as const` specifically so `useColorTheme()`'s
`is()` helper can type-check its argument against this exact list — a typo
like `is("lumin")` is a compile error, not a silent no-op.)

### 4. Add a swatch to `src/components/organisms/AppearanceSettings.tsx`

```ts
const THEME_SWATCHES: Record<string, [string, string, string]> = {
  cozy: ['#F7F1EC', '#E0562E', '#2A1E1A'],
  neumorphic: ['#E8EAEC', '#268B68', '#22262B'],
  aurora: ['#F4F0FB', '#8B5CF6', '#1A1330'],
  lumen: ['#F5F5FA', '#4F46E5', '#14141E'],
};
```

That's it — Settings → Appearance now lists lumen as a real option, and
picking it sets `data-theme="lumen"` end to end. Run the app and click
through it before doing anything further.

---

## Optional polish, in order of how much it matters

### A. Opt individual components into a raised/sunken/CTA look

If lumen's flat default (from step 2) is fine everywhere, skip this. If you
want, say, inputs to look recessed or the primary button to carry a gradient,
add rules to `tokens.css` under the same `[data-theme="lumen"]` selector,
using these exact class names (nothing to change in any `.tsx` file — every
consumer already applies these classes unconditionally):

```css
[data-theme="lumen"] .surface-sunken {
  background-color: rgb(var(--muted));
}
[data-theme="lumen"] .cta-surface {
  background-image: linear-gradient(120deg, rgb(var(--primary)), rgb(var(--primary-hover)));
}
```

| Class | Where it's already applied | What it should do |
|---|---|---|
| `.surface-sunken` | `Input`, `Textarea`, `SelectTrigger`, `TagInput`, a few settings preview boxes | recessed/filled look |
| `.surface-raised` | `Card`, `Button`'s `secondary`/`panel`/`destructive`/`outline` variants, `Header`'s icon buttons | subtly lifted |
| `.surface-raised-sm` | `Switch`'s thumb, `TagInput`'s chips | same, smaller |
| `.cta-surface` | `Button`'s `default` variant, the active-persona badge | primary call-to-action treatment |
| `.surface-elevated` | `Button`'s `outline` variant, `ProviderPicker`'s inactive pills | a chip lighter than the page behind it |
| `.surface-panel` | `Card`, `DialogContent`, `AlertDialogContent` | the surface a modal/card sits on |

Define only the ones you actually want non-default — anything you skip stays
flat, which is a perfectly fine end state, not a broken one. Keep every rule
**outside any `@layer`** (don't wrap it in one) — that's what lets it win over
Tailwind's own layered utilities without `!important`, matching every
existing theme's rules.

### B. A non-flat app shell (glass sidebar, gradient page background, ...)

This is the most involved kind of customization — aurora's glowing page
background and frosted sidebar are the reference example. It's DOM-selector
CSS, not a class components opt into, so add a comment in `tokens.css`
pointing at the components it touches (there's nothing in *their* source
hinting at it otherwise):

```css
[data-theme="lumen"] aside[aria-label="Sidebar"] {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(16px);
}
```

Only reach for this if the theme genuinely wants a different app shell shape,
not for ordinary color changes.

### C. A second axis, like aurora's 4 accent palettes

Only if lumen itself should offer more than one look (aurora's "Violet /
Ocean / Forest / Sunset" picker inside the Aurora theme). Follow the
`[data-theme="x"][data-palette="y"]` pattern:

```css
[data-theme="lumen"][data-palette="rose"] {
  --primary: 225 29 72;
  --color-primary: 225 29 72;
  /* ...override only the handful of brand-hue vars, not the whole block */
}
[data-theme="lumen"][data-palette="rose"].dark { /* same, dark values */ }
```

Then add a `LUMEN_PALETTES` constant (mirror `AURORA_PALETTES` in
`constants.ts`) and a picker UI (mirror the `colorTheme === 'aurora' && (...)`
block in `AppearanceSettings.tsx`). Don't add a new field to `ThemeContext`
for this — reuse the existing `accentPalette`/`setAccentPalette`/`data-palette`
wiring; it's generic, not aurora-specific, even though aurora is the only
current consumer.

---

## Structural exceptions that stay JS, not CSS

`SegmentedControl` and `ProviderPicker` (both in `src/components/molecules/`)
differ per theme in actual DOM shape, not just classes — e.g. aurora's
segmented control conditionally adds a divider border only between segments
and uses a flush layout instead of gapped pills, which a CSS class alone can't
express. These two files keep a real `if (is("lumen")) { ... }` branch via
`useColorTheme()`. A theme that wants a third distinct shape here needs its
own branch in those two files specifically - this is a deliberate, narrow
exception to the "no JS conditionals" rule above, not a precedent for adding
branches elsewhere. If you don't touch these two files, lumen just gets the
existing cozy/default shape for them, which is a fine result.

### Terminal: a theme that reshapes components, not just colors

`terminal` is the one theme that deliberately goes further than the rules
above, because its source design changes component *shape* everywhere:
square, flat, 1px outlines, inverse-video selection, `$ `/`# ` prefixed text,
lowercase `[bracketed]` buttons. It's built in three layers. Reuse them
before adding new branches:

1. **CSS in `tokens.css`** ("Terminal component look"), keyed off generic
   `data-slot` hooks the shared atoms carry: `button` (+ `data-variant`/
   `data-size`), `badge`, `card`, `avatar-fallback`, `tooltip`,
   `dialog-title`, `field-label`, `settings-row-label`,
   `settings-card-title`, `section-title`, `comment`, `kbd`. They're inert
   attributes under every other theme.
2. **`Button` labels.** Under terminal, `button.tsx` renders text buttons as
   `[label]` and drops their icons. A label that already starts with `[` is
   left alone.
3. **`is("terminal")` branches** only where the DOM really differs: `Header`
   (path title and text links, via `HeaderAction.shortLabel`), `Sidebar`,
   `ChatMessage`/`ChatWindow` (log lines instead of bubbles), `MessageInput`
   (prompt composer and ASCII context bar), `ChatPage` (docked composer),
   `SettingsPage`, `CharacterPage`, the `CharacterEditorPage` stepper,
   `EmotionSpritePanel`, `ChatSidePanelShell`, `Modal`, `InitialMessages`,
   `Logo`, and the picker molecules. Text actions use the `TermLink` atom.

**Specificity caveat (applies to every theme).** `tokens.css` is imported
*before* `@tailwind utilities`, and Tailwind v3 emits utilities as plain
unlayered CSS. So a theme rule beats a utility only when it's **more
specific**, not because it sits outside `@layer`. A tie (e.g.
`[data-theme="x"] *` vs `.rounded-lg`, both 0,1,0) goes to the utility. Scope
rules as `[data-theme="x"] .something` (0,2,0), or use `!important` for true
global resets, as terminal's square/flat reset does.

---

## Full required-token reference

Every theme's `[data-theme="name"]` + `[data-theme="name"].dark` blocks need
these (omit any that should fall back to `:root`/`.dark`'s cozy values):

**shadcn-canonical bridge vars**
```
--background --foreground --card --card-foreground --popover --popover-foreground
--primary --primary-foreground --primary-hover --secondary --secondary-foreground
--muted --muted-foreground --accent --accent-foreground --destructive
--destructive-foreground --success --success-foreground --overlay --subtle
--border --input --ring --radius
```

**Shadow scale**
```
--shadow-soft --shadow-mid --shadow-strong
```

**App brand palette** (`--color-*` — the same colors as the bridge vars above,
duplicated under app-specific names a few non-shadcn components read directly,
e.g. `Logo`'s gradient reads `--color-accent`/`--color-accent-2`):
```
--color-app-bg --color-panel-bg --color-panel2-bg --color-panel3-bg
--color-hover-bg --color-chat-bg --color-text-main --color-text-muted
--color-text-faint --color-primary --color-primary-hover --color-accent
--color-accent-2 --color-on-accent --color-secondary --color-secondary-hover
--color-on-secondary --color-border-main
```

**Theme-exclusive extra tokens** — only if your surface-role classes (§A)
need them, same pattern as neumorphic's `--elevated(-foreground)`/
`--accent-soft`/`--accent-ink` or aurora's `--blob`/`--sunken`/`--raise`/
`--color-accent-3`.

---

## Wiring checklist

- [ ] `tokens.css`: `[data-theme="name"]` + `[data-theme="name"].dark` blocks
      with all required tokens (§ above)
- [ ] `src/utils/constants.ts`: add to `COLOR_THEMES`
- [ ] `src/components/organisms/AppearanceSettings.tsx`: add to
      `THEME_SWATCHES`
- [ ] *(optional)* `tokens.css`: opt into `.surface-*`/`.cta-surface` classes
      for a non-flat look (§A)
- [ ] *(optional)* `tokens.css`: DOM-selector overrides for a non-flat app
      shell (§B) — comment pointing at the affected component(s)
- [ ] *(optional)* a second `data-palette` axis (§C), following aurora's
      pattern rather than a new context field
- [ ] Run the app in **both** light and dark mode and click through: Sidebar,
      a chat (send a message, open Scene + Participants panels), a Dialog
      (character portrait), an AlertDialog (delete chat), Settings →
      Appearance, and any settings screen using `SegmentedControl`/
      `ProviderPicker`/`NumberStepper`

A theme that only completes the first 3 boxes renders correctly everywhere —
plain and flat, not broken. There's no hard failure mode for skipping the
optional steps, only a blander look.
