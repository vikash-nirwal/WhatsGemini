import React, { useRef, useState } from "react";
import { FaFlask, FaStop } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { NsfwBlur } from "src/components/molecules/NsfwBlur";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { drawTestPicture, toneDownTestPrompt, writeCalibrationRules } from "src/features/aiSlice";
import { calibrationKey, DEFAULT_TEST_PROMPT, ImageCalibration, loadCalibration, saveCalibration } from "src/features/ai/utils/imageCalibration";
import { TONE_LEVELS, ToneLevel } from "src/features/ai/utils/imageTone";
import { looksLikePromptRefusal } from "src/features/ai/utils/refusal";
import { detectMinorIndicators } from "src/features/character/contentRating";

interface Step {
  level: ToneLevel;
  prompt: string;
  status: "drawing" | "drawn" | "blocked" | "failed";
  image?: string;
  note?: string;
}

// The content test (imageCalibration.ts): how far the current image model
// needs a prompt toned down before it draws an adult picture, and the rules
// its prompts follow from then on.
export const ImageContentTest = ({ tryModel }: { tryModel?: string }) => {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.settings);
  const model = tryModel?.trim() || settings.imageModel;
  const key = calibrationKey(settings.imageProvider, model);
  const [saved, setSaved] = useState<ImageCalibration | undefined>(() => loadCalibration(key));
  const [savedFor, setSavedFor] = useState(key);
  if (savedFor !== key) {
    setSavedFor(key);
    setSaved(loadCalibration(key));
  }
  const [probe, setProbe] = useState(DEFAULT_TEST_PROMPT);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);
  const label = `${settings.imageProvider}${model ? ` · ${model}` : ""}`;

  const setStep = (i: number, patch: Partial<Step>) => setSteps((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const run = async () => {
    setError(null);
    // The test picture is of an adult; a prompt that reads otherwise isn't sent.
    if (detectMinorIndicators([probe]).length) {
      setError("The test prompt reads as being about someone under 18. Describe an adult.");
      return;
    }
    stopped.current = false;
    setRunning(true);
    setSteps([]);
    const refused: { level: number; prompt: string }[] = [];
    let accepted: { level: ToneLevel; prompt: string } | undefined;
    try {
      for (const level of [0, 1, 2, 3] as ToneLevel[]) {
        if (stopped.current) return;
        // Each level rewrites the original, as a chat picture's retries do.
        const prompt = level === 0 ? probe.trim() : await dispatch(toneDownTestPrompt({ prompt: probe.trim(), level: level as 1 | 2 | 3 })).unwrap();
        if (level > 0 && looksLikePromptRefusal(prompt)) {
          setError("Your text model wouldn't rewrite the prompt, so the test stopped. Try another helper model in Settings › Text model.");
          return;
        }
        const i = level;
        setSteps((list) => [...list, { level, prompt, status: "drawing" }]);
        const r = await dispatch(drawTestPicture({ prompt, model: tryModel })).unwrap();
        if (r.images.length) {
          setStep(i, { status: "drawn", image: r.images[0] });
          accepted = { level, prompt };
          break;
        }
        if (!r.blocked) {
          setStep(i, { status: "failed", note: r.warning });
          setError("The picture failed for a reason other than its content, so the test stopped. Fix the image setup and run it again.");
          return;
        }
        setStep(i, { status: "blocked", note: r.warning });
        refused.push({ level, prompt });
      }
      if (stopped.current) return;
      let result: ImageCalibration;
      if (!accepted) result = { level: 3, blockedAll: true, label, at: Date.now() };
      else if (accepted.level === 0) result = { level: 0, label, at: Date.now() };
      else {
        const guidance = await dispatch(writeCalibrationRules({ refused, accepted, model: label })).unwrap().catch(() => undefined);
        result = { level: accepted.level, ...(guidance ? { guidance } : {}), label, at: Date.now() };
      }
      saveCalibration(key, result);
      setSaved(result);
    } catch (err) {
      setError(typeof err === "string" ? err : err instanceof Error ? err.message : "The test didn't finish.");
    } finally {
      setRunning(false);
    }
  };

  const levelName = (l: ToneLevel) => TONE_LEVELS.find((t) => t.level === l)?.name || String(l);
  return (
    <Card className="flex flex-col gap-4 p-5" aria-label="Content test">
      <div>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-foreground"><FaFlask size={13} className="text-subtle" /> Content test</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Sends an adult test picture to {label}, toning it down a level each time it's refused, until it's drawn. The text model then compares what was refused with what was drawn and writes rules for this model: from then on its picture prompts follow them and start at that level, so fewer are refused.
        </p>
      </div>
      <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
        Test prompt (always an adult, with nobody's photos)
        <textarea aria-label="Test prompt" value={probe} onChange={(e) => setProbe(e.target.value)} rows={3} className="w-full rounded-lg bg-raised px-3 py-2 text-[14px] text-foreground" />
      </label>
      {saved && (
        <div role="status" className="rounded-lg bg-raised px-3 py-2 text-[13px]">
          <p className="font-semibold text-foreground">
            {saved.blockedAll ? "Tested: it refused every level, even safe for work." : saved.level === 0 ? "Tested: it draws prompts as written." : `Tested: it draws from level ${levelName(saved.level)}.`}
          </p>
          {saved.guidance && <p className="mt-1 text-muted-foreground">Rules for its prompts: {saved.guidance}</p>}
          <button type="button" className="mt-1 text-[12.5px] font-semibold text-primary-text hover:underline" onClick={() => { saveCalibration(key, undefined); setSaved(undefined); }}>Forget this result</button>
        </div>
      )}
      {steps.length > 0 && (
        <ol aria-label="Test steps" className="flex flex-col gap-2">
          {steps.map((s) => (
            <li key={s.level} className="flex gap-3 rounded-lg bg-raised p-3 text-[13px]">
              {s.image && (
                <NsfwBlur active={settings.privacy.blurNsfwMedia} className="h-20 w-16 flex-none rounded-md">
                  <img src={s.image} alt={`Drawn at level ${s.level}`} className="h-20 w-16 rounded-md object-cover" />
                </NsfwBlur>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">
                  {levelName(s.level)}: {s.status === "drawing" ? "drawing..." : s.status === "drawn" ? "drawn" : s.status === "blocked" ? "refused" : "failed"}
                </p>
                <p className="line-clamp-3 text-muted-foreground">{s.prompt}</p>
                {s.note && s.status !== "drawn" && <p className="mt-1 text-[12px] text-subtle">{s.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void run()} disabled={running || !probe.trim()}><FaFlask size={11} /> {running ? "Testing..." : saved ? "Test again" : "Run the test"}</Button>
        {running && <Button type="button" variant="outline" onClick={() => { stopped.current = true; }}><FaStop size={10} /> Stop</Button>}
        <span className="text-[12px] text-subtle">Draws up to 4 pictures, each billed by your image provider.</span>
      </div>
    </Card>
  );
};
