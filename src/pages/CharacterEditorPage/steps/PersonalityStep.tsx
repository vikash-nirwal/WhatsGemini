import React from "react";
import { FaMagic } from "react-icons/fa";
import { TextArea, ChipSelectField } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { PERSONALITY_TRAIT_PRESETS } from "../../../utils/constants";

interface PersonalityStepProps {
  promptTokens: number;
  personalityTraits: string[];
  setPersonalityTraits: (v: string[]) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  handleExpandIdea: () => void;
  expanding: boolean;
  assistError: string | null;
}

// Wizard step 2/6 - personality/instructions prompt. See IdentityStep.tsx
// for why this is a separate, lazy-loaded file.
const PersonalityStep: React.FC<PersonalityStepProps> = ({
  promptTokens,
  personalityTraits,
  setPersonalityTraits,
  prompt,
  setPrompt,
  handleExpandIdea,
  expanding,
  assistError,
}) => (
  <Card className="p-6 flex flex-col gap-5">
    <div className="flex items-baseline justify-between gap-4">
      <h3 data-slot="section-title" className="font-semibold text-[15px] text-foreground">Personality</h3>
      <span className="text-xs text-subtle font-mono">~{promptTokens.toLocaleString()} tokens</span>
    </div>
    <ChipSelectField
      label="Personality Traits"
      hint="Quick-pick traits folded into the prompt alongside the full personality below."
      value={personalityTraits}
      onChange={setPersonalityTraits}
      presets={PERSONALITY_TRAIT_PRESETS}
      placeholder="Add a trait..."
    />
    <TextArea
      placeholder="Character Prompt (Personality, Style, etc.)"
      value={prompt}
      onChange={(e) => setPrompt(e.target.value)}
      className="resize-none min-h-[220px]"
    />
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="panel"
        onClick={handleExpandIdea}
        disabled={expanding}
        className="h-auto px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
        title="Have the AI turn your short idea into a fuller personality description"
      >
        <FaMagic size={11} /> {expanding ? "Expanding..." : "AI Assist: Expand my idea"}
      </Button>
    </div>
    {assistError && <p className="text-xs text-destructive">{assistError}</p>}
  </Card>
);

export default PersonalityStep;
