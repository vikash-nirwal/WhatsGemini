import React, { useState } from "react";
import { SettingsCard, SettingsCardHeader, SettingsRow } from "src/components/molecules/settings-card";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { loadToolSettings, saveToolSettings, TOOL_GROUPS, ToolSettings as ToolSettingsType } from "src/features/tools/toolSettings";

interface ToolSettingsProps {
  // Told of every change, so the Settings list can show how many are on.
  onChange?: (settings: ToolSettingsType) => void;
}

// Tools for characters (#266): one switch for the lot and one per kind of
// tool. Everything starts off. The settings live in toolSettings.ts and are
// read when a reply is made, so a switch takes effect on the next message.
const ToolSettings: React.FC<ToolSettingsProps> = ({ onChange }) => {
  const [settings, setSettings] = useState<ToolSettingsType>(() => loadToolSettings());
  const update = (next: ToolSettingsType) => {
    saveToolSettings(next);
    setSettings(next);
    onChange?.(next);
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader title="Tools for characters" hint="Lets a character do a few things for real in a chat instead of making them up. When a tool is used the reply takes a second model call. Adventures keep their own dice and aren't affected." />
        </div>
        <SettingsRow label="Let characters use tools" hint="The switch for all of them. Off: no tool is offered, whatever is set below." align="start">
          <ToggleSwitch checked={settings.on} onChange={(on) => update({ ...settings, on })} title="Let characters use tools" />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader title="Which tools" hint={settings.on ? "Switch on the ones you want." : "Switch tools on above to choose."} />
        </div>
        {TOOL_GROUPS.map((group) => (
          <SettingsRow key={group.id} label={group.title} hint={group.hint} align="start">
            <ToggleSwitch checked={settings.groups[group.id]} disabled={!settings.on} onChange={(on) => update({ ...settings, groups: { ...settings.groups, [group.id]: on } })} title={group.title} />
          </SettingsRow>
        ))}
        <SettingsRow label="Read links through a reader service" hint="For providers that can't open pages themselves: the link you sent goes to r.jina.ai, which returns the page as text. Only used when Reading a link is on." align="start">
          <ToggleSwitch checked={settings.reader} disabled={!settings.on || !settings.groups.links} onChange={(reader) => update({ ...settings, reader })} title="Read links through a reader service" />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
};

export default ToolSettings;
