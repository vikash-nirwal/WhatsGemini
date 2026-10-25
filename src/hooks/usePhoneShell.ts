import { useEffect, useState } from "react";
import { useColorTheme } from "./useColorTheme";

// Below the width where the sidebar docks (Tailwind's lg).
const PHONE_QUERY = "(max-width: 1023.98px)";

const matches = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;

// The phone-style shell (#114, #150): on a phone or tablet the chat list is
// the home screen with a tab bar under it, and a chat's header goes back to
// it instead of opening the drawer. Every theme but terminal, whose shell
// look keeps its own drawer.
export const usePhoneShell = (): boolean => {
  const { is } = useColorTheme();
  const [narrow, setNarrow] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return !is("terminal") && narrow;
};

// Pages that show the tab bar: the shell's top-level screens, one per
// section (#150).
export const TAB_BAR_PATHS = ["/", "/updates", "/characters", "/adventures"];
export const TAB_BAR_HEIGHT = 64;
