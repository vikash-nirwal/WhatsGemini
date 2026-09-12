import React from "react";
import Modal from "src/components/molecules/Modal";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { TextInput, FieldLabel } from "src/components/molecules/form-controls";

export interface AutoReplySettings {
  enabled: boolean;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  maxFollowups: number;
  followupCount: number;
}

interface AutoReplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AutoReplySettings;
  onChange: (patch: Partial<AutoReplySettings>) => void;
}

// The "Auto Follow-up" settings popup - see PortraitPreviewModal.tsx for why
// this is a separate file (readability, not a lazy-loading win).
const AutoReplyModal: React.FC<AutoReplyModalProps> = ({ isOpen, onClose, settings, onChange }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Auto Follow-up">
    <ToggleSwitch
      checked={settings.enabled}
      onChange={(val) => onChange({ enabled: val })}
      label="Let the character follow up on their own"
    />
    <div className="flex gap-3">
      <div className="flex-1">
        <FieldLabel hint="Shortest wait after their last message before following up.">Min delay (seconds)</FieldLabel>
        <TextInput
          type="number"
          min="5"
          max={settings.maxDelaySeconds}
          value={settings.minDelaySeconds}
          onChange={(e) => {
            const val = Math.max(5, Number(e.target.value));
            onChange({
              minDelaySeconds: val,
              maxDelaySeconds: Math.max(val, settings.maxDelaySeconds),
            });
          }}
        />
      </div>
      <div className="flex-1">
        <FieldLabel hint="Longest wait - the actual delay is randomized between min and max each time.">Max delay (seconds)</FieldLabel>
        <TextInput
          type="number"
          min={settings.minDelaySeconds}
          max="600"
          value={settings.maxDelaySeconds}
          onChange={(e) => {
            const val = Math.max(settings.minDelaySeconds, Number(e.target.value));
            onChange({ maxDelaySeconds: val });
          }}
        />
      </div>
    </div>
    <div>
      <FieldLabel hint="Stops following up on its own after this many messages, until you reply again.">Max follow-ups</FieldLabel>
      <TextInput
        type="number"
        min="1"
        max="10"
        value={settings.maxFollowups}
        onChange={(e) => onChange({ maxFollowups: Math.max(1, Number(e.target.value)) })}
      />
    </div>
    {settings.enabled && (
      <p className="text-xs text-ink-faint">
        {settings.followupCount}/{settings.maxFollowups} follow-up(s) sent since you last replied. Only runs while this chat is open in your browser.
      </p>
    )}
  </Modal>
);

export default AutoReplyModal;
