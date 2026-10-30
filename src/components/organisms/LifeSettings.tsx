import React, { useEffect, useState } from "react";
import { SettingsCard, SettingsCardHeader, SettingsRow } from "src/components/molecules/settings-card";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { CostMarker } from "src/components/molecules/SettingRow";
import { LIFE_HINT, LifeLevel, loadLifeDial, saveLifeDial } from "src/features/life/lifeDial";
import { groupActivity, loadActivity, onActivity, todaysActivity } from "src/features/life/activityLog";
import { formatUSD } from "src/features/spending/spending";
import { ON_DEVICE_MODELS, onDeviceModel, setOnDeviceModel } from "src/features/life/onDevice";
import { checkWebGPU } from "src/features/ai/providers/webllmAdapter";
import { Select } from "src/components/molecules/form-controls/FormSelect";
import HelperRepliesCard from "src/components/organisms/HelperRepliesCard";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { setStatusesOn, statusesOn } from "src/features/status/statusSwitch";

// Life in the background (#131): the life dial and the activity log, in
// Settings > Spending, since every entry is a call on your key.
const LifeSettings = () => {
  const [level, setLevel] = useState<LifeLevel>(loadLifeDial);
  const [onDevice, setOnDevice] = useState(onDeviceModel);
  const [statuses, setStatuses] = useState(statusesOn);
  const [gpuNote, setGpuNote] = useState<string | undefined>();
  // Only with a usable GPU: without one nothing would download or run.
  const pickOnDevice = async (value: string) => {
    if (value === "off") {
      setOnDeviceModel(undefined);
      setOnDevice(undefined);
      return;
    }
    if (!(await checkWebGPU())) {
      setGpuNote("This browser can't use the GPU for a model (no WebGPU), so background life stays on your model.");
      return;
    }
    setOnDeviceModel(value);
    setOnDevice(value);
  };
  const [entries, setEntries] = useState(loadActivity);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const refresh = () => {
      setEntries(loadActivity());
      setNow(Date.now());
    };
    const stop = onActivity(refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, []);
  const today = todaysActivity(entries, now);
  const groups = groupActivity(entries, now);

  return (
    <>
      <SettingsCard>
        <div className="px-5 pt-5">
          <SettingsCardHeader title="Life in the background" hint="How much your characters do while you're away" />
        </div>
        <SettingsRow label={<span className="inline-flex items-center gap-1.5">Life dial <CostMarker /></span>} hint={LIFE_HINT[level]} align="start">
          <SegmentedControl
            aria-label="Life dial"
            value={level}
            onChange={(v) => {
              setLevel(v as LifeLevel);
              saveLifeDial(v as LifeLevel);
            }}
            options={[
              { value: "quiet", label: "Quiet" },
              { value: "normal", label: "Normal" },
              { value: "lively", label: "Lively" },
            ]}
          />
        </SettingsRow>
        {/* Statuses off (2026-10-30): no posting or reacting, and none in prompts. */}
        <SettingsRow label={<span className="inline-flex items-center gap-1.5">Statuses <CostMarker /></span>} hint={statuses ? "Characters post statuses and react to yours." : "Off: nobody posts statuses or reacts to yours, and chats don't mention them. Statuses already posted can still be read."} align="start">
          <ToggleSwitch checked={statuses} onChange={(on) => { setStatuses(on); setStatusesOn(on); }} label={<span className="sr-only">Statuses</span>} />
        </SettingsRow>
        {/* Background life on this device (#199), free. */}
        <SettingsRow label="Run it on this device (free)" hint={onDevice ? `Background life uses ${onDevice.split("-q4")[0]} in this browser; the first time downloads it (about 1 GB). Chats still use your model.` : gpuNote || "Statuses, their own talk, life events and rumors on a small model in your browser instead of your key. Needs a recent browser with WebGPU."} align="start">
          <Select aria-label="Background life on this device" value={onDevice || "off"} onChange={(e) => void pickOnDevice(e.target.value)} className="w-[200px]">
            <option value="off">Off (use my model)</option>
            {ON_DEVICE_MODELS.map((m) => <option key={m} value={m}>{m.split("-q4")[0]}</option>)}
          </Select>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <div className="px-5 pt-5">
          <SettingsCardHeader title="Activity log" hint="What ran in the background, on this device" />
          <p className="mt-2 text-[13.5px] text-muted-foreground" data-testid="activity-today">
            <span className="text-[22px] font-bold tabular-nums text-foreground">{today.count}</span> background {today.count === 1 ? "call" : "calls"} today
            {today.cost > 0 && <> · about {formatUSD(today.cost)}</>}
          </p>
        </div>
        {groups.length === 0 ? (
          <p className="px-5 pb-5 pt-3 text-[13px] text-subtle">Nothing yet. Texts first, statuses, letters and the rest show up here as they happen.</p>
        ) : (
          <div className="px-3 pb-3 pt-2" role="list" aria-label="Activity log">
            {groups.map((g) => (
              <div key={g.label} role="presentation">
                <div className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle" role="presentation">{g.label}</div>
                {g.entries.slice(0, 60).map((e) => (
                  <div key={e.id} role="listitem" className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5">
                    <CharacterAvatar name={e.name || "?"} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-foreground">{e.text}</div>
                      <div className="text-[12px] text-subtle">{new Date(e.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}{e.world ? ` · ${e.world}` : ""}</div>
                    </div>
                    <span className="text-[12px] tabular-nums text-muted-foreground">{e.cost ? formatUSD(e.cost) : "1 call"}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      <HelperRepliesCard />
    </>
  );
};

export default LifeSettings;
