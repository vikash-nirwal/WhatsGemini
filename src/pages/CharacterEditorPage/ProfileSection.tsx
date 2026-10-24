import React from "react";
import { FaChevronRight } from "react-icons/fa";
import { TextInput } from "src/components/molecules/form-controls";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";

interface ProfileSectionProps {
  name: string;
  about: string;
  changes: boolean;
  onChange: (value: { about: string; changes: boolean }) => void;
}

// Their messaging profile (#125): the About line under their name, and
// whether they change it (and now and then their photo) on their own.
const ProfileSection: React.FC<ProfileSectionProps> = ({ name, about, changes, onChange }) => {
  const who = name.trim() || "The character";
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        Profile
        <span className="text-xs font-normal text-muted-foreground">{about ? `"${about}"` : "no About line"}</span>
      </summary>
      <div className="mt-4 flex flex-col gap-3">
        <TextInput aria-label="About line" maxLength={80} placeholder='About, like "Busy, coffee first"' value={about} onChange={(e) => onChange({ about: e.target.value, changes })} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {who} changes their About line every few days, and every other time their profile photo (on your image provider), with a notice in your chat.
          </p>
          <ToggleSwitch checked={changes} onChange={(on) => onChange({ about, changes: on })} label={<span className="sr-only">{who} changes their profile</span>} />
        </div>
      </div>
    </details>
  );
};

export default ProfileSection;
