import React from "react";
import { cn } from "../../utils/cn";
import { Avatar, AvatarFallback } from "src/components/atoms/avatar";
import { DisplayImage } from "./DisplayImage";
import { useAppSelector } from "../../store/hooks";

// The global "always show initials" toggle (Settings > Appearance) lives
// here rather than at each call site - it's read once, centrally, so every
// avatar in the app (character or persona) honors it automatically as long
// as the call site passes its real imageSrc through as usual. A handful of
// call sites that render their own image/initials branching instead of
// going through CharacterAvatar (e.g. CharacterPage's grid cards) import
// this hook directly to stay consistent.
export const useAvatarImageSrc = (imageSrc?: string): string | undefined => {
  const alwaysShowInitials = useAppSelector((state) => state.settings.alwaysShowInitials);
  return alwaysShowInitials ? undefined : imageSrc;
};

export const getInitials = (name?: string) => {
  if (!name || !name.trim()) return "?";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
};

interface CharacterAvatarProps {
  name?: string;
  accent?: [string, string];
  size?: number;
  className?: string;
  // Optional real image (e.g. an emotion portrait) - a `local:`/`data:` ref,
  // same shape everywhere else in the app. Falls back to the usual
  // initials-over-gradient circle when absent or if it fails to load.
  imageSrc?: string;
}

const InitialsFallback = ({ name, accent, size }: { name?: string; accent?: [string, string]; size: number }) => (
  <AvatarFallback
    className={cn("text-white font-semibold", !accent && "bg-gemini-logo")}
    style={{
      fontSize: size * 0.4,
      ...(accent ? { background: `linear-gradient(135deg, ${accent[0]}, ${accent[1]})` } : {}),
    }}
  >
    {getInitials(name)}
  </AvatarFallback>
);

export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({ name, accent, size = 32, className, imageSrc }) => {
  const effectiveImageSrc = useAvatarImageSrc(imageSrc);
  return (
    <Avatar
      className={cn("flex-shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {effectiveImageSrc ? (
        <DisplayImage
          srcContext={effectiveImageSrc}
          alt={name || "Character"}
          className="h-full w-full object-cover"
          renderError={<InitialsFallback name={name} accent={accent} size={size} />}
        />
      ) : (
        <InitialsFallback name={name} accent={accent} size={size} />
      )}
    </Avatar>
  );
};
