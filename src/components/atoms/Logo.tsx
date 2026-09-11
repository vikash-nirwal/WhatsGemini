import React from "react";

interface LogoProps {
  size?: number;
  className?: string;
}

// A four-point "sparkle" mark on the app's accent gradient - same visual
// language as Gemini's own icon, standing in for the previous placeholder
// "G" letter tile. Colors are CSS custom properties so it stays correct
// across the light/dark themes without a separate dark-mode variant.
const Logo: React.FC<LogoProps> = ({ size = 36, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 36 36"
    className={className}
    role="img"
    aria-label="WhatsGemini logo"
  >
    <defs>
      <linearGradient id="wg-logo-gradient" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
        <stop offset="0%" style={{ stopColor: "rgb(var(--color-accent))" }} />
        <stop offset="100%" style={{ stopColor: "rgb(var(--color-accent-2))" }} />
      </linearGradient>
    </defs>
    <rect width="36" height="36" rx="11" fill="url(#wg-logo-gradient)" />
    <path
      d="M18 6C18 12.6 12.6 18 6 18C12.6 18 18 23.4 18 30C18 23.4 23.4 18 30 18C23.4 18 18 12.6 18 6Z"
      style={{ fill: "rgb(var(--color-on-accent))" }}
    />
  </svg>
);

export default Logo;
