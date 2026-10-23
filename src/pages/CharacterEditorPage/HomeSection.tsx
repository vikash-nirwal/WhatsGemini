import React, { useState } from "react";
import { FaChevronRight } from "react-icons/fa";
import { TextInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { CharacterHome } from "src/types";
import { describePlace, geocodeCity, PlaceCandidate } from "src/features/character/realWorld";

interface HomeSectionProps {
  value: CharacterHome | undefined;
  onChange: (value: CharacterHome | undefined) => void;
}

// "Where they live" (#112): a city looked up once (Open-Meteo's geocoder),
// kept with its coordinates and time zone. The chat then knows the local
// time, the weather and the public holidays there.
const HomeSection: React.FC<HomeSectionProps> = ({ value, onChange }) => {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PlaceCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async () => {
    setSearching(true);
    setError(null);
    try {
      const found = await geocodeCity(query);
      setCandidates(found);
      if (found.length === 0) setError("No place by that name.");
    } catch (err) {
      setError((err as Error).message || "Place lookup failed.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        Where they live
        <span className="text-xs font-normal text-muted-foreground">{value ? describePlace(value) : "not set"}</span>
      </summary>
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          With a home city the character knows the local time, today's weather and the public holidays there, and mentions them when they fit. The city name is sent to Open-Meteo once to find it; after that only its coordinates and country leave the browser.
        </p>
        {value ? (
          <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Home">
            <span>{describePlace(value)} · {value.timeZone}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => { onChange(undefined); setCandidates(null); }}>Remove</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              aria-label="City"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void find(); } }}
              placeholder="e.g. Lisbon"
              className="min-w-[10rem] flex-1"
            />
            <Button type="button" variant="outline" size="sm" disabled={searching || !query.trim()} onClick={() => void find()}>
              {searching ? "Finding..." : "Find"}
            </Button>
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!value && candidates && candidates.length > 0 && (
          <ul className="flex flex-col gap-1" aria-label="Places found">
            {candidates.map((c) => (
              <li key={`${c.lat},${c.lon}`}>
                <button type="button" className="text-sm text-primary hover:underline" onClick={() => { onChange({ city: c.city, country: c.country, countryCode: c.countryCode, lat: c.lat, lon: c.lon, timeZone: c.timeZone }); setCandidates(null); }}>
                  {c.city}{c.region ? `, ${c.region}` : ""}{c.country ? `, ${c.country}` : ""}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
};

export default HomeSection;
