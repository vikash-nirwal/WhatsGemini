import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaEye, FaHistory, FaHourglassHalf, FaMapMarkerAlt, FaPen } from "react-icons/fa";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { avatarOf } from "src/features/character/profileChanges";
import { formatStoryDate } from "src/features/world/storyTime";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { WorldEventsSection } from "./WorldEventsSection";
import { NewcomerCard } from "./NewcomerCard";
import { PlaceDialog } from "./PlaceDialog";
import { GroupPlanDialog } from "./GroupPlanDialog";
import { WorldTimeDialog } from "./WorldTimeDialog";
import { WorldArcSection } from "./WorldArcSection";
import { FactionsSection } from "./FactionsSection";
import { whereYouAre, whoIsWhere } from "src/features/world/places";
import { patchWorld } from "src/features/worldSlice";
import { Select } from "src/components/molecules/form-controls/FormSelect";
import { MapPin } from "src/types";
import { useCurrentWorld, useWorldCharacters, useWorldPrefs } from "src/hooks/useWorld";

// The world you're in (#157), on top of the Worlds page as on the canvas: a
// cover with its name and premise, then its cast, how it runs and its map.
export const CurrentWorldHero = ({ onOpenMap }: { onOpenMap?: () => void }) => {
  const navigate = useNavigate();
  const { current, currentWorldId, name } = useCurrentWorld();
  const cast = useWorldCharacters();
  const personas = useAppSelector((state) => state.settings.personas);
  const [prefs] = useWorldPrefs(currentWorldId);
  const you = personas.find((p) => p.id === current?.personaId);
  const pins = current?.map?.pins || [];
  // Who is where right now (#165); a place opens to start a scene there.
  const here = prefs.places ? whoIsWhere(cast, pins, Date.now()) : {};
  const [openPin, setOpenPin] = useState<MapPin | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const dispatch = useAppDispatch();
  const youAt = whereYouAre(current, Date.now());

  return (
    <section aria-label="Current world" className="mb-8 overflow-hidden rounded-[20px] bg-card ring-1 ring-inset ring-border">
      <div className="relative flex min-h-[200px] flex-col justify-end gap-2 p-6 text-white md:px-10 md:py-7" style={{ background: "#22324A" }}>
        {current?.coverImage && <img src={current.coverImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
        <div className="absolute right-4 top-4 flex flex-wrap justify-end gap-2">
          {current && <button type="button" onClick={() => navigate(`/worlds/${current.id}/edit`)} className="flex h-9 items-center gap-1.5 rounded-lg bg-black/35 px-3 text-[13px] font-semibold"><FaPen size={11} /> Edit world</button>}
          <button type="button" onClick={() => setTimeOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-black/35 px-3 text-[13px] font-semibold"><FaHourglassHalf size={11} /> Pass the time</button>
          <button type="button" onClick={() => navigate(`/worlds/${current?.id ?? "mine"}/timeline`)} className="flex h-9 items-center gap-1.5 rounded-lg bg-black/35 px-3 text-[13px] font-semibold"><FaHistory size={12} /> Timeline</button>
          {prefs.peek && <button type="button" onClick={() => navigate("/peek")} className="flex h-9 items-center gap-1.5 rounded-lg bg-black/35 px-3 text-[13px] font-semibold"><FaEye size={12} /> Peek at their threads</button>}
        </div>
        <span className="relative text-[12px] font-semibold uppercase tracking-[0.06em] opacity-80">Current world</span>
        <h2 className="relative font-serif text-[34px] font-medium leading-[40px] md:text-[40px] md:leading-[44px]">{name}</h2>
        <p className="relative max-w-[640px] text-[15px] leading-[22px] opacity-90">{current?.premise || "Everyone from before worlds, and anyone you haven't put in one."}</p>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-[1.3fr_1fr] md:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[17px] font-bold text-foreground">Cast · {cast.length}</h3>
            <span className="flex gap-4">
              {cast.length >= 2 && <button type="button" onClick={() => setPlanOpen(true)} className="text-[13.5px] font-bold text-primary-text hover:underline">Make a plan</button>}
              <button type="button" onClick={() => navigate("/characters")} className="text-[13.5px] font-bold text-primary-text hover:underline">All characters</button>
            </span>
          </div>
          {cast.length === 0 ? (
            <p className="text-[13.5px] text-muted-foreground">Nobody lives here yet. Add someone from Characters.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {cast.slice(0, 9).map((c) => (
                <li key={c.id} className="flex min-w-0 items-center gap-2.5">
                  <CharacterAvatar name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={40} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13.5px] font-bold text-foreground">{c.name}</span>
                    <span className="truncate text-[12px] text-subtle">{[c.relationship, ...(current?.factions || []).filter((f) => f.memberIds.includes(c.id)).map((f) => f.name)].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 rounded-card bg-sunken p-4 text-[13.5px] sm:grid-cols-2">
            <div><dt className="text-[12px] text-subtle">Story time</dt><dd className="font-semibold text-foreground">{current?.storyTime ? formatStoryDate(current.storyTime, Date.now()) : "Real time"}</dd></div>
            <div><dt className="text-[12px] text-subtle">When you're elsewhere</dt><dd className="font-semibold text-foreground">{prefs.keepLiving === false ? "Paused" : "Keeps running"}</dd></div>
            <div><dt className="text-[12px] text-subtle">Their own texts</dt><dd className="font-semibold text-foreground">{prefs.peek ? "Visible with Peek" : "Hidden"}</dd></div>
            <div><dt className="text-[12px] text-subtle">You here</dt><dd className="font-semibold text-foreground">{you?.name || "Your active persona"}</dd></div>
          </dl>
        </div>
        <div className="flex flex-col gap-3">
          {current && prefs.arrivals && <NewcomerCard world={current} />}
          {current && prefs.events && <WorldEventsSection world={current} />}
          {current && <WorldArcSection world={current} />}
          {current && cast.length >= 2 && <FactionsSection world={current} />}
          {current && prefs.reputation && (
            <section aria-label="Your reputation" className="flex flex-col gap-1.5">
              <h3 className="text-[17px] font-bold text-foreground">What people say about you</h3>
              <p className="text-[13.5px] leading-[19px] text-muted-foreground">{current.reputation?.text || "Nothing yet. Word gets around in a few days."}</p>
            </section>
          )}
          <h3 className="text-[17px] font-bold text-foreground">Places</h3>
          {current?.map?.image ? (
            <button type="button" onClick={onOpenMap || (() => navigate(`/worlds/${current.id}/edit`))} aria-label="Open the map" className="h-[150px] overflow-hidden rounded-xl bg-sunken">
              <img src={current.map.image} alt="" className="h-full w-full object-cover" />
            </button>
          ) : null}
          {current && prefs.places && pins.length > 0 && (
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span className="flex-1">You're at</span>
              <Select aria-label="Where you are" value={youAt?.id || "none"} onChange={(e) => void dispatch(patchWorld(current.id, { youAt: e.target.value === "none" ? undefined : { pinId: e.target.value, at: Date.now() } }))} className="h-8 w-[170px]">
                <option value="none">Nowhere in particular</option>
                {pins.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </label>
          )}
          {pins.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {pins.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <button type="button" disabled={!prefs.places} onClick={() => setOpenPin(p)} aria-label={`${p.name}${here[p.id]?.length ? `, ${here[p.id].map((c) => c.name).join(", ")} here` : ""}`} className="flex w-full items-center gap-2.5 rounded-lg py-1 text-left text-[13.5px] font-semibold text-foreground enabled:hover:bg-raised">
                    <FaMapMarkerAlt size={12} className="flex-none text-primary-text" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="flex -space-x-1.5">
                      {(here[p.id] || []).slice(0, 4).map((c) => <CharacterAvatar key={c.id} name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={22} />)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">{current ? "No places pinned yet. Add a map in Edit world." : "My world has no map; make a world for one."}</p>
          )}
        </div>
      </div>
      <WorldTimeDialog open={timeOpen} onOpenChange={setTimeOpen} />
      <GroupPlanDialog open={planOpen} onOpenChange={setPlanOpen} cast={cast} world={current} />
      <PlaceDialog worldId={current?.id} pin={openPin} cast={cast} present={openPin ? here[openPin.id] || [] : []} onOpenChange={(o) => !o && setOpenPin(null)} />
    </section>
  );
};

export default CurrentWorldHero;
