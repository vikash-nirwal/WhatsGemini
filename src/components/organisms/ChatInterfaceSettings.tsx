import React, { useState } from 'react';
import { cn } from '../../utils/cn';
import { useColorTheme } from '../../hooks/useColorTheme';
import { TextArea, TextInput } from "src/components/molecules/form-controls";
import { Button } from 'src/components/atoms/button';
import { DEFAULT_EVENTS, loadEventDeck, saveEventDeck } from 'src/features/chat/eventDeck';
import InitialMessages from 'src/components/molecules/InitialMessages';
import { SettingsCard, SettingsCardHeader, SettingsRow } from 'src/components/molecules/settings-card';
import { SegmentedControl } from 'src/components/molecules/SegmentedControl';
import ToggleSwitch from 'src/components/atoms/ToggleSwitch';
import NotificationSettings from 'src/components/organisms/NotificationSettings';
import { clampDayHours, loadStatusDayHours, saveStatusDayHours } from 'src/features/character/statusUpdates';
import { applyReadingComfort, LineSpacing, loadReadingComfort, ReadingComfort, ReadingFont, saveReadingComfort } from 'src/features/settings/readingComfort';

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

// The event deck (#49), one event per line, kept in this browser.
const EventDeckSetting = () => {
  const [text, setText] = useState(() => loadEventDeck().join("\n"));
  const isDefault = text.trim() === DEFAULT_EVENTS.join("\n");
  return (
    <div className="flex flex-col gap-2">
      <TextArea
        aria-label="Event deck"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => setText(saveEventDeck(text).join("\n"))}
        className="min-h-[140px] text-sm"
      />
      {!isDefault && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setText(saveEventDeck("").join("\n"))}>
            Reset to the built-in deck
          </Button>
        </div>
      )}
    </div>
  );
};

// Reading comfort (#91): saved on this device and applied right away.
// How long a status lasts (#140): one "day", 1 to 24 hours.
const StatusDayRow = () => {
  const [hours, setHours] = useState(loadStatusDayHours);
  return (
    <SettingsRow label="How long a day is" hint="Statuses, yours and the characters', last one day, and so does the Feed. Shorten the day to see them come and go faster." align="start">
      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <input
          type="number"
          min={1}
          max={24}
          value={hours}
          aria-label="Hours in a day"
          onChange={(e) => {
            const next = clampDayHours(Number(e.target.value));
            setHours(next);
            saveStatusDayHours(next);
          }}
          className="h-10 w-20 rounded-[10px] bg-sunken px-3 text-[14px] text-foreground ring-1 ring-inset ring-border"
        />
        hours
      </label>
    </SettingsRow>
  );
};

const ReadingComfortRows = () => {
  const [value, setValue] = useState<ReadingComfort>(() => loadReadingComfort());
  const update = (patch: Partial<ReadingComfort>) => {
    const next = { ...value, ...patch };
    setValue(next);
    saveReadingComfort(next);
    applyReadingComfort(next);
  };
  return (
    <>
      <SettingsRow label="Reading font" hint="Atkinson Hyperlegible is made for easy reading at any size; Lexend is designed for reading fluency and often suggested for dyslexia." align="start">
        <SegmentedControl
          value={value.font}
          onChange={(v) => update({ font: v as ReadingFont })}
          options={[
            { value: "theme", label: "Theme's own" },
            { value: "atkinson", label: "Atkinson" },
            { value: "lexend", label: "Lexend" },
          ]}
        />
      </SettingsRow>
      <SettingsRow label="Line spacing" align="start">
        <SegmentedControl
          value={value.lineSpacing}
          onChange={(v) => update({ lineSpacing: v as LineSpacing })}
          options={[
            { value: "normal", label: "Normal" },
            { value: "relaxed", label: "Relaxed" },
            { value: "loose", label: "Loose" },
          ]}
        />
      </SettingsRow>
      <SettingsRow label="High contrast" hint="Muted and faint text become full-strength text, everywhere in the app." align="start">
        <ToggleSwitch checked={value.highContrast} onChange={(on) => update({ highContrast: on })} label={<span className="sr-only">High contrast</span>} />
      </SettingsRow>
    </>
  );
};

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
              data-chat-text
              style={{ fontSize }}
            >
              <span className="italic text-muted-foreground">He checks the time again.</span> "Short messages,
              remember? You're shipping code, not novels."
            </div>
          </div>
        </SettingsRow>

        <ReadingComfortRows />

        <SettingsRow label="Texting mode" hint="Replies arrive as separate texts, one at a time with typing pauses, and your messages show read ticks. Only the display changes." align="start">
          <ToggleSwitch checked={textingMode} onChange={setTextingMode} label={<span className="sr-only">Texting mode</span>} />
        </SettingsRow>

        <StatusDayRow />

        <SettingsRow label={'"Previously on…" recap'} hint="Coming back to a chat after this long shows a short recap of where the story stands. Written once and kept; never sent to the AI." align="start">
          <SegmentedControl value={String(recapAfterDays)} onChange={(v) => setRecapAfterDays(Number(v))} options={RECAP_OPTIONS} />
        </SettingsRow>

        <SettingsRow label="Event deck" hint={'"Draw an event card" in a chat picks one of these at random, and the next reply works it into the scene. One per line.'} align="start">
          <EventDeckSetting />
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
