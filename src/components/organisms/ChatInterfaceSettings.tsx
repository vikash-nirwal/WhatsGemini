import React from 'react';
import { cn } from '../../utils/cn';
import { useColorTheme } from '../../hooks/useColorTheme';
import { TextInput } from "src/components/molecules/form-controls";
import InitialMessages from 'src/components/molecules/InitialMessages';
import { SettingsCard, SettingsCardHeader, SettingsRow } from 'src/components/molecules/settings-card';
import { SegmentedControl } from 'src/components/molecules/SegmentedControl';
import ToggleSwitch from 'src/components/atoms/ToggleSwitch';

interface ChatInterfaceSettingsProps {
  maxChatLength: number;
  setMaxChatLength: (val: number) => void;
  fontSize: string;
  setFontSize: (val: string) => void;
  initialMessagesKey: number;
  onInitialMessagesSave: () => void;
  emotionPanelEnabled: boolean;
  setEmotionPanelEnabled: (val: boolean) => void;
  emotionPopupEnabled: boolean;
  setEmotionPopupEnabled: (val: boolean) => void;
  emotionPopupDuration: number;
  setEmotionPopupDuration: (val: number) => void;
}

const FONT_SIZE_OPTIONS = [
  { value: "14px", label: "Small" },
  { value: "16px", label: "Medium" },
  { value: "18px", label: "Large" },
  { value: "20px", label: "Extra large" },
];

const ChatInterfaceSettings: React.FC<ChatInterfaceSettingsProps> = ({
  maxChatLength, setMaxChatLength, fontSize, setFontSize, initialMessagesKey, onInitialMessagesSave,
  emotionPanelEnabled, setEmotionPanelEnabled, emotionPopupEnabled, setEmotionPopupEnabled,
  emotionPopupDuration, setEmotionPopupDuration,
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

      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader title="Mood portraits" hint="The docked emotion sprite panel beside the chat, and the change callout" />
        </div>

        <SettingsRow label="Show mood panel" hint="Docks each character's current mood portrait beside the chat. Can also be closed from inside the panel itself.">
          <ToggleSwitch checked={emotionPanelEnabled} onChange={setEmotionPanelEnabled} />
        </SettingsRow>

        <SettingsRow label="Pop up on mood change" hint="Briefly shows a character's portrait centered on screen when their mood changes">
          <ToggleSwitch checked={emotionPopupEnabled} onChange={setEmotionPopupEnabled} />
        </SettingsRow>

        <SettingsRow label="Popup duration" hint="How long the popup stays before fading away">
          <TextInput
            type="number"
            value={emotionPopupDuration}
            onChange={(e) => setEmotionPopupDuration(Math.max(300, Number(e.target.value)))}
            min="300"
            step="100"
            disabled={!emotionPopupEnabled}
            className="w-40"
          />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
};

export default ChatInterfaceSettings;
