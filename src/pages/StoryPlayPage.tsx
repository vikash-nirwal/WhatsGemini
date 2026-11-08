import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaBookOpen, FaMagic, FaPlus, FaTrash, FaUser } from "react-icons/fa";
import { usePhoneShell, TAB_BAR_HEIGHT } from "src/hooks/usePhoneShell";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { addAdventure, deleteAdventure } from "src/features/adventureSlice";
import { generateAssistText } from "src/features/aiSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { useModal } from "src/contexts/ModalContext";
import { cn } from "src/utils/cn";
import { DEFAULT_ADVENTURE_CHOICE_COUNT } from "src/utils/constants";
import { StoryCastMember, StoryScript } from "src/types";
import { applyCastRenames, buildScriptDraftPrompt, cleanScript, emptyScript, keepSource, makeBeat, parseScriptDraft } from "src/features/chat/storyScript";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { TextArea, TextInput } from "src/components/molecules/form-controls";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { StoryCastEditor } from "src/components/molecules/StoryCastEditor";
import { STORY_LENGTH_OPTIONS, STORY_LENGTHS, StoryLength } from "src/features/chat/storyLength";
import Header from "src/components/organisms/Header";

// Story play: paste a story and play it as one of its own people (or as
// yourself), with no Character made. The AI narrates and voices everyone
// else, several of them in one reply. Underneath it's an adventure with
// `storyPlay` set and the story as its script, so beats, branching, memory
// and pictures all work as in adventures; it just lives in its own section.

const TILE_COLORS = ["#4A3B5C", "#2F5F55", "#8A4A22", "#2B3A55", "#A0396B", "#5B3F9E"];
const tileColor = (id: number) => TILE_COLORS[Math.abs(id) % TILE_COLORS.length];
const partOf = (script: StoryScript | undefined) => script?.cast?.find((c) => c.playedBy === "user");

