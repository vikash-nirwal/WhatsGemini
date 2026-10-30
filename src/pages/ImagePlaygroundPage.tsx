import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaDownload, FaMagic, FaRedo, FaStop } from "react-icons/fa";
import Header from "src/components/organisms/Header";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { FieldLabel, Select, TextInput } from "src/components/molecules/form-controls";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { useWorldCharacters } from "src/hooks/useWorld";
import { generatePlaygroundImage, PlaygroundPerson } from "src/features/aiSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { outputAdded, runningTask, runTask } from "src/features/tasks/tasksSlice";
import { avatarOf } from "src/features/character/profileChanges";
import { lockedLookFor } from "src/features/ai/utils/appearanceLock";
import { IMAGE_PROVIDER_META } from "src/features/ai/providers/registry";
import { FAL_IMAGE_MODEL_OPTIONS } from "src/features/ai/providers/falImageAdapter";
import { customFalModels } from "src/features/ai/providers/falCatalog";
import { ART_STYLES, DEFAULT_ART_STYLE } from "src/utils/constants";
import { ArtStyle } from "src/types";
import { cn } from "src/utils/cn";
import { allAdults } from "src/features/character/contentRating";
import { ImagePresetPicker } from "src/components/molecules/ImagePresetPicker";
import { ImageContentTest } from "src/components/organisms/ImageContentTest";

// The image playground (#238): try the image setup with any characters'
// reference photos - a prompt as written or written like a chat picture,
// their locked looks, an aspect ratio, another model - and see exactly
// what was sent. Nothing here touches a chat, a character or an album:
// pictures live on this page until you leave it, or download them. Presets
// save the setup, and the content test finds what the model will draw
// (2026-10-30).

const RATIOS = ["1:1", "3:4", "9:16", "4:3", "16:9"];
const YOU_KEY = "you";

interface Result {
  id: string;
  images: string[];
  prompt: string;
  asked: string;
  people: string[];
  model: string;
  ms: number;
  warning?: string;
}

// A picture under way, to stop it from this page even after you left and
// came back (the request outlives the page; see tasksSlice).
let stopRunning: (() => void) | null = null;
const PLAYGROUND = "playground";

