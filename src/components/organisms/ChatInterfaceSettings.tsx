import React from 'react';
import { cn } from '../../utils/cn';
import { useColorTheme } from '../../hooks/useColorTheme';
import { TextInput } from "src/components/molecules/form-controls";
import InitialMessages from 'src/components/molecules/InitialMessages';
import { SettingsCard, SettingsCardHeader, SettingsRow } from 'src/components/molecules/settings-card';
import { SegmentedControl } from 'src/components/molecules/SegmentedControl';
import ToggleSwitch from 'src/components/atoms/ToggleSwitch';
import NotificationSettings from 'src/components/organisms/NotificationSettings';

interface ChatInterfaceSettingsProps {
  maxChatLength: number;
  setMaxChatLength: (val: number) => void;
  fontSize: string;
  setFontSize: (val: string) => void;
  initialMessagesKey: number;
  onInitialMessagesSave: () => void;
  textingMode: boolean;
  setTextingMode: (val: boolean) => void;
  recapAfterDays: number;
  setRecapAfterDays: (val: number) => void;
}

const RECAP_OPTIONS = [
  { value: "0", label: "Off" },
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "7", label: "A week" },
];

const FONT_SIZE_OPTIONS = [
  { value: "14px", label: "Small" },
  { value: "16px", label: "Medium" },
  { value: "18px", label: "Large" },
  { value: "20px", label: "Extra large" },
];

const ChatInterfaceSettings: React.FC<ChatInterfaceSettingsProps> = ({
  maxChatLength, setMaxChatLength, fontSize, setFontSize, initialMessagesKey, onInitialMessagesSave, textingMode, setTextingMode, recapAfterDays, setRecapAfterDays,
}) => {
  const { is } = useColorTheme();
  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader title="Reading" />
        </div>

        <SettingsRow label="Chat font size" align="start">
          <div className="flex flex-col gap-3">
            <SegmentedControl value={fontSize} onChange={setFontSize} options={FONT_SIZE_OPTIONS} />
            <div
              className={cn(
                "rounded-lg bg-background border border-input px-3.5 py-3 font-serif leading-relaxed",
                is("aurora") && "surface-sunken border-none"
              )}
              style={{ fontSize }}
            >
              <span className="italic text-muted-foreground">He checks the time again.</span> "Short messages,
              remember? You're shipping code, not novels."
            </div>
          </div>
        </SettingsRow>

        <SettingsRow label="Texting mode" hint="Replies arrive as separate texts, one at a time with typing pauses, and your messages show read ticks. Only the display changes." align="start">
          <ToggleSwitch checked={textingMode} onChange={setTextingMode} label={<span className="sr-only">Texting mode</span>} />
        </SettingsRow>

        <SettingsRow label={'"Previously on…" recap'} hint="Coming back to a chat after this long shows a short recap of where the story stands. Written once and kept; never sent to the AI." align="start">
          <SegmentedControl value={String(recapAfterDays)} onChange={(v) => setRecapAfterDays(Number(v))} options={RECAP_OPTIONS} />
        </SettingsRow>

        <SettingsRow label="Max chat length" hint="Tokens (est.) of history kept in a conversation. 0 = unlimited.">
          <TextInput
            type="number"
            value={maxChatLength}
            onChange={(e) => setMaxChatLength(Number(e.target.value))}
            min="0"
            step="500"
            className="w-40"
          />
        </SettingsRow>
      </SettingsCard>

      <NotificationSettings />

      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader title="Initial messages" hint="Sent as your opening line when a chat starts" />
        </div>
        <div className="p-4">
          <InitialMessages
            key={initialMessagesKey}
            onSave={onInitialMessagesSave}
          />
        </div>
      </SettingsCard>
    </div>
  );
};

export default ChatInterfaceSettings;
