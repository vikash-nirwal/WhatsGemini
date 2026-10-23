import { useEffect } from "react";
import { useAppSelector } from "src/store/hooks";
import { ensureHolidays, ensureWeather } from "src/features/character/realWorld";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 5 * 1000;

// Real-world grounding (#112): keeps the weather and holidays cached for
// every character with a home, so prompts, statuses and first texts can
// read them without waiting on the network.
const WeatherRefresher = () => {
  const characters = useAppSelector((state) => state.character.characters);
  const homes = characters.filter((c) => c.home).map((c) => c.home!);
  const key = homes.map((h) => `${h.lat},${h.lon},${h.countryCode || ""}`).join("|");

  useEffect(() => {
    if (!key) return;
    const refresh = () => {
      const now = Date.now();
      for (const home of homes) {
        void ensureWeather(home, now);
        void ensureHolidays(home.countryCode, new Date(now).getFullYear());
      }
    };
    const first = window.setTimeout(refresh, FIRST_CHECK_MS);
    const timer = window.setInterval(refresh, CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
};

export default WeatherRefresher;