const ImagePlaygroundPage = () => {
  const dispatch = useAppDispatch();
  const [params] = useSearchParams();
  const characters = useWorldCharacters();
  const persona = useAppSelector(selectActivePersona);
  const settings = useAppSelector((state) => state.settings);
  const personaPhotos = useMemo(() => [...(persona?.avatar ? [persona.avatar] : []), ...(persona?.appearanceImages || [])], [persona]);

  // Who's in the picture, and which of their photos go as references.
  // "Try pictures" on a character opens with them picked, once they've loaded.
  const [picked, setPicked] = useState<string[]>([]);
  const preset = params.get("character");
  const presetDone = useRef(false);
  useEffect(() => {
    if (presetDone.current || !preset || !characters.some((c) => String(c.id) === preset)) return;
    presetDone.current = true;
    setPicked((list) => (list.includes(preset) ? list : [...list, preset]));
  }, [preset, characters]);
  const [off, setOff] = useState<Record<string, string[]>>({}); // photos left out, per person
  const photosOf = (key: string) => (key === YOU_KEY ? personaPhotos : characters.find((c) => String(c.id) === key)?.appearanceImages || []);
  const nameOf = (key: string) => (key === YOU_KEY ? persona?.name?.trim() || "You" : characters.find((c) => String(c.id) === key)?.name || "?");

  const [prompt, setPrompt] = useState("");
  const [writeWithAI, setWriteWithAI] = useState(true);
  const [addLocks, setAddLocks] = useState(true);
  const [ratio, setRatio] = useState("3:4");
  const firstStyle = characters.find((c) => String(c.id) === picked[0])?.artStyle;
  const [style, setStyle] = useState<ArtStyle | "">("");
  const [model, setModel] = useState("");
  // A task (tasksSlice): a picture goes on being made if you leave, and it
  // and the ones before it are here when you come back (until the app closes).
  const busy = useAppSelector((state) => Boolean(runningTask(state, PLAYGROUND, PLAYGROUND)));
  const results = useAppSelector((state) => state.tasks.outputs[PLAYGROUND]) as Result[] | undefined ?? [];
  const [error, setError] = useState<string | null>(null);

  const provider = IMAGE_PROVIDER_META.find((p) => p.id === settings.imageProvider)?.label || settings.imageProvider;
  const modelChoices = settings.imageProvider === "fal" ? [...FAL_IMAGE_MODEL_OPTIONS, ...Object.entries(customFalModels()).map(([value, m]) => ({ value, label: m.label }))] : [];

  const toggle = (key: string) => setPicked((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  const togglePhoto = (key: string, photo: string) =>
    setOff((o) => ({ ...o, [key]: (o[key] || []).includes(photo) ? o[key].filter((p) => p !== photo) : [...(o[key] || []), photo] }));

  const generate = async (text = prompt) => {
    if (!text.trim() || busy) return;
    setError(null);
    const people: PlaygroundPerson[] = picked.map((key) => {
      const c = characters.find((x) => String(x.id) === key);
      return { name: nameOf(key), images: photosOf(key).filter((p) => !(off[key] || []).includes(p)), ...(c ? { visualTags: lockedLookFor(c) } : {}) };
    });
    // Only when every picked person is an 18+ character can fal's checker
    // be off under "Off for 18+ characters"; your persona never counts as one.
    const adults = allAdults(picked.map((key) => characters.find((x) => String(x.id) === key)));
    const ask = { prompt: text, people, adults, aspectRatio: ratio, artStyle: (style || firstStyle || DEFAULT_ART_STYLE) as ArtStyle, writeWithAI, addLocks, model: model.trim() || undefined };
    try {
      const r = await dispatch(runTask({
        kind: PLAYGROUND,
        key: PLAYGROUND,
        label: "Making a picture",
        path: "/images",
        done: (made: { images: string[] }) => (made.images.length ? { title: "Your picture is ready" } : undefined),
        failed: "The picture wasn't made.",
      }, async () => {
        const request = dispatch(generatePlaygroundImage(ask));
        stopRunning = () => request.abort();
        try {
          const made = await request.unwrap();
          if (made.images.length) dispatch(outputAdded({ key: PLAYGROUND, first: true, item: { id: `r${Date.now()}`, images: made.images, prompt: made.prompt, asked: text, people: people.map((p) => `${p.name} (${p.images.length})`), model: made.model, ms: made.ms, warning: made.warning } as Result }));
          return made;
        } finally {
          stopRunning = null;
        }
      }));
      if (!r.images.length) setError(r.warning || "No picture came back. Check your image provider in Settings.");
    } catch (err) {
      setError(typeof err === "string" ? err : err instanceof Error ? err.message : "Couldn't make the picture.");
    }
  };

  return (
    <div className="flex h-dvh w-full flex-col">
      <Header title="Image playground" subtitle="Try pictures without touching your chats" />
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="mx-auto grid w-full max-w-[1100px] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
          {/* The setup being tried, and presets of it (2026-10-30). */}
          <Card className="flex flex-col gap-3 p-5" aria-label="Setup">
            <p className="text-[13px] text-muted-foreground">
              Using {provider}{settings.imageModel ? ` · ${settings.imageModel}` : ""}. <Link to="/settings/image" className="font-semibold text-primary-text hover:underline">Change in Settings</Link>
            </p>
            <ImagePresetPicker tryModel={model} />
          </Card>
          <Card className="flex flex-col gap-4 p-5">

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Who's in it</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Who's in it">
                {[...(personaPhotos.length || persona ? [{ key: YOU_KEY, name: nameOf(YOU_KEY), avatar: persona?.avatar, accent: undefined }] : []), ...characters.map((c) => ({ key: String(c.id), name: c.name, avatar: avatarOf(c), accent: c.accent }))].map((p) => (
                  <button key={p.key} type="button" aria-pressed={picked.includes(p.key)} onClick={() => toggle(p.key)} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]", picked.includes(p.key) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                    <CharacterAvatar name={p.name} accent={p.accent} imageSrc={p.avatar} size={22} /> {p.name}
                  </button>
                ))}
              </div>
            </div>

            {picked.map((key) => {
              const photos = photosOf(key);
              return (
                <div key={key} role="group" aria-label={`${nameOf(key)}'s reference photos`}>
                  <p className="mb-1.5 text-[12.5px] font-semibold text-subtle">{nameOf(key)}: {photos.length ? `${photos.length - (off[key] || []).filter((p) => photos.includes(p)).length} of ${photos.length} photos as references` : "no reference photos, so only the prompt says how they look"}</p>
                  {photos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {photos.map((photo, i) => {
                        const used = !(off[key] || []).includes(photo);
                        return (
                          <button key={`${key}-${i}`} type="button" aria-pressed={used} aria-label={`${nameOf(key)}'s photo ${i + 1}`} onClick={() => togglePhoto(key, photo)} className={cn("h-16 w-16 overflow-hidden rounded-lg ring-2", used ? "ring-primary" : "opacity-40 ring-transparent")}>
                            <DisplayImage srcContext={photo} alt="" className="h-full w-full object-cover" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div>
              <FieldLabel htmlFor="playground-prompt" hint="What's in the picture. Names are fine: they're never sent to the image model.">Prompt</FieldLabel>
              <textarea id="playground-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="e.g. a selfie at the harbour at sunset, wind in her hair" className="w-full rounded-lg bg-raised px-3 py-2 text-[14px] text-foreground ring-1 ring-inset ring-border" />
            </div>
            <ToggleSwitch checked={writeWithAI} onChange={setWriteWithAI} label="Write the prompt for the model with AI, as chats do" />
            <ToggleSwitch checked={addLocks} onChange={setAddLocks} label="Add their locked look" />
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
                Shape
                <Select aria-label="Shape" value={ratio} onChange={(e) => setRatio(e.target.value)}>
                  {RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
                Art style
                <Select aria-label="Art style" value={style} onChange={(e) => setStyle(e.target.value as ArtStyle | "")}>
                  <option value="">{`Theirs (${ART_STYLES.find((s) => s.value === (firstStyle || DEFAULT_ART_STYLE))?.label})`}</option>
                  {ART_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
              Model for these tries (Settings stay as they are)
              <TextInput aria-label="Model for these tries" list="playground-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={settings.imageModel || "The model in Settings"} />
              <datalist id="playground-models">{modelChoices.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</datalist>
            </label>
            {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" onClick={() => void generate()} disabled={busy || !prompt.trim()}><FaMagic size={11} /> {busy ? "Drawing..." : "Generate"}</Button>
              {busy && <Button type="button" variant="outline" onClick={() => stopRunning?.()}><FaStop size={10} /> Stop</Button>}
            </div>
          </Card>
          <ImageContentTest tryModel={model} />
          </div>

          <section aria-label="Pictures" className="flex flex-col gap-4">
            {results.length === 0 && <p className="rounded-card bg-surface p-6 text-center text-[13px] text-subtle ring-1 ring-inset ring-border">Pictures show up here. They're kept until you close the app, and nothing goes to your chats.</p>}
            {results.map((r) => (
              <Card key={r.id} className="flex flex-col gap-3 p-4" data-slot="playground-result">
                {r.images.map((src, i) => (
                  <img key={i} src={src} alt={r.asked} className="w-full rounded-lg" />
                ))}
                <div className="text-[12px] text-subtle">{r.model} · {(r.ms / 1000).toFixed(1)} s{r.people.length ? ` · references: ${r.people.join(", ")}` : ""}</div>
                {r.warning && <p className="text-[12.5px] text-muted-foreground">{r.warning}</p>}
                <details className="text-[12.5px]">
                  <summary className="cursor-pointer font-semibold text-foreground">Prompt sent</summary>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground" data-slot="playground-prompt">{r.prompt}</p>
                </details>
                <div className="flex flex-wrap gap-2">
                  {r.images.map((src, i) => (
                    <a key={i} href={src} download={`playground-${r.id}-${i + 1}.png`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-text hover:underline"><FaDownload size={11} /> Download{r.images.length > 1 ? ` ${i + 1}` : ""}</a>
                  ))}
                  <button type="button" onClick={() => { setPrompt(r.asked); void generate(r.asked); }} disabled={busy} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-text hover:underline disabled:opacity-40"><FaRedo size={10} /> Again</button>
                </div>
              </Card>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
};

export default ImagePlaygroundPage;
