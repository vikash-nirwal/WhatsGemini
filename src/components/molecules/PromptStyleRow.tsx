import React, { useEffect, useState } from "react";
import { SettingsRow } from "src/components/molecules/settings-card";
import { DIALECT_LABELS, resolveImagePromptTarget } from "src/features/ai/utils/imagePromptGuide";
import { COMFYUI_SETTINGS_EVENT } from "src/features/ai/comfyui/settings";

interface PromptStyleRowProps {
  providerId: string;
  imageModel: string;
  sdWebuiModel: string;
}

// Which way picture prompts are worded for the current setup (see
// imagePromptGuide.ts), so a wrongly guessed checkpoint shows up here rather
// than as odd pictures. ComfyUI can run a different workflow with a
// reference photo, so it gets both lines.
export const PromptStyleRow: React.FC<PromptStyleRowProps> = ({ providerId, imageModel, sdWebuiModel }) => {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener(COMFYUI_SETTINGS_EVENT, refresh);
    return () => window.removeEventListener(COMFYUI_SETTINGS_EVENT, refresh);
  }, []);

  const describe = (hasReference: boolean) => {
    const target = resolveImagePromptTarget({ providerId, imageModel, sdWebuiModel, hasReference });
    return `${DIALECT_LABELS[target.dialect]}, for ${target.engine}`;
  };
  const plain = describe(false);
  const withReference = providerId === "comfyui" ? describe(true) : plain;

  return (
    <SettingsRow label="Prompt style" hint="How the text model words picture prompts for this setup, worked out from the provider, model and checkpoint." align="start">
      <div data-testid="prompt-style" className="flex flex-col gap-1 text-[12.5px] text-foreground">
        {withReference === plain ? (
          <span>{plain}</span>
        ) : (
          <>
            <span>Without a photo: {plain}</span>
            <span>With a reference photo: {withReference}</span>
          </>
        )}
      </div>
    </SettingsRow>
  );
};
