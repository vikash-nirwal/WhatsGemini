import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaTrash, FaGlobe, FaPaperPlane, FaCheckCircle, FaUndo, FaRedo, FaImage, FaSyncAlt, FaTimes, FaPalette, FaBookOpen, FaComments, FaFont } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { deleteAdventure, addAdventureMessage, updateAdventureStatus, incrementAdventureUsage, updateAdventureMessage, updateAdventureRules } from "../features/adventureSlice";
import { generateAIResponse, generateAdventureSceneImage } from "../features/aiSlice";
import { buildChatHistory } from "../features/ai/utils/promptComposition";
import { buildAdventureSystemInstruction, parseAdventureChoices, extractAdventureEmotions, ADVENTURE_OPENING_PROMPT } from "../features/ai/utils/adventurePrompt";
import { resolveEmotionPortrait } from "../features/ai/utils/emotionUtils";
import { setEmotionPanelEnabled } from "../features/settingsSlice";
import EmotionSpritePanel from "src/components/molecules/EmotionSpritePanel";
import EmotionPopup, { EmotionPopupTrigger } from "src/components/molecules/EmotionPopup";
import { useModal } from "../contexts/ModalContext";
import { Message } from "../types";
import { YOU, AI, ART_STYLES, DEFAULT_ART_STYLE } from "../utils/constants";
import { cn } from "../utils/cn";
import { Button } from "src/components/atoms/button";
import { Badge } from "src/components/atoms/badge";
import { Textarea } from "src/components/atoms/textarea";
import Header, { HeaderAction } from "src/components/organisms/Header";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import MarkdownRenderer from "src/components/molecules/MarkdownRenderer";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "src/components/molecules/dialog";
import { NovelMessageItem } from "src/components/molecules/NovelMessageItem";
import { NovelChoicesView } from "src/components/molecules/NovelChoicesView";

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

  // View mode: novel (storybook) vs chat (bubbles)
  const [viewMode, setViewMode] = useState<"chat" | "novel">(() => {
    try {
      return (localStorage.getItem("whatsgemini_adventure_view_mode") as "chat" | "novel") || "novel";
    } catch {
      return "novel";
    }
  });

  // Reader typography preferences
  const [fontFamily, setFontFamily] = useState<"serif" | "sans">(() => {
    try {
      return (localStorage.getItem("whatsgemini_adventure_font_family") as "serif" | "sans") || "serif";
    } catch {
      return "serif";
    }
  });

  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg" | "xl">(() => {
    try {
      return (localStorage.getItem("whatsgemini_adventure_font_size") as "sm" | "base" | "lg" | "xl") || "base";
    } catch {
      return "base";
    }
  });

  const handleToggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next = prev === "novel" ? "chat" : "novel";
      try {
        localStorage.setItem("whatsgemini_adventure_view_mode", next);
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  }, []);

  const handleToggleFontFamily = useCallback(() => {
    setFontFamily((prev) => {
      const next = prev === "serif" ? "sans" : "serif";
      try {
        localStorage.setItem("whatsgemini_adventure_font_family", next);
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  }, []);

  const handleCycleFontSize = useCallback(() => {
    setFontSize((prev) => {
      const sizes: ("sm" | "base" | "lg" | "xl")[] = ["sm", "base", "lg", "xl"];
      const nextIndex = (sizes.indexOf(prev) + 1) % sizes.length;
      const next = sizes[nextIndex];
      try {
        localStorage.setItem("whatsgemini_adventure_font_size", next);
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  }, []);

  const [inputText, setInputText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openingTriggeredRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Message ids currently being illustrated, and per-message failures - kept
  // per message so illustrating one turn never blocks playing the next.
  const [illustratingIds, setIllustratingIds] = useState<string[]>([]);
  const [illustrationErrors, setIllustrationErrors] = useState<Record<string, string>>({});
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  // Composer toggle: illustrate the narrator's reply to the next action,
  // focused on what the player asked to see.
  const [imageRequested, setImageRequested] = useState(false);

  const illustrateMessage = useCallback(
    async (msg: Message, { regenerate = false, requestedFocus, includeFullCast = false }: { regenerate?: boolean; requestedFocus?: string; includeFullCast?: boolean } = {}) => {
      if (!adventure || !msg.id || !msg.txt) return;
      const messageId = msg.id;
      const artStyle = adventure.rules?.artStyle || DEFAULT_ART_STYLE;
      setIllustratingIds((ids) => [...ids, messageId]);
      setIllustrationErrors((errs) => {
        const next = { ...errs };
        delete next[messageId];
        return next;
      });
      try {
        const result = await dispatch(
          generateAdventureSceneImage({
            narration: msg.txt!,
            world,
            cast,
            persona,
            artStyle,
            castEmotions: msg.castEmotions,
            requestedFocus,
            includeFullCast,
            // The saved prompt has its style and casting written into it, so
            // it's only reusable if neither has changed since.
            existingImagePrompt:
              regenerate && (msg.imageArtStyle || DEFAULT_ART_STYLE) === artStyle && !!msg.imageFullCast === includeFullCast ? msg.imagePrompt : undefined,
          })
        ).unwrap();
        await dispatch(updateAdventureMessage({ adventureId: adventure.id, messageId, patch: { images: result.images, imagePrompt: result.imagePrompt, imageArtStyle: artStyle, imageFullCast: includeFullCast } }));
        if (result.tokens || result.cost) {
          dispatch(incrementAdventureUsage({ adventureId: adventure.id, tokens: result.tokens, cost: result.cost }));
        }
      } catch (err: any) {
        setIllustrationErrors((errs) => ({ ...errs, [messageId]: typeof err === "string" ? err : "Failed to illustrate the scene." }));
      } finally {
        setIllustratingIds((ids) => ids.filter((id) => id !== messageId));
      }
    },
    [adventure, world, cast, persona, dispatch]
  );

  const generateNarratorReply = useCallback(
    async (prompt: string, contextMessages: Message[], imageRequestFocus?: string) => {
      if (!adventure) return;
      const history = buildChatHistory(contextMessages);
      const systemInstruction = buildAdventureSystemInstruction(adventure, world, cast, persona, contextMessages);
      const result = await dispatch(generateAIResponse({ prompt, history, systemInstruction })).unwrap();
      // Emotions first: the tag can land on either side of the choices block.
      const { text: withoutEmotions, castEmotions } = extractAdventureEmotions(result.text, cast);
      const { text, choices } = parseAdventureChoices(withoutEmotions);
      const content = await dispatch(addAdventureMessage({ adventureId: adventure.id, message: { role: AI, txt: text, choices, castEmotions } })).unwrap();
      if (result.tokenCount || result.costEstimate) {
        dispatch(incrementAdventureUsage({ adventureId: adventure.id, tokens: result.tokenCount, cost: result.costEstimate }));
      }
      // Fired without awaiting so the choices unlock right away; the picture
      // fills in above the narration when it's ready. A turn the player
      // explicitly asked a picture for is illustrated even with auto off, and
      // shows the whole cast; auto-illustrations only draw who the narration names.
      if (adventure.rules?.autoIllustrate || imageRequestFocus) {
        const narratorMessage = content[content.length - 1];
        if (narratorMessage) illustrateMessage(narratorMessage, { requestedFocus: imageRequestFocus, includeFullCast: !!imageRequestFocus });
      }
    },
    [adventure, world, cast, persona, dispatch, illustrateMessage]
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
      // One-shot, like the chat composer's image toggle.
      const isImageRequest = imageRequested;
      setImageRequested(false);
      setError(null);
      setGenerating(true);
      setInputText("");
      try {
        const contextMessages = await dispatch(addAdventureMessage({ adventureId: adventure.id, message: { role: YOU, txt: text, chosenChoiceId, isImageRequest: isImageRequest || undefined } })).unwrap();
        await generateNarratorReply(text, contextMessages, isImageRequest ? text : undefined);
      } catch (err: any) {
        setError(typeof err === "string" ? err : "Failed to continue the adventure. Check your API key in Settings.");
      } finally {
        setGenerating(false);
      }
    },
    [adventure, generating, imageRequested, dispatch, generateNarratorReply]
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

  // Each cast member's mood as of their most recent narrator turn that
  // reported one - drives the cast bar avatars and the docked portraits.
  const currentEmotions = useMemo(() => {
    const moods: Record<number, string> = {};
    for (const msg of adventure?.content || []) {
      if (msg.role === AI && msg.castEmotions) Object.assign(moods, msg.castEmotions);
    }
    return moods;
  }, [adventure?.content]);

  // Same rule as ChatWindow's docked sprites: only real, generated emotion
  // portraits (chroma-keyed to transparency) - never the opaque main avatar.
  const emotionPanelEnabled = useAppSelector((state) => state.settings.emotionPanelEnabled);
  const emotionPopupEnabled = useAppSelector((state) => state.settings.emotionPopupEnabled);
  const emotionPopupDuration = useAppSelector((state) => state.settings.emotionPopupDuration);
  const dockedSprites = useMemo(
    () =>
      cast.flatMap((c) => {
        const emotion = currentEmotions[c.id];
        const imageSrc = c.emotionPortraits?.enabled && emotion ? c.emotionPortraits.images[emotion] : undefined;
        return imageSrc ? [{ imageSrc, characterName: c.name, emotion, characterId: c.id }] : [];
      }),
    [cast, currentEmotions]
  );

  // Pop a portrait up when a character's mood changes - the first pass only
  // records starting moods so opening an adventure doesn't fire a burst.
  const prevEmotionsRef = useRef<Map<number, string>>(new Map());
  const popupSeqRef = useRef(0);
  const [popupTrigger, setPopupTrigger] = useState<EmotionPopupTrigger | null>(null);
  useEffect(() => {
    for (const sprite of dockedSprites) {
      const prevEmotion = prevEmotionsRef.current.get(sprite.characterId);
      if (emotionPopupEnabled && prevEmotion !== undefined && prevEmotion !== sprite.emotion) {
        popupSeqRef.current += 1;
        setPopupTrigger({ ...sprite, key: popupSeqRef.current });
      }
      prevEmotionsRef.current.set(sprite.characterId, sprite.emotion);
    }
  }, [dockedSprites, emotionPopupEnabled]);

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

  const autoIllustrate = !!adventure.rules?.autoIllustrate;

  const viewModeAction: HeaderAction = {
    icon: viewMode === "novel" ? FaComments : FaBookOpen,
    label: viewMode === "novel" ? "Switch to Chat View" : "Switch to Novel View",
    shortLabel: viewMode === "novel" ? "chat view" : "novel view",
    active: viewMode === "novel",
    primary: true,
    onClick: handleToggleViewMode,
  };

  const headerActions: HeaderAction[] = [
    {
      icon: FaImage,
      label: autoIllustrate ? "Auto-illustrate scenes: on" : "Auto-illustrate scenes: off",
      active: autoIllustrate,
      primary: true,
      onClick: () => dispatch(updateAdventureRules({ adventureId: adventure.id, rules: { ...adventure.rules, autoIllustrate: !autoIllustrate } })),
    },
    {
      icon: isCompleted ? FaUndo : FaCheckCircle,
      label: isCompleted ? "Reopen adventure" : "Mark completed",
      onClick: () => dispatch(updateAdventureStatus({ adventureId: adventure.id, status: isCompleted ? "active" : "completed" })),
    },
    { icon: FaTrash, label: "Delete adventure", onClick: handleDelete, danger: true },
  ];
  // Changing the style mid-story only affects illustrations drawn from here
  // on; existing pictures keep their look until redrawn.
  const artStyle = adventure.rules?.artStyle || DEFAULT_ART_STYLE;
  const artStyleActions: HeaderAction[] = ART_STYLES.map((style) => ({
    icon: FaPalette,
    label: `Art style: ${style.label}`,
    shortLabel: style.label.toLowerCase(),
    active: style.value === artStyle,
    onClick: () => dispatch(updateAdventureRules({ adventureId: adventure.id, rules: { ...adventure.rules, artStyle: style.value } })),
  }));

  const readerActions: HeaderAction[] = viewMode === "novel" ? [
    {
      icon: FaFont,
      label: `Font: ${fontFamily === "serif" ? "Serif (Classic)" : "Sans (Modern)"}`,
      shortLabel: fontFamily,
      onClick: handleToggleFontFamily,
    },
    {
      icon: FaFont,
      label: `Text size: ${fontSize.toUpperCase()}`,
      shortLabel: fontSize,
      onClick: handleCycleFontSize,
    },
  ] : [];

  return (
    <div className="w-full h-screen flex flex-col">
      <Header
        title={adventure.title}
        subtitle={world ? world.name : "Freeform"}
        onBack={() => navigate("/adventures")}
        actionGroups={[
          [viewModeAction, ...headerActions],
          artStyleActions,
          ...(readerActions.length > 0 ? [readerActions] : []),
        ]}
      />

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
                <span key={c.id} title={currentEmotions[c.id] ? `${c.name} · ${currentEmotions[c.id]}` : c.name}>
                  <CharacterAvatar name={c.name} accent={c.accent} imageSrc={resolveEmotionPortrait(c, currentEmotions[c.id])} size={22} />
                </span>
              ))}
              <span className="text-[11px] text-muted-foreground">
                {cast.map((c, i) => (
                  <React.Fragment key={c.id}>
                    {i > 0 && ", "}
                    {c.name}
                    {currentEmotions[c.id] && <span className="text-subtle capitalize"> ({currentEmotions[c.id]})</span>}
                  </React.Fragment>
                ))}
              </span>
            </div>
          )}
          {isCompleted && <Badge variant="secondary" className="text-[10px] ml-auto">Completed</Badge>}
        </div>
      )}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-w-0 overflow-y-auto px-4 md:px-8 py-6">
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
            {adventure.content.map((msg, i) => {
              if (viewMode === "novel") {
                const isFirstAi = msg.role === AI && adventure.content.findIndex((m) => m.role === AI) === i;
                return (
                  <NovelMessageItem
                    key={msg.id || i}
                    msg={msg}
                    index={i}
                    cast={cast}
                    illustrating={!!msg.id && illustratingIds.includes(msg.id)}
                    onIllustrate={() => {
                      const prev = adventure.content[i - 1];
                      illustrateMessage(msg, {
                        regenerate: !!msg.images?.length,
                        requestedFocus: prev?.role === YOU && prev.isImageRequest ? prev.txt : undefined,
                        includeFullCast: true,
                      });
                    }}
                    onImageClick={(imgSrc) => setFullscreenImage(imgSrc)}
                    illustrationError={msg.id ? illustrationErrors[msg.id] : undefined}
                    isFirstNarratorTurn={isFirstAi}
                    fontFamily={fontFamily}
                    fontSize={fontSize}
                  />
                );
              }

              return (
                <div key={msg.id || i} className={cn("flex", msg.role === YOU ? "justify-end" : "justify-start")}>
                  {msg.role === YOU ? (
                    <div className="max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-2.5">
                      <MarkdownRenderer msgText={msg.txt || ""} isUser={true} />
                    </div>
                  ) : (
                    <div className="w-full flex flex-col gap-3">
                      {msg.id && illustratingIds.includes(msg.id) ? (
                        <div className="w-full aspect-video rounded-xl bg-muted animate-pulse flex items-center justify-center gap-2 text-xs text-muted-foreground">
                          <FaImage size={12} /> Illustrating the scene...
                        </div>
                      ) : (
                        msg.images?.map((imgSrc, idx) => (
                          <DisplayImage
                            key={idx}
                            srcContext={imgSrc}
                            alt="Scene illustration"
                            onClick={() => setFullscreenImage(imgSrc)}
                            className="w-full rounded-xl shadow-sm cursor-zoom-in hover:opacity-95 transition-opacity"
                          />
                        ))
                      )}
                      <MarkdownRenderer msgText={msg.txt || ""} isUser={false} />
                      {msg.castEmotions && (
                        <div className="flex flex-wrap items-center gap-2">
                          {cast
                            .filter((c) => msg.castEmotions![c.id])
                            .map((c) => (
                              <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/40 pl-0.5 pr-2.5 py-0.5 text-[11px]">
                                <CharacterAvatar name={c.name} accent={c.accent} imageSrc={resolveEmotionPortrait(c, msg.castEmotions![c.id])} size={20} />
                                <span className="font-medium text-foreground">{c.name}</span>
                                <span className="text-subtle capitalize">{msg.castEmotions![c.id]}</span>
                              </span>
                            ))}
                        </div>
                      )}
                      {msg.id && !illustratingIds.includes(msg.id) && (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              // Keep the player's picture request in focus on redraws too.
                              const prev = adventure.content[i - 1];
                              illustrateMessage(msg, {
                                regenerate: !!msg.images?.length,
                                requestedFocus: prev?.role === YOU && prev.isImageRequest ? prev.txt : undefined,
                                includeFullCast: true,
                              });
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                          >
                            {msg.images?.length ? <><FaSyncAlt size={10} /> Redraw scene</> : <><FaImage size={11} /> Illustrate scene</>}
                          </button>
                          {illustrationErrors[msg.id] && <span className="text-xs text-destructive">{illustrationErrors[msg.id]}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
        {emotionPanelEnabled && dockedSprites.length > 0 && (
          <EmotionSpritePanel sprites={dockedSprites} onClose={() => dispatch(setEmotionPanelEnabled(false))} />
        )}
      </div>
      <EmotionPopup trigger={popupTrigger} durationMs={emotionPopupDuration} />

      {isCompleted ? (
        <div className="flex-shrink-0 px-4 md:px-8 py-4 border-t border-border/40 flex items-center justify-center gap-3 text-sm text-muted-foreground">
          This adventure is marked completed.
          <Button onClick={() => dispatch(updateAdventureStatus({ adventureId: adventure.id, status: "active" }))} variant="outline" size="sm">
            <FaRedo size={10} /> Resume
          </Button>
        </div>
      ) : viewMode === "novel" ? (
        <NovelChoicesView
          choices={activeChoices}
          onSelectChoice={(label, choiceId) => handleSend(label, choiceId)}
          inputText={inputText}
          setInputText={setInputText}
          onSend={(text) => handleSend(text)}
          generating={generating}
          imageRequested={imageRequested}
          setImageRequested={setImageRequested}
          disabled={adventure.content.length === 0}
          fontFamily={fontFamily}
        />
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
          {imageRequested && (
            <div className="mx-4 md:mx-8 mt-3 flex items-center gap-2.5 px-3 py-2 bg-primary/10 border border-primary rounded-lg">
              <span className="text-primary flex-shrink-0 flex"><FaImage size={13} /></span>
              <span className="flex-1 text-[12.5px] text-foreground font-medium">
                Picture requested — your next action's scene will be illustrated with the whole cast, focused on what you ask to see.
              </span>
              <Button
                onClick={() => setImageRequested(false)}
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
                aria-label="Cancel picture request"
              >
                <FaTimes size={11} />
              </Button>
            </div>
          )}
          <div className="flex gap-2 px-4 md:px-8 py-3.5">
            <Button
              onClick={() => setImageRequested((v) => !v)}
              disabled={generating || adventure.content.length === 0}
              variant="ghost"
              title="Request a picture with your next action"
              aria-label="Request a picture with your next action"
              aria-pressed={imageRequested}
              className={cn(
                "h-auto flex-shrink-0 self-end aspect-square rounded-lg",
                imageRequested ? "bg-primary/[0.14] text-primary hover:bg-primary/[0.2]" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <FaImage size={15} />
            </Button>
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

      <Dialog open={fullscreenImage !== null} onOpenChange={(open) => !open && setFullscreenImage(null)}>
        <DialogContent size="full">
          <DialogTitle asChild>
            <span className="sr-only">Scene illustration</span>
          </DialogTitle>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 h-auto w-auto p-3 rounded-full text-white/70 hover:bg-black/80 hover:text-white bg-black/50 z-10"
              title="Close"
            >
              <FaTimes size={20} />
            </Button>
          </DialogClose>
          {fullscreenImage && (
            <DisplayImage srcContext={fullscreenImage} alt="Scene illustration" className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdventurePage;
