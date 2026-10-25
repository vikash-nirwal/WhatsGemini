import React from "react";
import { FaCheck } from "react-icons/fa";
import { Switch } from "src/components/atoms/switch";
import { SettingGroup, SettingRow } from "src/components/molecules/SettingRow";
import { BETWEEN_MESSAGES, INNER_LIFE, isOn, LIFE_PRESETS, LifeSwitch, LifeValues, presetOf } from "src/features/character/lifePresets";
import { cn } from "src/utils/cn";

// Their life (#154): start from a preset, then switch things on and off.
// Each switch is also in Contact info, per character.
const LifeStep: React.FC<{ name: string; values: LifeValues; onChange: (next: LifeValues) => void }> = ({ name, values, onChange }) => {
  const preset = presetOf(values);
  const toggle = (s: LifeSwitch, on: boolean) => onChange({ ...values, ...(on ? s.on : { [s.key]: undefined }) });
  const group = (title: string, list: LifeSwitch[]) => (
    <SettingGroup title={`${title} · ${list.filter((s) => isOn(values, s.key)).length} on`}>
      {list.map((s) => (
        <SettingRow key={s.key} title={s.title} hint={s.hint} cost={s.cost} htmlFor={`life-${s.key}`}>
          <Switch id={`life-${s.key}`} checked={isOn(values, s.key)} onCheckedChange={(on) => toggle(s, on)} />
        </SettingRow>
      ))}
    </SettingGroup>
  );
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13.5px] text-muted-foreground">{name ? `What ${name} does` : "What they do"} when you're not talking. Applies in every chat; change any of it later in their Contact info.</p>
      <div className="flex flex-col gap-2.5">
        <span className="text-[14px] font-semibold text-foreground">Start from a preset</span>
        <div role="radiogroup" aria-label="Life presets" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {LIFE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={preset === p.id}
              onClick={() => onChange({ ...p.values })}
              className={cn("flex min-h-[92px] flex-col gap-1 rounded-card bg-raised px-3.5 py-3 text-left", preset === p.id ? "ring-2 ring-inset ring-primary" : "ring-1 ring-inset ring-border")}
            >
              <span className="flex items-center justify-between text-[14px] font-bold text-foreground">{p.name}{preset === p.id && <FaCheck size={12} className="text-primary-text" />}</span>
              <span className="text-[12px] leading-4 text-subtle">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {group("Between messages", BETWEEN_MESSAGES)}
        {group("Inner life", INNER_LIFE)}
      </div>
    </div>
  );
};

export default LifeStep;
