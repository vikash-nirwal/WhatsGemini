import React from "react";
import { FaTimes, FaEdit, FaPlus } from "react-icons/fa";
import { Character, LoreEntry } from "../../../types";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { Input } from "src/components/atoms/input";
import TestChatPane from "src/components/organisms/TestChatPane";
import { MEMORY_EXTRACTION_INTERVAL } from "../../../utils/constants";

interface TestFinalizeStepProps {
  name: string;
  description: string;
  prompt: string;
  scenario: string;
  firstMes: string;
  mesExample: string;
  relationship: string;
  appearance: string;
  appearanceImages: string[];
  accent: [string, string];
  tags: string[];
  loreEntries: LoreEntry[];
  personalityTraits: string[];
  editCharacter: Character | null;
  editingFactIndex: number | null;
  factDraft: string;
  setFactDraft: (v: string) => void;
  startEditFact: (index: number) => void;
  commitFactEdit: () => void;
  setEditingFactIndex: (index: number | null) => void;
  handleRemoveMemoryFact: (index: number) => void;
  addingFact: boolean;
  setAddingFact: (v: boolean) => void;
  commitNewFact: () => void;
}

// Wizard step 6/6 - review summary, memory facts, and the live test chat
// pane. See IdentityStep.tsx for why this is a separate, lazy-loaded file -
// this step in particular is the one worth deferring, since TestChatPane is
// a full AI chat simulator only ever needed once the user reaches here.
const TestFinalizeStep: React.FC<TestFinalizeStepProps> = ({
  name,
  description,
  prompt,
  scenario,
  firstMes,
  mesExample,
  relationship,
  appearance,
  appearanceImages,
  accent,
  tags,
  loreEntries,
  personalityTraits,
  editCharacter,
  editingFactIndex,
  factDraft,
  setFactDraft,
  startEditFact,
  commitFactEdit,
  setEditingFactIndex,
  handleRemoveMemoryFact,
  addingFact,
  setAddingFact,
  commitNewFact,
}) => (
  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
    {/* Left: Review summary + Memory */}
    <div className="flex flex-col gap-6">
      <Card className="p-6 flex flex-col gap-5">
        <h3 data-slot="section-title" className="font-semibold text-[15px] text-foreground">Review</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
          <div>
            <div className="text-xs text-subtle mb-1">Name</div>
            <div className="text-foreground">{name || <span className="text-subtle">-</span>}</div>
          </div>
          <div>
            <div className="text-xs text-subtle mb-1">Tagline</div>
            <div className="text-foreground">{relationship || <span className="text-subtle">-</span>}</div>
          </div>
          <div>
            <div className="text-xs text-subtle mb-1">Tags</div>
            <div className="text-foreground">{tags.length > 0 ? tags.join(", ") : <span className="text-subtle">-</span>}</div>
          </div>
          <div>
            <div className="text-xs text-subtle mb-1">First message</div>
            <div className="text-foreground truncate">{firstMes || <span className="text-subtle">Uses default greeting</span>}</div>
          </div>
          <div>
            <div className="text-xs text-subtle mb-1">Lore entries</div>
            <div className="text-foreground">{loreEntries.length > 0 ? `${loreEntries.length} entr${loreEntries.length === 1 ? "y" : "ies"}` : <span className="text-subtle">-</span>}</div>
          </div>
        </div>
        <div>
          <div className="text-xs text-subtle mb-1">Personality</div>
          <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-4">{prompt || <span className="text-subtle">-</span>}</p>
        </div>
        {scenario && (
          <div>
            <div className="text-xs text-subtle mb-1">Scenario</div>
            <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">{scenario}</p>
          </div>
        )}
        {mesExample && (
          <div>
            <div className="text-xs text-subtle mb-1">Example dialogue</div>
            <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">{mesExample}</p>
          </div>
        )}
      </Card>

      {editCharacter && (
        <Card className="p-6 flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-4">
            <h3 data-slot="section-title" className="font-semibold text-[15px] text-foreground">
              Memory {editCharacter.memory && editCharacter.memory.length > 0 && (
                <span className="text-subtle font-normal text-xs">({editCharacter.memory.length} facts remembered)</span>
              )}
            </h3>
          </div>
          {editCharacter.memory && editCharacter.memory.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {editCharacter.memory.map((fact, idx) =>
                editingFactIndex === idx ? (
                  <Input
                    key={idx}
                    autoFocus
                    value={factDraft}
                    onChange={(e) => setFactDraft(e.target.value)}
                    onBlur={commitFactEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitFactEdit();
                      } else if (e.key === "Escape") {
                        setEditingFactIndex(null);
                        setFactDraft("");
                      }
                    }}
                    className="h-7 w-48 text-xs px-2.5 py-0 rounded-full"
                  />
                ) : (
                  <span key={idx} className="inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-background border border-input text-xs">
                    {fact}
                    <Button
                      onClick={() => startEditFact(idx)}
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 rounded-full text-subtle hover:bg-primary/10 hover:text-primary flex-shrink-0"
                      title="Edit this fact"
                      aria-label="Edit this fact"
                    >
                      <FaEdit size={9} />
                    </Button>
                    <Button
                      onClick={() => handleRemoveMemoryFact(idx)}
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 rounded-full text-subtle hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                      title="Forget this fact"
                      aria-label="Forget this fact"
                    >
                      <FaTimes size={10} />
                    </Button>
                  </span>
                )
              )}
            </div>
          ) : (
            !addingFact && <p className="text-xs text-subtle">No facts remembered yet.</p>
          )}
          {addingFact ? (
            <Input
              autoFocus
              value={factDraft}
              onChange={(e) => setFactDraft(e.target.value)}
              onBlur={commitNewFact}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitNewFact();
                } else if (e.key === "Escape") {
                  setFactDraft("");
                  setAddingFact(false);
                }
              }}
              placeholder="A fact to remember…"
              className="h-7 w-48 text-xs px-2.5 py-0 rounded-full"
            />
          ) : (
            <Button
              onClick={() => setAddingFact(true)}
              variant="outline"
              size="sm"
              className="h-7 self-start text-xs rounded-full border-dashed"
            >
              <FaPlus size={9} className="mr-1.5" /> Add
            </Button>
          )}
          <p className="text-xs text-subtle">Automatically learned from your conversations, every {MEMORY_EXTRACTION_INTERVAL} messages or so.</p>
        </Card>
      )}
    </div>

    {/* Right: Test Chat */}
    <TestChatPane
      name={name}
      description={description}
      prompt={prompt}
      scenario={scenario}
      firstMes={firstMes}
      mesExample={mesExample}
      relationship={relationship}
      appearance={appearance}
      appearanceImages={appearanceImages}
      accent={accent}
      memory={editCharacter?.memory}
      loreEntries={loreEntries}
      personalityTraits={personalityTraits}
    />
  </div>
);

export default TestFinalizeStep;
