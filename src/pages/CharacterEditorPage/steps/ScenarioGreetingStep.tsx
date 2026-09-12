import React from "react";
import { FaMagic } from "react-icons/fa";
import { TextArea, FieldLabel } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";

interface ScenarioGreetingStepProps {
  scenario: string;
  setScenario: (v: string) => void;
  firstMes: string;
  setFirstMes: (v: string) => void;
  handleGenerateGreeting: () => void;
  generatingGreeting: boolean;
  assistError: string | null;
}

// Wizard step 3/6 - scenario + first message. See IdentityStep.tsx for why
// this is a separate, lazy-loaded file.
const ScenarioGreetingStep: React.FC<ScenarioGreetingStepProps> = ({
  scenario,
  setScenario,
  firstMes,
  setFirstMes,
  handleGenerateGreeting,
  generatingGreeting,
  assistError,
}) => (
  <>
    <Card className="p-6 flex flex-col gap-5">
      <FieldLabel hint="The current setting or plot context, given to the AI alongside the personality above.">Scenario</FieldLabel>
      <TextArea
        placeholder="Scenario (e.g. You run into each other at a rainy bus stop after years apart) (Optional)"
        value={scenario}
        onChange={(e) => setScenario(e.target.value)}
        className="resize-none min-h-[100px]"
      />
    </Card>

    <Card className="p-6 flex flex-col gap-5">
      <FieldLabel hint="Sent as this character's opening message when a brand-new chat is started. Leave blank to use the app's default greeting instead.">First Message</FieldLabel>
      <TextArea
        placeholder="First Message / Greeting (Optional)"
        value={firstMes}
        onChange={(e) => setFirstMes(e.target.value)}
        className="resize-none min-h-[100px]"
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="panel"
          onClick={handleGenerateGreeting}
          disabled={generatingGreeting}
          className="h-auto px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
          title="Have the AI draft a greeting from the personality and scenario above"
        >
          <FaMagic size={11} /> {generatingGreeting ? "Generating..." : "Generate Greeting from Scenario"}
        </Button>
      </div>
      {assistError && <p className="text-xs text-destructive">{assistError}</p>}
    </Card>
  </>
);

export default ScenarioGreetingStep;
