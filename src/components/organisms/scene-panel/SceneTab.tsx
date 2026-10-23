import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FaTimes, FaPlus } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { updateChatAuthorNote, updateChatWorldTags, updateChatScenario, updateChatBoundaries, updateChatOptions } from "src/features/chatSlice";
import { Select, TagInput } from "src/components/molecules/form-controls";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { Character, Intensity } from "src/types";
import { Textarea } from "src/components/atoms/textarea";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import PanelGroup from "./PanelGroup";
import { cn } from "src/utils/cn";
import { AUTHOR_NOTE_PRESETS, hasPreset, togglePreset } from "src/features/ai/utils/narrativeTools";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { generateBackdropImage } from "src/features/aiSlice";
import { describeSetting } from "src/features/chat/backdrop";
import { WorldMapView } from "src/components/molecules/WorldMapView";
import { METER_PRESETS } from "src/features/chat/sceneState";
import { pinForLocation } from "src/features/world/worldMap";
import { readPhoto } from "src/features/chat/photoAttachments";
import { dataUrlToBlob, savePortraitBlob } from "src/features/ai/utils/portraitUtils";
import { ScenePanelTabProps } from "./types";
import { RelationshipNote } from "./RelationshipNote";

// The Scene tab: the author's note, the room's scenario and relationships,
// the scene tracker, the story script, the backdrop, the attached world and
// its map, setting tags and boundaries.
const SceneTab: React.FC<ScenePanelTabProps> = ({ chatId, character, isRoom, chatScenario, authorNote, worldTags, hardLimits, intensity, isNsfwChat, onEditStory, hasStoryScript }) => {
  const dispatch = useAppDispatch();

  // Author's note - local live value, resynced when the chat/prop changes, saved on blur.
  const [noteValue, setNoteValue] = useState(authorNote || "");
  useEffect(() => {
    setNoteValue(authorNote || "");
  }, [authorNote, chatId]);

  const handleNoteBlur = () => {
    if (noteValue !== (authorNote || "")) {
      dispatch(updateChatAuthorNote({ chatId, authorNote: noteValue || undefined }));
    }
  };

  // Room scenario - only shown/editable for a room; a 1:1 chat's scenario
  // lives on the character itself (Character Editor), not here.
  const [scenarioValue, setScenarioValue] = useState(chatScenario || "");
  useEffect(() => {
    setScenarioValue(chatScenario || "");
  }, [chatScenario, chatId]);

  const handleScenarioBlur = () => {
    if (scenarioValue !== (chatScenario || "")) {
      dispatch(updateChatScenario({ chatId, scenario: scenarioValue || undefined }));
    }
  };

  // Memory - a room reads/writes its own Chat.memory; a 1:1 chat reuses
  // Character.memory, the same data the Character Editor manages.
  // Pinned facts are a separate list: always injected, never evicted by the
  // MAX_MEMORY_ENTRIES cap that trims the least recently mentioned ones.
  // Read straight from the store, so new chat fields don't have to be
  // threaded through ChatWindow.
  const chat = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId));

  const worlds = useAppSelector((state) => state.world.worlds);
  const chatWorld = chat?.worldId != null ? worlds.find((w) => w.id === chat.worldId) : undefined;

  // Room members (#24), for the relationships editor.
  const allCharacters = useAppSelector((state) => state.character.characters);

  const members = (chat?.characterIds || []).map((id) => allCharacters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));

  const relationships = chat?.roomRelationships || [];
  const setRelationships = (next: typeof relationships) => dispatch(updateChatOptions({ chatId, patch: { roomRelationships: next.length > 0 ? next : undefined } }));

  // Backdrop (#13): generated from where the story is set, or uploaded.
  const backdropInputRef = useRef<HTMLInputElement>(null);
  const [backdropBusy, setBackdropBusy] = useState(false);
  const [backdropError, setBackdropError] = useState<string | null>(null);
  const handleGenerateBackdrop = async () => {
    const world = chat?.worldId != null ? worlds.find((w) => w.id === chat.worldId) : undefined;
    const setting = describeSetting({
      location: chat?.sceneState?.location,
      scenario: isRoom ? chatScenario : character?.scenario,
      worldName: world?.name,
      worldPremise: world?.premise,
      tags: worldTags,
    });
    if (!setting) {
      setBackdropError("Add a scenario, a world or setting tags first, so there's a place to picture.");
      return;
    }
    setBackdropBusy(true);
    setBackdropError(null);
    try {
      const image = await dispatch(generateBackdropImage({ setting, artStyle: character?.artStyle })).unwrap();
      const saved = await savePortraitBlob(await dataUrlToBlob(image), "chat_bg").catch(() => image);
      await dispatch(updateChatOptions({ chatId, patch: { backdrop: saved } }));
    } catch (err: any) {
      setBackdropError(typeof err === "string" ? err : err?.message || "Couldn't make a backdrop.");
    } finally {
      setBackdropBusy(false);
    }
  };

  // World tags - purely user-authored, no AI extraction.
  const tags = worldTags || [];
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingTag) tagInputRef.current?.focus();
  }, [addingTag]);

  const commitTag = () => {
    const trimmed = tagDraft.trim();
    if (trimmed) {
      dispatch(updateChatWorldTags({ chatId, worldTags: [...tags, trimmed] }));
    }
    setTagDraft("");
    setAddingTag(false);
  };

  const handleRemoveTag = (index: number) => {
    dispatch(updateChatWorldTags({ chatId, worldTags: tags.filter((_, i) => i !== index) }));
  };

  // World tags pick up the character's own accent color, like their avatar
  // gradient and gallery card glow - falls back to the brand primary when
  // there's no character (shouldn't normally happen, Scene panel is always
  // opened from within a character's chat).
  const tagColor = character?.accent?.[0];
  const tagBg = tagColor ? `${tagColor}26` : "rgb(var(--primary) / 0.14)";
  const tagFg = tagColor || "rgb(var(--primary))";

  return (
          <div role="tabpanel" id="scene-tabpanel-scene" aria-labelledby="scene-tab-scene" className="flex flex-col gap-[22px]">
          <PanelGroup id="scene" title="The scene now">
          {/* Author's Note */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Author's Note</span>
              <span className="text-[11px] text-subtle">every reply</span>
            </div>
            <Textarea
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="Keep it slow and sensory…"
              className="min-h-[72px] font-serif text-[13.5px] leading-[1.55] bg-background rounded-lg"
            />
            {/* One-tap presets (#17): each adds or removes its own line. */}
            <div className="flex flex-wrap gap-1.5 mt-2" role="group" aria-label="Author's note presets">
              {AUTHOR_NOTE_PRESETS.map((preset) => {
                const on = hasPreset(noteValue, preset);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={on}
                    title={preset.text}
                    onClick={() => {
                      const next = togglePreset(noteValue, preset);
                      setNoteValue(next);
                      dispatch(updateChatAuthorNote({ chatId, authorNote: next || undefined }));
                    }}
                    className={cn(
                      "min-h-6 px-2.5 py-1 rounded-full border text-[11.5px] transition",
                      on ? "border-primary bg-primary/15 text-primary font-medium" : "border-border/50 text-subtle hover:border-primary hover:text-primary"
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scenario - room-only; a 1:1 chat's scenario lives on the character itself */}
          {isRoom && (
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Scenario</span>
                <span className="text-[11px] text-subtle">shared by everyone here</span>
              </div>
              <Textarea
                value={scenarioValue}
                onChange={(e) => setScenarioValue(e.target.value)}
                onBlur={handleScenarioBlur}
                placeholder="The current setting/plot for this group…"
                className="min-h-[72px] font-serif text-[13.5px] leading-[1.55] bg-background rounded-lg"
              />
            </div>
          )}

          {/* Relationships between members (#24): each one only sees their own feelings */}
          {isRoom && members.length > 1 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Relationships</span>
                <span className="text-[11px] text-subtle">how they feel about each other</span>
              </div>
              {relationships.map((r, i) => (
                <div key={i} role="group" aria-label={`Relationship ${i + 1}`} className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Select aria-label="Who" value={String(r.fromId)} onChange={(e) => setRelationships(relationships.map((x, j) => (j === i ? { ...x, fromId: Number(e.target.value) } : x)))}>
                        {members.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                      </Select>
                    </div>
                    <span className="text-[11px] text-subtle">about</span>
                    <div className="flex-1">
                      <Select aria-label="About whom" value={String(r.toId)} onChange={(e) => setRelationships(relationships.map((x, j) => (j === i ? { ...x, toId: Number(e.target.value) } : x)))}>
                        {members.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                      </Select>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setRelationships(relationships.filter((_, j) => j !== i))} aria-label="Remove this relationship">
                      <FaTimes size={11} />
                    </Button>
                  </div>
                  <RelationshipNote
                    value={r.note}
                    onSave={(note) => setRelationships(relationships.map((x, j) => (j === i ? { ...x, note } : x)))}
                  />
                </div>
              ))}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => setRelationships([...relationships, { fromId: members[0].id, toId: members[1].id, note: "" }])}>
                  <FaPlus size={10} /> Add a relationship
                </Button>
              </div>
            </div>
          )}

          {/* Scene tracker (#9): a HUD with location, time, outfit and two meters */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">Track the scene</div>
              <div className="text-[11px] text-subtle">Each reply keeps where you are, the time, the outfit, affection and trust up to date, shown under the header. Adds a little to every reply.</div>
            </div>
            <ToggleSwitch
              checked={Boolean(chat?.sceneTracker)}
              onChange={(val) => dispatch(updateChatOptions({ chatId, patch: { sceneTracker: val || undefined } }))}
              label={<span className="sr-only">Track the scene</span>}
            />
          </div>
          {chat?.sceneTracker && (
            <div className="grid grid-cols-2 gap-2">
              {(["location", "time", "outfit"] as const).map((field) => (
                <label key={field} className={cn("flex flex-col gap-1 text-[11px] text-subtle capitalize", field === "location" && "col-span-2")}>
                  {field}
                  <Input
                    value={chat.sceneState?.[field] || ""}
                    onChange={(e) => dispatch(updateChatOptions({ chatId, patch: { sceneState: { ...chat.sceneState, [field]: e.target.value || undefined } } }))}
                    className="h-8 text-[12.5px] px-2.5 rounded-lg"
                  />
                </label>
              ))}
              {/* The chat's own meters (#71), or affection and trust */}
              <div className="col-span-2 flex flex-col gap-1">
                <span className="text-[11px] text-subtle">Meters (up to 4; empty = affection and trust)</span>
                <TagInput
                  value={chat.meters || []}
                  onChange={(next) => dispatch(updateChatOptions({ chatId, patch: { meters: next.length > 0 ? next.slice(0, 4).map((m) => m.trim().toLowerCase()).filter(Boolean) : undefined } }))}
                  placeholder={`e.g. ${METER_PRESETS.slice(0, 3).join(", ")}`}
                />
              </div>
              {(chat.meters || []).map((name) => (
                <label key={name} className="flex flex-col gap-1 text-[11px] text-subtle capitalize">
                  {name} (0-100)
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={chat.sceneState?.meters?.[name] ?? ""}
                    onChange={(e) => {
                      const n = e.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(e.target.value)));
                      const meters = { ...chat.sceneState?.meters };
                      if (n == null) delete meters[name];
                      else meters[name] = n;
                      dispatch(updateChatOptions({ chatId, patch: { sceneState: { ...chat.sceneState, meters } } }));
                    }}
                    className="h-8 text-[12.5px] px-2.5 rounded-lg"
                  />
                </label>
              ))}
              {!(chat.meters && chat.meters.length > 0) && (["affection", "trust"] as const).map((field) => (
                <label key={field} className="flex flex-col gap-1 text-[11px] text-subtle capitalize">
                  {field} (0-100)
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={chat.sceneState?.[field] ?? ""}
                    onChange={(e) => {
                      const n = e.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(e.target.value)));
                      dispatch(updateChatOptions({ chatId, patch: { sceneState: { ...chat.sceneState, [field]: n } } }));
                    }}
                    className="h-8 text-[12.5px] px-2.5 rounded-lg"
                  />
                </label>
              ))}
              {/* Group chats (#69): who's in the scene. Away members don't take turns. */}
              {isRoom && members.length > 1 && (
                <div role="group" aria-label="Who's here" className="col-span-2 flex flex-col gap-1.5">
                  <span className="text-[11px] text-subtle">Who's here</span>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map((m) => {
                      const here = !chat.sceneState?.present || chat.sceneState.present.some((n) => n.toLowerCase() === m.name.toLowerCase() || n.toLowerCase() === m.name.toLowerCase().split(" ")[0]);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={here}
                          onClick={() => {
                            const current = chat.sceneState?.present ?? members.map((x) => x.name);
                            const next = here ? current.filter((n) => n.toLowerCase() !== m.name.toLowerCase() && n.toLowerCase() !== m.name.toLowerCase().split(" ")[0]) : [...current, m.name];
                            dispatch(updateChatOptions({ chatId, patch: { sceneState: { ...chat.sceneState, present: next.length === members.length ? undefined : next } } }));
                          }}
                          className={cn(
                            "h-7 px-2.5 rounded-full border text-[12px]",
                            here ? "border-primary/60 bg-primary/[0.14] text-foreground" : "border-input text-muted-foreground line-through"
                          )}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
          </PanelGroup>

          <PanelGroup id="script" title="Story script">
          {/* Story script (#57) */}
          {onEditStory && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">Story script</div>
                <div className="text-[11px] text-subtle">{hasStoryScript ? "This chat follows your story, beat by beat." : "Give the AI a story, beats and directions to stay inside."}</div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onEditStory}>
                {hasStoryScript ? "Edit" : "Write"}
              </Button>
            </div>
          )}
          </PanelGroup>

          <PanelGroup id="setting" title="Setting">
          {/* Backdrop (#13): a picture behind the bubbles */}
          <div>
            <div data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold mb-2">Backdrop</div>
            <div className="flex items-start gap-3">
              <div className="h-14 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {chat?.backdrop ? <DisplayImage srcContext={chat.backdrop} alt="This chat's backdrop" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={handleGenerateBackdrop} disabled={backdropBusy}>
                  {backdropBusy ? "Making..." : chat?.backdrop ? "Make another" : "Generate"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => backdropInputRef.current?.click()} disabled={backdropBusy}>
                  Upload
                </Button>
                {chat?.backdrop && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => dispatch(updateChatOptions({ chatId, patch: { backdrop: undefined } }))}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <input
              ref={backdropInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              data-testid="backdrop-input"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  dispatch(updateChatOptions({ chatId, patch: { backdrop: await readPhoto(file) } }));
                } catch (err: any) {
                  setBackdropError(err?.message || "Couldn't read that picture.");
                }
              }}
            />
            {backdropError && <p role="alert" className="mt-1.5 text-[11.5px] text-destructive">{backdropError}</p>}
          </div>

          {/* An attached World (#28): its premise and lore apply to this chat */}
          <div>
            <div data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold mb-2">World</div>
            {worlds.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <Select
                  aria-label="World for this chat"
                  value={chat?.worldId != null ? String(chat.worldId) : ""}
                  onChange={(e) => dispatch(updateChatOptions({ chatId, patch: { worldId: e.target.value ? Number(e.target.value) : undefined } }))}
                >
                  <option value="">No world</option>
                  {worlds.map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name}
                    </option>
                  ))}
                </Select>
                <span className="text-[11px] text-subtle">The world's premise, details and lorebook apply to every reply here, like in an adventure.</span>
                {/* The world's map (#66), with where the scene is */}
                {chatWorld?.map && (
                  <WorldMapView
                    map={chatWorld.map}
                    hereId={pinForLocation(chat?.sceneState?.location, chatWorld.map.pins)?.id}
                    className="mt-2"
                  />
                )}
              </div>
            ) : (
              <p className="text-[12.5px] text-subtle">
                No worlds yet. <Link to="/worlds/new" className="text-primary hover:underline">Create one</Link> to give this chat a shared setting and lore.
              </p>
            )}
          </div>

          {/* World tags */}
          <div>
            <div data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold mb-2">Setting tags</div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
                  style={{ background: tagBg, color: tagFg }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(idx)}
                    className="hover:text-destructive"
                    title="Remove tag"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <FaTimes size={9} />
                  </button>
                </span>
              ))}
              {addingTag ? (
                <Input
                  ref={tagInputRef}
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onBlur={commitTag}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitTag();
                    } else if (e.key === "Escape") {
                      setTagDraft("");
                      setAddingTag(false);
                    }
                  }}
                  className="h-7 w-28 text-xs px-2.5 py-0 rounded-full"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingTag(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border/40 text-subtle text-xs hover:border-primary hover:text-primary transition"
                >
                  <FaPlus size={9} /> Add
                </button>
              )}
            </div>
          </div>
          </PanelGroup>

          <PanelGroup id="boundaries" title="Boundaries">
          {/* Boundaries */}
          <div>
            <p className="text-[11.5px] text-subtle mb-2">Hard limits are sent right before every reply, so the story never goes there.</p>
            <TagInput
              value={hardLimits || []}
              onChange={(limits) => dispatch(updateChatBoundaries({ chatId, hardLimits: limits, intensity }))}
              placeholder="Add a hard limit…"
            />
            {isNsfwChat && (
              <div className="mt-3 flex flex-col gap-1.5">
                <span className="text-[11.5px] text-subtle">Intensity of intimate scenes</span>
                <SegmentedControl
                  value={intensity || ""}
                  onChange={(v) => dispatch(updateChatBoundaries({ chatId, hardLimits, intensity: (v || undefined) as Intensity | undefined }))}
                  options={[
                    { value: "", label: "Default" },
                    { value: "fade", label: "Fade out" },
                    { value: "suggestive", label: "Suggestive" },
                    { value: "explicit", label: "Explicit" },
                  ]}
                />
              </div>
            )}
          </div>
          </PanelGroup>

          </div>
  );
};

export default SceneTab;
