import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaTrash, FaGlobe, FaPaperPlane, FaCheckCircle, FaUndo, FaRedo } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { deleteAdventure, addAdventureMessage, updateAdventureStatus, incrementAdventureUsage } from "../features/adventureSlice";
import { generateAIResponse } from "../features/aiSlice";
import { buildChatHistory } from "../features/ai/utils/promptComposition";
import { buildAdventureSystemInstruction, parseAdventureChoices, ADVENTURE_OPENING_PROMPT } from "../features/ai/utils/adventurePrompt";
import { useModal } from "../contexts/ModalContext";
import { Message } from "../types";
import { YOU, AI } from "../utils/constants";
import { cn } from "../utils/cn";
import { Button } from "src/components/atoms/button";
import { Badge } from "src/components/atoms/badge";
import { Textarea } from "src/components/atoms/textarea";
import Header, { HeaderAction } from "src/components/organisms/Header";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import MarkdownRenderer from "src/components/molecules/MarkdownRenderer";

const AdventurePage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { showConfirm } = useModal();
  const { adventureId } = useParams();
  const adventures = useAppSelector((state) => state.adventure.adventures);
  const worlds = useAppSelector((state) => state.world.worlds);
  const characters = useAppSelector((state) => state.character.characters);
  const personas = useAppSelector((state) => state.settings.personas);
  const globalActivePersonaId = useAppSelector((state) => state.settings.activePersonaId);

  const adventure = adventures.find((a) => a.id === Number(adventureId));
  const world = worlds.find((w) => w.id === adventure?.worldId);
  const cast = useMemo(() => characters.filter((c) => adventure?.characterIds.includes(c.id)), [characters, adventure?.characterIds]);
  // Which persona this adventure actually speaks as: its own override if set,
  // otherwise whichever persona is globally active - same rule ChatPage uses.
  const persona = personas.find((p) => p.id === (adventure?.personaId || globalActivePersonaId)) || personas[0];

  const [inputText, setInputText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openingTriggeredRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const generateNarratorReply = useCallback(
    async (prompt: string, contextMessages: Message[]) => {
      if (!adventure) return;
      const history = buildChatHistory(contextMessages);
      const systemInstruction = buildAdventureSystemInstruction(adventure, world, cast, persona, contextMessages);
      const result = await dispatch(generateAIResponse({ prompt, history, systemInstruction })).unwrap();
      const { text, choices } = parseAdventureChoices(result.text);
      await dispatch(addAdventureMessage({ adventureId: adventure.id, message: { role: AI, txt: text, choices } }));
      if (result.tokenCount || result.costEstimate) {
        dispatch(incrementAdventureUsage({ adventureId: adventure.id, tokens: result.tokenCount, cost: result.costEstimate }));
      }
    },
    [adventure, world, cast, persona, dispatch]
  );

  const runOpeningTurn = useCallback(async () => {
    if (!adventure) return;
    setError(null);
    setGenerating(true);
    try {
      await generateNarratorReply(ADVENTURE_OPENING_PROMPT, []);
    } catch (err: any) {
      setError(typeof err === "string" ? err : "Failed to begin the adventure. Check your API key in Settings.");
    } finally {
      setGenerating(false);
    }
  }, [adventure, generateNarratorReply]);

  const handleSend = useCallback(
    async (text: string, chosenChoiceId?: string) => {
      if (!text.trim() || !adventure || generating) return;
      setError(null);
      setGenerating(true);
      setInputText("");
      try {
        const contextMessages = await dispatch(addAdventureMessage({ adventureId: adventure.id, message: { role: YOU, txt: text, chosenChoiceId } })).unwrap();
        await generateNarratorReply(text, contextMessages);
      } catch (err: any) {
        setError(typeof err === "string" ? err : "Failed to continue the adventure. Check your API key in Settings.");
      } finally {
        setGenerating(false);
      }
    },
    [adventure, generating, dispatch, generateNarratorReply]
  );

  // A brand-new adventure has no opening scene yet - trigger it once,
  // automatically, the first time this page sees an empty adventure. The ref
  // (not just the content-length check) stops a failed attempt from retrying
  // in a loop; the empty-state "Begin adventure" button covers manual retry.
  useEffect(() => {
    if (adventure && adventure.content.length === 0 && !openingTriggeredRef.current) {
      openingTriggeredRef.current = true;
      runOpeningTurn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adventure?.id, adventure?.content.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [adventure?.content.length, generating]);

  if (!adventure) {
    return (
      <div className="w-full h-screen flex flex-col">
        <Header title="Adventure" onBack={() => navigate("/adventures")} />
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Adventure not found.</div>
      </div>
    );
  }

  const handleDelete = async () => {
    const confirmed = await showConfirm("Delete adventure", `Delete "${adventure.title}"? This can't be undone.`);
    if (confirmed) {
      await dispatch(deleteAdventure(adventure.id));
      navigate("/adventures");
    }
  };

  const isCompleted = adventure.status === "completed";
  const lastMessage = adventure.content[adventure.content.length - 1];
  const activeChoices = !generating && !isCompleted && lastMessage?.role === AI ? lastMessage.choices : undefined;

  const headerActions: HeaderAction[] = [
    {
      icon: isCompleted ? FaUndo : FaCheckCircle,
      label: isCompleted ? "Reopen adventure" : "Mark completed",
      onClick: () => dispatch(updateAdventureStatus({ adventureId: adventure.id, status: isCompleted ? "active" : "completed" })),
    },
    { icon: FaTrash, label: "Delete adventure", onClick: handleDelete, danger: true },
  ];

  return (
    <div className="w-full h-screen flex flex-col">
      <Header title={adventure.title} subtitle={world ? world.name : "Freeform"} onBack={() => navigate("/adventures")} actionGroups={[headerActions]} />

      {(world || cast.length > 0) && (
        <div className="flex items-center gap-3 px-4 md:px-8 py-2.5 border-b border-border/40 flex-wrap flex-shrink-0">
          {world && (
            <Badge variant="outline" className="border-primary/20 bg-primary/10 font-medium text-primary text-[11px]">
              <FaGlobe size={9} className="mr-1" /> {world.name}
            </Badge>
          )}
          {cast.length > 0 && (
            <div className="flex items-center gap-1.5">
              {cast.map((c) => (
                <CharacterAvatar key={c.id} name={c.name} accent={c.accent} imageSrc={c.appearanceImages?.[0]} size={22} />
              ))}
              <span className="text-[11px] text-muted-foreground">{cast.map((c) => c.name).join(", ")}</span>
            </div>
          )}
          {isCompleted && <Badge variant="secondary" className="text-[10px] ml-auto">Completed</Badge>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <div className="w-full max-w-[760px] mx-auto flex flex-col gap-5">
          {adventure.content.length === 0 && !generating && !error && (
            <p className="text-sm text-muted-foreground text-center py-8">Setting the scene...</p>
          )}
          {adventure.content.length === 0 && error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-destructive text-center">{error}</p>
              <Button onClick={runOpeningTurn} variant="default">Begin adventure</Button>
            </div>
          )}
          {adventure.content.map((msg, i) => (
            <div key={msg.id || i} className={cn("flex", msg.role === YOU ? "justify-end" : "justify-start")}>
              {msg.role === YOU ? (
                <div className="max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-2.5">
                  <MarkdownRenderer msgText={msg.txt || ""} isUser={true} />
                </div>
              ) : (
                <div className="w-full">
                  <MarkdownRenderer msgText={msg.txt || ""} isUser={false} />
                </div>
              )}
            </div>
          ))}
          {generating && (
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
            </div>
          )}
          {error && adventure.content.length > 0 && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {isCompleted ? (
        <div className="flex-shrink-0 px-4 md:px-8 py-4 border-t border-border/40 flex items-center justify-center gap-3 text-sm text-muted-foreground">
          This adventure is marked completed.
          <Button onClick={() => dispatch(updateAdventureStatus({ adventureId: adventure.id, status: "active" }))} variant="outline" size="sm">
            <FaRedo size={10} /> Resume
          </Button>
        </div>
      ) : (
        <div className="flex-shrink-0 border-t border-border/40">
          {activeChoices && activeChoices.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 md:px-8 pt-3">
              {activeChoices.map((choice) => (
                <Button key={choice.id} onClick={() => handleSend(choice.label, choice.id)} disabled={generating} variant="outline" className="h-auto py-2 px-3.5 text-left text-xs font-medium whitespace-normal">
                  {choice.label}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-2 px-4 md:px-8 py-3.5">
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(inputText);
                }
              }}
              placeholder="What do you do?"
              disabled={generating || adventure.content.length === 0}
              className="resize-none min-h-[44px] max-h-[160px]"
            />
            <Button
              onClick={() => handleSend(inputText)}
              disabled={generating || !inputText.trim() || adventure.content.length === 0}
              size="icon"
              className="h-auto flex-shrink-0 self-end aspect-square"
              aria-label="Send"
            >
              <FaPaperPlane size={13} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdventurePage;
