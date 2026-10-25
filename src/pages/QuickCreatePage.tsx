import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaCamera, FaRedo, FaTimes, FaMagic } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { useAppDispatch } from "src/store/hooks";
import { generateAssistText, generateAssistTextWithImage } from "src/features/aiSlice";
import { addCharacter } from "src/features/characterSlice";
import { addChat } from "src/features/chatSlice";
import { buildCharacterDraftPrompt, CharacterDraft, CharacterDraftError, parseCharacterDraft } from "src/features/character/characterDraft";
import { LIFE_PRESETS } from "src/features/character/lifePresets";
import { readPhoto } from "src/features/chat/photoAttachments";
import { CHARACTER_SWATCHES } from "src/utils/constants";
import { useCurrentWorld } from "src/hooks/useWorld";
import { cn } from "src/utils/cn";
import { Character } from "src/types";

// Quick create (#154): one line (and a photo if you like) gives a draft to
// look over, a life preset, and straight into a chat. The full editor is a
// tap away, with the draft filled in.
const QuickCreatePage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { current: world } = useCurrentWorld();
  const [idea, setIdea] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [preset, setPreset] = useState(LIFE_PRESETS[1].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accent] = useState(() => CHARACTER_SWATCHES[Math.floor(Math.random() * CHARACTER_SWATCHES.length)]);
  const fileRef = useRef<HTMLInputElement>(null);

  const makeDraft = async () => {
    if (!idea.trim() && !photo) return;
    setBusy(true);
    setError(null);
    try {
      const instruction = buildCharacterDraftPrompt({ idea: idea.trim(), photo, avoidName: draft?.name });
      const text = photo
        ? await dispatch(generateAssistTextWithImage({ instruction, image: photo })).unwrap()
        : await dispatch(generateAssistText({ instruction, background: true })).unwrap();
      setDraft(parseCharacterDraft(text));
    } catch (err: any) {
      setError(err instanceof CharacterDraftError ? `${err.message} Try again, or reword the idea.` : typeof err === "string" ? err : err?.message || "Couldn't draft a character. Check your API key in Settings.");
    } finally {
      setBusy(false);
    }
  };

  const asCharacter = (): Omit<Character, "id"> => ({
    name: draft!.name,
    description: draft!.description,
    personalityTraits: draft!.personalityTraits,
    prompt: draft!.prompt,
    scenario: draft!.scenario,
    first_mes: draft!.first_mes || undefined,
    alternateGreetings: draft!.alternateGreetings,
    mes_example: draft!.mes_example,
    relationship: draft!.relationship,
    appearance: draft!.appearance,
    visualTags: draft!.visualTags || undefined,
    accent,
    ...LIFE_PRESETS.find((p) => p.id === preset)!.values,
  });

  const start = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const c = await dispatch(addCharacter(asCharacter())).unwrap();
      const chat = await dispatch(addChat({ title: c.name, characterIds: [c.id] })).unwrap();
      navigate(chat?.id ? `/chat/${chat.id}` : "/characters");
    } catch (err: any) {
      setError(err?.message || String(err));
      setBusy(false);
    }
  };

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await readPhoto(file));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      <header className="flex h-16 flex-none items-center gap-1 border-b border-border bg-surface px-2">
        <button type="button" onClick={() => navigate("/characters")} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full text-foreground hover:bg-raised"><FaTimes size={16} /></button>
        <h1 className="flex-1 text-[17px] font-bold text-foreground">New character</h1>
        <Button type="button" variant="ghost" className="text-primary-text" onClick={() => navigate("/characters/new", draft ? { state: { draftFrom: asCharacter() } } : undefined)}>Full editor</Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-[18px] bg-raised p-3 pb-2 ring-1 ring-inset ring-border">
            <label htmlFor="quick-idea" className="text-[12px] font-bold text-subtle">Describe them in a line</label>
            <textarea id="quick-idea" value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} placeholder="A retired singer who runs a record shop and pretends not to care about anyone."
              className="w-full resize-none bg-transparent text-[15.5px] leading-6 text-foreground placeholder:text-subtle outline-none" />
            {photo && (
              <div className="relative w-fit">
                <img src={photo} alt="Your photo" className="h-20 rounded-lg" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhoto(undefined)} className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-popover shadow-soft"><FaTimes size={10} /></button>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-9 items-center gap-1.5 rounded-full bg-sunken px-3 text-[13px] font-semibold text-foreground"><FaCamera size={12} /> {photo ? "Change photo" : "Add photo"}</button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} aria-label="Photo to draft from" />
              <span className="flex-1" />
              {draft ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => void makeDraft()} disabled={busy}><FaRedo size={11} /> New draft</Button>
              ) : (
                <Button type="button" size="sm" onClick={() => void makeDraft()} disabled={busy || (!idea.trim() && !photo)}><FaMagic size={11} /> {busy ? "Drafting..." : "Draft"}</Button>
              )}
            </div>
          </div>
          {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}

          {draft && (
            <>
              <div className="flex items-center gap-2"><span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-subtle">Draft preview</span><span className="h-px flex-1 bg-border" /></div>
              <section aria-label="Draft preview" className="flex flex-col gap-3.5 rounded-card bg-card p-4 shadow-soft ring-1 ring-inset ring-border">
                <div className="flex items-center gap-3.5">
                  <CharacterAvatar name={draft.name} accent={accent} size={56} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[19px] font-bold text-foreground">{draft.name}</span>
                    <span className="text-[13.5px] text-muted-foreground">{draft.description}</span>
                  </div>
                </div>
                {(draft.personalityTraits.length > 0 || world) && (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.personalityTraits.slice(0, 4).map((t) => <span key={t} className="rounded-md bg-raised px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">{t}</span>)}
                    {world && <span className="rounded-md bg-raised px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">{world.name}</span>}
                  </div>
                )}
                {draft.first_mes && (
                  <div className="rounded-card bg-background px-3 py-3">
                    <div className="rounded-bubble rounded-tl-[5px] bg-bubble-in px-3 py-2 font-serif text-[14.5px] leading-[22px] text-bubble-in-text">{draft.first_mes}</div>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] font-bold text-subtle">Their life</span>
                  <div role="radiogroup" aria-label="Their life" className="flex flex-wrap gap-1.5">
                    {LIFE_PRESETS.map((p) => (
                      <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} title={p.desc} onClick={() => setPreset(p.id)}
                        className={cn("h-9 rounded-full px-3 text-[13px] font-semibold", preset === p.id ? "bg-primary/15 text-primary-text ring-1 ring-inset ring-primary" : "bg-sunken text-foreground")}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              <p className="text-center text-[12.5px] text-subtle">Their look, voice and routine can be filled in later, in the full editor.</p>
            </>
          )}
        </div>
      </div>

      {draft && (
        <div className="flex-none border-t border-border bg-background px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <Button type="button" className="mx-auto flex h-12 w-full max-w-[560px] text-[15px]" onClick={() => void start()} disabled={busy}>Start chatting with {draft.name}</Button>
        </div>
      )}
    </div>
  );
};

export default QuickCreatePage;
