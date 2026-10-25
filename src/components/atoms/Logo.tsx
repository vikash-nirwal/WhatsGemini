import React from "react";
import { useColorTheme } from "src/hooks/useColorTheme";

interface LogoProps {
  size?: number;
  className?: string;
}

// Kindred's mark: two speech bubbles, one typing, on the app's accent
// gradient. Colors are CSS custom properties so it stays correct across the
// themes without a separate dark-mode variant. The PNG icons in public/ are
// the same drawing in the cozy theme's colours (scripts/make-icons.js).
// The bubbles stay cream in every theme, as on the app icon: some themes'
// "on accent" colour is dark, which turned them black.
const BUBBLE = "#FFF4EC";

const Logo: React.FC<LogoProps> = ({ size = 36, className }) => {
  const { is } = useColorTheme();
  if (is("terminal")) {
    return (
      <div
        role="img"
        aria-label="Kindred logo"
        className="flex-none flex items-center justify-center border border-border-bright text-foreground font-extrabold"
        style={{ width: size * 0.76, height: size * 0.76, fontSize: size * 0.38 }}
      >
        K
      </div>
    );
  }
  return (
  <svg
    width={size}
    height={size}
    viewBox="0 0 36 36"
    className={className}
    role="img"
    aria-label="Kindred logo"
  >
    <defs>
      <linearGradient id="wg-logo-gradient" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
        <stop offset="0%" style={{ stopColor: "rgb(var(--color-accent))" }} />
        <stop offset="100%" style={{ stopColor: "rgb(var(--color-accent-2))" }} />
      </linearGradient>
    </defs>
    <rect width="36" height="36" rx="11" fill="url(#wg-logo-gradient)" />
    <path
      d="M10.5 10h11a4.5 4.5 0 0 1 4.5 4.5v4a4.5 4.5 0 0 1-4.5 4.5h-6.2l-3.8 3v-3.1A4.5 4.5 0 0 1 6 18.5v-4A4.5 4.5 0 0 1 10.5 10z"
      style={{ fill: BUBBLE, opacity: 0.55 }}
    />
    <path
      d="M14.5 15h11a4.5 4.5 0 0 1 4.5 4.5v3a4.5 4.5 0 0 1-4.5 4.5H25v3.2l-4-3.2h-6.5a4.5 4.5 0 0 1-4.5-4.5v-3a4.5 4.5 0 0 1 4.5-4.5z"
      style={{ fill: BUBBLE }}
    />
    {[16.5, 20.5, 24.5].map((cx) => (
      <circle key={cx} cx={cx} cy={21} r={1.3} style={{ fill: "rgb(var(--color-accent))" }} />
    ))}
  </svg>
  );
};

export default Logo;
