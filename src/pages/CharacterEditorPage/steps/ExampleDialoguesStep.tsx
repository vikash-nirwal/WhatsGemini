import React from "react";
import { FaMagic } from "react-icons/fa";
import { TextArea, FieldLabel } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";

interface ExampleDialoguesStepProps {
  name: string;
  mesExample: string;
  setMesExample: (v: string) => void;
  handleGenerateExampleDialogue: () => void;
  generatingExample: boolean;
  assistError: string | null;
}

// Wizard step 4/6 - example dialogues. See IdentityStep.tsx for why this is
// a separate, lazy-loaded file.
const ExampleDialoguesStep: React.FC<ExampleDialoguesStepProps> = ({
  name,
  mesExample,
  setMesExample,
  handleGenerateExampleDialogue,
  generatingExample,
  assistError,
}) => (
  <Card className="p-6 flex flex-col gap-5">
    <FieldLabel hint="Sample exchanges given to the AI purely as a style/format reference (e.g. use asterisks for actions) - never repeated verbatim in the chat.">Example Dialogues</FieldLabel>
    <TextArea
      placeholder={`Example Dialogues (Optional)\nUser: Hey, how was your day?\n${name || "Character"}: *stretches* Long. Yours?`}
      value={mesExample}
      onChange={(e) => setMesExample(e.target.value)}
      className="resize-none min-h-[220px]"
    />
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="panel"
        onClick={handleGenerateExampleDialogue}
        disabled={generatingExample}
        className="h-auto px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
        title="Have the AI draft example exchanges from the personality and scenario - added after anything already here"
      >
        <FaMagic size={11} /> {generatingExample ? "Generating..." : "Generate Example with AI"}
      </Button>
    </div>
    {assistError && <p className="text-xs text-destructive">{assistError}</p>}
  </Card>
);

export default ExampleDialoguesStep;
