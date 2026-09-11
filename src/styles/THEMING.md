# Adding a new color theme

WhatsGemini's color theme (cozy/neumorphic/aurora) is a separate axis from
light/dark mode - see `src/contexts/ThemeContext.tsx`. A theme is selected by
setting `data-theme="name"` (and, in dark mode, also the `.dark` class) on
`<html>`; `tokens.css` supplies the actual values for each combination.

## Required - shadcn-canonical bridge vars

Define these under both `[data-theme="name"]` and `[data-theme="name"].dark`
(or omit ones that should just fall back to `:root`/`.dark`'s cozy values):

```
--background --foreground --card --card-foreground --popover --popover-foreground
--primary --primary-foreground --primary-hover --secondary --secondary-foreground
--muted --muted-foreground --accent --accent-foreground --destructive
--destructive-foreground --success --success-foreground --overlay --subtle
--border --input --ring --radius
```

## Required - shadow scale

```
--shadow-soft --shadow-mid --shadow-strong
```

## Required - app brand palette (`--color-*`)

```
--color-app-bg --color-panel-bg --color-panel2-bg --color-panel3-bg
--color-hover-bg --color-chat-bg --color-text-main --color-text-muted
--color-text-faint --color-primary --color-primary-hover --color-accent
--color-accent-2 --color-on-accent --color-secondary --color-secondary-hover
--color-on-secondary --color-border-main
```

## Optional - surface-role utility classes

Define only the ones this theme needs a *non-default* treatment for -
anything left undefined resolves to each consuming component's plain
flat/bordered base classes (i.e. "looks like cozy"). Every one of these is
applied as a **static class at the call site, with no `colorTheme === "x"`
JS check** - see `src/hooks/useColorTheme.ts`'s doc comment and the
"Themed surface utilities" / "Aurora structural look" blocks in this file
for worked examples.

```
.surface-sunken      recessed fill (inputs, the active row in a picker)
.surface-raised       lightly raised (cards, secondary/panel buttons)
.surface-raised-sm    same, smaller (switch thumb)
.cta-surface           primary call-to-action treatment (Button's `default` variant)
.surface-elevated      a lighter chip than the page behind it (`outline` variant)
.surface-panel          a Dialog/AlertDialog's own surface
```

Keep these **outside any `@layer`** - per CSS cascade-layer rules that lets
them win over Tailwind's own layered utilities without `!important`,
regardless of what other classes the component also carries.

## Optional - theme-exclusive extra tokens

Only if the surface-role classes above need them - same pattern as
neumorphic's `--elevated(-foreground)`/`--accent-soft`/`--accent-ink` or
aurora's `--blob`/`--sunken`/`--raise`/`--color-accent-3`.

## Optional - structural DOM-selector overrides

Only if this theme wants a non-flat app shell (glass/blur sidebar, a
gradient page background, etc.) - same pattern as aurora's `.app-main`,
`aside[aria-label="Sidebar"]`, and `header` blocks. These target elements by
DOM structure rather than a class the component itself opts into, so leave a
comment pointing back to this file from wherever the targeted component
lives, since otherwise there's nothing in that component's own source
hinting that the theme touches it.

## Structural exceptions that stay JS, not CSS

`SegmentedControl` and `ProviderPicker` differ per theme in actual DOM shape
(not just classes - e.g. aurora's segmented control conditionally adds a
divider border only between segments, uses a flush layout instead of gapped
pills). A theme that wants a third distinct shape for these needs its own
branch in those two files via `useColorTheme()`'s `is()` helper - this is a
deliberate, narrow exception to the "no JS conditionals" rule above, not a
precedent for adding more.

## Wiring checklist

- [ ] Add an entry to `COLOR_THEMES` in `src/utils/constants.ts`
      (`value`/`label`/`description`)
- [ ] Add a swatch triple to `THEME_SWATCHES` in
      `src/components/organisms/AppearanceSettings.tsx`
- [ ] If this theme needs a second "accent palette" axis like aurora's 4
      palettes, follow the `[data-theme="name"][data-palette="y"]` pattern
      (see aurora's ocean/forest/sunset override blocks below) rather than
      adding a new context field
- [ ] Run the app across light **and** dark mode and sanity-check every
      screen listed in the plan's verification section - a theme that only
      defines the required vars above will render correctly by falling back
      to plain/flat treatments everywhere, so there's no hard failure mode,
      just a bland one, if an optional class is skipped
