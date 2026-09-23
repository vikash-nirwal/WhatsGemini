import React, { useState } from "react";
import { PrivacySettings as PrivacySettingsType } from "../../types";
import { hashPin, newPinSalt } from "../../utils/pinLock";
import { SettingsCard, SettingsCardHeader, SettingsRow } from "src/components/molecules/settings-card";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";

interface PrivacySettingsProps {
  privacy: PrivacySettingsType;
  setPrivacy: (privacy: PrivacySettingsType) => void;
}

const LOCK_AFTER_OPTIONS = [
  { value: "1", label: "1 min" },
  { value: "5", label: "5 min" },
  { value: "15", label: "15 min" },
  { value: "60", label: "1 hour" },
];

const PrivacySettings: React.FC<PrivacySettingsProps> = ({ privacy, setPrivacy }) => {
  const hasPin = Boolean(privacy.pinHash);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const resetInputs = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
  };

  const verifyCurrent = async () =>
    !hasPin || (privacy.pinSalt && (await hashPin(currentPin, privacy.pinSalt)) === privacy.pinHash);

  const handleSetPin = async () => {
    if (!/^\d{4,12}$/.test(newPin)) return setMessage({ text: "Use 4 to 12 digits.", error: true });
    if (newPin !== confirmPin) return setMessage({ text: "The PINs don't match.", error: true });
    if (!(await verifyCurrent())) return setMessage({ text: "Current PIN is wrong.", error: true });
    const salt = newPinSalt();
    setPrivacy({ ...privacy, pinSalt: salt, pinHash: await hashPin(newPin, salt) });
    resetInputs();
    setMessage({ text: hasPin ? "PIN changed." : "PIN set. The app will ask for it next time it opens." });
  };

  const handleRemovePin = async () => {
    if (!(await verifyCurrent())) return setMessage({ text: "Current PIN is wrong.", error: true });
    setPrivacy({ ...privacy, pinHash: undefined, pinSalt: undefined });
    resetInputs();
    setMessage({ text: "PIN removed." });
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader title="Screen privacy" hint="For shared or visible screens." />
        </div>
        <SettingsRow label="Blur NSFW images" hint="Portraits and generated images of NSFW characters stay blurred until tapped." align="start">
          <ToggleSwitch checked={privacy.blurNsfwMedia} onChange={(v) => setPrivacy({ ...privacy, blurNsfwMedia: v })} />
        </SettingsRow>
        <SettingsRow label="Discreet chat list" hint="Hide the preview line of chats with NSFW characters in the sidebar." align="start">
          <ToggleSwitch checked={privacy.discreetMode} onChange={(v) => setPrivacy({ ...privacy, discreetMode: v })} />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader
            title="App lock"
            hint="Asks for a PIN when the app opens and after it's been in the background. This is a privacy screen, not encryption: your chats are still stored readable in this browser."
          />
        </div>
        {hasPin && (
          <SettingsRow label="Current PIN" align="start">
            <Input type="password" inputMode="numeric" value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} className="w-40" aria-label="Current PIN" />
          </SettingsRow>
        )}
        <SettingsRow label={hasPin ? "New PIN" : "PIN"} hint="4 to 12 digits." align="start">
          <div className="flex flex-wrap gap-2">
            <Input type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="PIN" className="w-32" aria-label="New PIN" />
            <Input type="password" inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} placeholder="Repeat" className="w-32" aria-label="Repeat new PIN" />
            <Button type="button" onClick={handleSetPin} disabled={!newPin || !confirmPin}>{hasPin ? "Change PIN" : "Set PIN"}</Button>
            {hasPin && <Button type="button" variant="outline" onClick={handleRemovePin} disabled={!currentPin}>Remove PIN</Button>}
          </div>
          {message && <p className={message.error ? "text-xs text-destructive mt-2" : "text-xs text-subtle mt-2"}>{message.text}</p>}
        </SettingsRow>
        {hasPin && (
          <SettingsRow label="Lock after" hint="Time in the background before the PIN is asked again." align="start">
            <SegmentedControl
              value={String(privacy.lockAfterMinutes)}
              onChange={(v) => setPrivacy({ ...privacy, lockAfterMinutes: Number(v) })}
              options={LOCK_AFTER_OPTIONS}
            />
          </SettingsRow>
        )}
      </SettingsCard>
    </div>
  );
};

export default PrivacySettings;
