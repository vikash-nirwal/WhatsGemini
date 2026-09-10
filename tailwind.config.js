/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', '-apple-system', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Now using CSS variables from src/styles/tokens.css for easy extraction/tweaking.
        // primary/secondary/accent resolve through the shadcn-canonical bridge variables
        // (--primary etc., see tokens.css) rather than --color-* directly, so they stay
        // theme-reactive if/when a [data-theme="x"] switcher is added later - today they
        // resolve to the exact same values as before, zero visual change.
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
          hover: 'rgb(var(--color-secondary-hover) / <alpha-value>)',
        },
        // Note: this app's own --color-accent has historically meant "same brand
        // color as primary" (see tokens.css), which collides with shadcn/ui's meaning
        // of "accent" (a neutral hover/highlight surface, bridged from --color-panel3-bg).
        // bg-accent below is that shadcn meaning (former bg-panel3 usages, renamed in the
        // Phase 7 token rename); the raw brand color is still available via --color-accent
        // directly (see gemini-gradient in backgroundImage below) for anything that wants it.
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
          2: 'rgb(var(--color-accent-2) / <alpha-value>)',
        },
        onAccent: 'rgb(var(--color-on-accent) / <alpha-value>)',
        onSecondary: 'rgb(var(--color-on-secondary) / <alpha-value>)',

        // shadcn/ui canonical keys with no pre-existing app equivalent
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        // Additions beyond shadcn's canonical set, from the neumorphic canvas's
        // own token block - only defined under [data-theme="neumorphic"] in
        // tokens.css (see there), so these classes are a no-op elsewhere.
        elevated: {
          DEFAULT: 'rgb(var(--elevated) / <alpha-value>)',
          foreground: 'rgb(var(--elevated-foreground) / <alpha-value>)',
        },
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
        'accent-ink': 'rgb(var(--accent-ink) / <alpha-value>)',
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          foreground: 'rgb(var(--success-foreground) / <alpha-value>)',
        },
        overlay: 'rgb(var(--overlay) / <alpha-value>)',
        subtle: 'rgb(var(--subtle) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',

        // Text tier with no shadcn-canonical equivalent (shadcn only has
        // foreground/muted-foreground - this app has a third, fainter tier).
        // text-ink/text-ink-muted were renamed to text-foreground/
        // text-muted-foreground; text-ink-faint has no bridge counterpart.
        ink: {
          faint: 'rgb(var(--color-text-faint) / <alpha-value>)',
        },
        // Hover surface distinct from --accent (shadcn's hover/highlight
        // meaning) - no bridge counterpart, kept as its own token.
        hover: 'rgb(var(--color-hover-bg) / <alpha-value>)',

        // Chat area background, distinct from --background - no bridge
        // counterpart, kept as its own token.
        chat: 'rgb(var(--color-chat-bg) / <alpha-value>)',
      },
      borderRadius: {
        'bubble': '1.5rem',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        soft: '0 14px 34px var(--shadow-soft)',
        mid: '0 20px 50px var(--shadow-mid)',
        strong: '0 30px 80px var(--shadow-strong)',
      },
      backgroundImage: {
        'gemini-gradient': 'linear-gradient(135deg, #10b981 0%, #3b82f6 50%, #8b5cf6 100%)',
        'gemini-logo': 'linear-gradient(135deg, rgb(var(--color-accent)), rgb(var(--color-accent-2)))',
        'sparkle-gradient': 'linear-gradient(135deg, #e2e8f0 0%, #ffffff 100%)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
