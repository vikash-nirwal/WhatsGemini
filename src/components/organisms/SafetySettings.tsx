import React from 'react';
import { FaShieldAlt } from 'react-icons/fa';
import { cn } from '../../utils/cn';
import { useColorTheme } from '../../hooks/useColorTheme';
import { AISafetySettings } from '../../types';
import { harmThresholds } from '../../utils/constants';
import { SettingsCard, SettingsRow } from 'src/components/molecules/settings-card';
import { SegmentedControl } from 'src/components/molecules/SegmentedControl';

interface SafetySettingsProps {
  chatProvider: string;
  safetySettings: AISafetySettings;
  safetyCategories: (keyof AISafetySettings)[];
  onSafetyChange: (category: keyof AISafetySettings, value: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  harassment: "Harassment",
  hate_speech: "Hate speech",
  sexual: "Sexually explicit",
  dangerous: "Dangerous content",
};

const SafetySettings: React.FC<SafetySettingsProps> = ({
  chatProvider, safetySettings, safetyCategories, onSafetyChange,
}) => {
  const { is } = useColorTheme();
  return (
    <div className="flex flex-col gap-5">
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-lg bg-card border border-border/50 text-[13px] text-muted-foreground",
          is("aurora") && "surface-sunken border-none"
        )}
      >
        <FaShieldAlt className="text-primary flex-none" size={15} />
        <span>
          Applies to <span className="text-foreground font-medium">Google Gemini</span> only. Other providers don't
          expose an equivalent control.
        </span>
      </div>

      <SettingsCard>
        {safetyCategories.map((category) => (
          <SettingsRow key={category} label={CATEGORY_LABELS[category] || category}>
            <SegmentedControl
              value={safetySettings[category]}
              onChange={(val) => onSafetyChange(category, val)}
              options={harmThresholds}
              disabled={chatProvider !== "gemini"}
            />
          </SettingsRow>
        ))}
      </SettingsCard>
    </div>
  );
};

export default SafetySettings;
