import { useEffect, useState } from "react";

// Whether a CSS media query matches, kept up to date as the window changes.
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener?.("change", update);
    return () => list.removeEventListener?.("change", update);
  }, [query]);
  return matches;
};

// Where the sidebar docks beside the page (Tailwind's lg).
export const DESKTOP_QUERY = "(min-width: 1024px)";