export const StoryPlayGalleryPage = () => {
  const shell = usePhoneShell();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { showConfirm } = useModal();
  const all = useAppSelector((state) => state.adventure.adventures);
  const loading = useAppSelector((state) => state.adventure.loading);
  const stories = useMemo(
    () => all.filter((a) => a.storyPlay).sort((a, b) => (b.content[b.content.length - 1]?.timestamp || b.timestamp) - (a.content[a.content.length - 1]?.timestamp || a.timestamp)),
    [all]
  );

  const handleDelete = async (id: number, title: string) => {
    if (await showConfirm("Delete story", `Delete "${title}"? This can't be undone.`)) dispatch(deleteAdventure(id));
  };

  return (
    <div className="w-full h-dvh flex flex-col">
      <Header title="Stories" subtitle="Paste a story and play a part in it." />
      <div className="flex-1 overflow-auto p-4 md:p-8" style={shell ? { paddingBottom: TAB_BAR_HEIGHT + 16 } : undefined}>
        <div className="w-full max-w-[1180px] mx-auto">
          <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
            <div>
              <h2 className="text-[26px] font-bold tracking-tight text-foreground">Your stories</h2>
              <p className="text-sm text-muted-foreground mt-1">{loading ? "Loading..." : `${stories.length} stor${stories.length === 1 ? "y" : "ies"}`}</p>
            </div>
            <Button onClick={() => navigate("/stories/new")} aria-label="New story" className="flex-shrink-0">
              <FaPlus size={12} /> <span className="hidden sm:inline">New story</span>
            </Button>
          </div>

          {!loading && stories.length === 0 ? (
            <Card className="p-6 text-center flex flex-col items-center gap-3">
              <p className="text-muted-foreground">No stories yet.</p>
              <p className="text-sm text-muted-foreground">Paste a story you love or wrote, pick who you are in it, and the AI plays everyone else.</p>
              <Button onClick={() => navigate("/stories/new")} className="h-auto px-4 py-2.5 font-semibold text-sm">
                Play a story
              </Button>
            </Card>
          ) : (
            <ul aria-label="Stories" className="flex flex-col gap-2.5">
              {stories.map((story) => {
                const part = partOf(story.storyScript);
                const beats = story.storyScript?.beats.length || 0;
                const at = Math.min(story.storyScript?.currentBeat || 0, beats);
                return (
                  <li key={story.id} className="flex items-center gap-3 rounded-card bg-card p-2.5 ring-1 ring-inset ring-border">
                    <button type="button" onClick={() => navigate(`/adventures/${story.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span aria-hidden className="grid h-16 w-16 flex-none place-items-center rounded-xl text-white/90" style={{ background: tileColor(story.id) }}>
                        <FaBookOpen size={22} />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-bold text-foreground">{story.title}</span>
                        <span className="truncate text-[12.5px] text-muted-foreground">{story.storyScript?.premise || "No premise."}</span>
                        <span className="truncate text-[12px] text-subtle">
                          {[part ? `You play ${part.name}` : "You play yourself", beats > 0 ? (at >= beats ? "All beats done" : `Beat ${at + 1} of ${beats}`) : undefined].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                    <Button onClick={() => handleDelete(story.id, story.title)} variant="ghost" size="icon" className="h-9 w-9 flex-none hover:text-destructive" aria-label={`Delete ${story.title}`}>
                      <FaTrash size={13} />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const MODE_OPTIONS = [
  { value: "loose", label: "Loose" },
  { value: "strict", label: "Strict" },
];

export const NewStoryPlayPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const persona = useAppSelector(selectActivePersona);
  const [pasted, setPasted] = useState("");
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<StoryScript | null>(null);
  // The cast as the story text names them, for carrying renames through.
  const [castBefore, setCastBefore] = useState<StoryCastMember[] | undefined>(undefined);
  const [length, setLength] = useState<StoryLength>("medium");
  const [reading, setReading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<StoryScript>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const cast = draft?.cast || [];
  const part = cast.find((c) => c.playedBy === "user");
  const choosePart = (id: string | undefined) => update({ cast: cast.map((c) => ({ ...c, playedBy: c.id === id ? "user" : c.playedBy === "user" ? undefined : c.playedBy })) });

  const handleRead = async () => {
    if (!pasted.trim()) return;
    setReading(true);
    setError(null);
    try {
      const reply = await dispatch(generateAssistText({ instruction: buildScriptDraftPrompt(pasted.trim()), purpose: "story-play" })).unwrap();
      const parsed = parseScriptDraft(reply);
      if (!parsed) throw new Error("The AI's answer couldn't be read as a story. Try again.");
      // The main character is the likeliest part to want; it's one tap to change.
      const parsedCast = (parsed.cast || []).map((c, i) => (i === 0 ? { ...c, playedBy: "user" as const } : c));
      // The story's text goes with the script (#240), so it can be read
      // again later from the story's script editor.
      setDraft({ ...emptyScript(), mode: "loose", ...parsed, cast: parsedCast, currentBeat: 0, source: keepSource(pasted) });
      setCastBefore(parsed.cast);
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message || "Couldn't read the story.");
    } finally {
      setReading(false);
    }
  };

  const handleStart = async () => {
    if (!draft) return;
    const script = cleanScript(applyCastRenames(draft, castBefore));
    if (!script) return;
    setStarting(true);
    try {
      const fallback = script.premise.split(/[.!?]/)[0].slice(0, 60).trim() || "A story";
      const created = await dispatch(
        addAdventure({ title: title.trim() || fallback, storyPlay: true, storyScript: script, rules: { choiceCount: DEFAULT_ADVENTURE_CHOICE_COUNT, replyLengthLimit: STORY_LENGTHS[length].chars } })
      ).unwrap();
      navigate(`/adventures/${created.id}`);
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message || "Couldn't start the story.");
      setStarting(false);
    }
  };

  return (
    <div className="w-full h-dvh flex flex-col">
      <Header title="New story" subtitle="Paste it, pick your part, play" onBack={() => navigate("/stories")} />
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 text-sm">
          <section className="flex flex-col gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] text-muted-foreground">The story</span>
              <TextArea
                aria-label="Story to play"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste a story, a chapter or a script, as long as you like. The AI finds its people and splits it into beats, more of them for a longer story."
                className="min-h-[200px]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant={draft ? "outline" : "default"} onClick={handleRead} disabled={reading || !pasted.trim()}>
                <FaMagic size={11} /> {reading ? "Reading..." : draft ? "Read it again" : "Read the story"}
              </Button>
              {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
            </div>
          </section>

          {draft && (
            <>
              <section className="flex flex-col gap-2">
                <span className="text-[11.5px] text-muted-foreground">Who do you play?</span>
                <div role="radiogroup" aria-label="Who you play" className="flex flex-wrap gap-2">
                  {cast.filter((c) => c.name.trim()).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={part?.id === c.id}
                      onClick={() => choosePart(c.id)}
                      className={cn("rounded-full border px-3 py-1.5 text-[13px] font-medium", part?.id === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary")}
                    >
                      {c.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!part}
                    onClick={() => choosePart(undefined)}
                    className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium", !part ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary")}
                  >
                    <FaUser size={10} /> Myself{persona?.name ? ` (${persona.name})` : ""}
                  </button>
                </div>
                <span className="text-xs text-subtle">
                  {part ? `You speak and act as ${part.name.trim() || "them"}; the AI plays everyone else, several at once when the scene needs it.` : "You join the story as yourself, and the AI plays all of its people."}
                </span>
              </section>

              <section className="flex flex-col gap-2">
                <span className="text-[11.5px] text-muted-foreground">The story's people</span>
                <span className="text-xs text-subtle">Rename anyone and the whole story follows.</span>
                <StoryCastEditor cast={cast} onChange={(next) => update({ cast: next })} />
              </section>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] text-muted-foreground">Title</span>
                <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name this story" />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] text-muted-foreground">Premise</span>
                <TextArea value={draft.premise} onChange={(e) => update({ premise: e.target.value })} className="min-h-[70px]" />
              </label>

              <details className="rounded-lg border border-border px-3 py-2">
                <summary className="cursor-pointer font-medium text-foreground">{draft.beats.length} beats</summary>
                <ol className="mt-3 flex flex-col gap-2">
                  {draft.beats.map((beat, i) => (
                    <li key={beat.id} className="flex items-start gap-2">
                      <span className="mt-2 w-6 text-right text-xs tabular-nums text-subtle">{i + 1}.</span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <TextInput aria-label={`Beat ${i + 1}`} value={beat.text} onChange={(e) => update({ beats: draft.beats.map((b, j) => (j === i ? { ...b, text: e.target.value } : b)) })} />
                        <TextArea
                          aria-label={`What happens in beat ${i + 1}`}
                          value={beat.details || ""}
                          onChange={(e) => update({ beats: draft.beats.map((b, j) => (j === i ? { ...b, details: e.target.value } : b)) })}
                          placeholder="What happens in it in the story"
                          className="min-h-[44px] text-[13px]"
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => update({ beats: draft.beats.filter((_, j) => j !== i) })} aria-label={`Remove beat ${i + 1}`}>
                        <FaTrash size={11} />
                      </Button>
                    </li>
                  ))}
                </ol>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => update({ beats: [...draft.beats, makeBeat("")] })}>
                  <FaPlus size={10} /> Add beat
                </Button>
              </details>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11.5px] text-muted-foreground">How closely to follow it</span>
                <SegmentedControl value={draft.mode} onChange={(v) => update({ mode: v as StoryScript["mode"] })} options={MODE_OPTIONS} />
                <span className="text-xs text-subtle">{draft.mode === "strict" ? "The story goes as written; going off it is steered back." : "The story heads for each beat, with room for your own choices on the way."}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11.5px] text-muted-foreground">Reply length</span>
                <SegmentedControl aria-label="Reply length" value={length} onChange={(v) => setLength(v as StoryLength)} options={STORY_LENGTH_OPTIONS} />
                <span className="text-xs text-subtle">{STORY_LENGTHS[length].hint}. You can change it any time from the story's menu.</span>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => navigate("/stories")}>Cancel</Button>
                <Button type="button" onClick={handleStart} disabled={starting}>
                  <FaBookOpen size={12} /> {starting ? "Starting..." : "Start playing"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
