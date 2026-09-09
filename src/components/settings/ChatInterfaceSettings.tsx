import React from 'react';
import { TextInput } from '../ui/FormControls';
import InitialMessages from '../InitialMessages';
import { SettingsCard, SettingsCardHeader, SettingsRow } from './SettingsCard';
import { SegmentedControl } from './SegmentedControl';

interface ChatInterfaceSettingsProps {
  maxChatLength: number;
  setMaxChatLength: (val: number) => void;
  fontSize: string;
  setFontSize: (val: string) => void;
  initialMessagesKey: number;
  onInitialMessagesSave: () => void;
}

const FONT_SIZE_OPTIONS = [
  { value: "14px", label: "Small" },
  { value: "16px", label: "Medium" },
  { value: "18px", label: "Large" },
  { value: "20px", label: "Extra large" },
];

const ChatInterfaceSettings: React.FC<ChatInterfaceSettingsProps> = ({
  maxChatLength, setMaxChatLength, fontSize, setFontSize, initialMessagesKey, onInitialMessagesSave,
}) => {
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
              className="rounded-lg bg-background border border-input px-3.5 py-3 font-serif leading-relaxed"
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
    </div>
  );
};

export default ChatInterfaceSettings;
