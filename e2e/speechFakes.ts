import type { Page } from "@playwright/test";

// Speech fakes for the voice (#12, #44) and call (#56) specs. The browser's
// speechSynthesis and SpeechRecognition are replaced before the app loads,
// so every project hears the same thing and nothing plays out loud.
// `window.__speech.spoken` records what was said and `__speech.finish()`
// ends it; `window.__recognition.say(text)` is what the microphone "hears".

export const installSpeechFakes = (page: Page, { synthesis = true, recognition = true } = {}) =>
  page.addInitScript(
    ({ synthesis, recognition }) => {
      const w = window as any;
      if (synthesis) {
        const log: any = { spoken: [], cancels: 0 };
        const queue: any[] = [];
        const voices = [
          { name: "Test Alice", voiceURI: "test-alice", lang: "en-US", default: true, localService: true },
          { name: "Test Bruno", voiceURI: "test-bruno", lang: "en-GB", default: false, localService: true },
        ];
        const synth = {
          getVoices: () => voices,
          speak(u: any) {
            queue.push(u);
            log.spoken.push({ text: u.text, voice: u.voice ? u.voice.voiceURI : null, rate: u.rate, pitch: u.pitch });
          },
          cancel() {
            log.cancels++;
            queue.splice(0).forEach((u) => u.onerror && u.onerror({ error: "interrupted" }));
          },
          pause() {},
          resume() {},
          addEventListener() {},
          removeEventListener() {},
        };
        log.finish = () => {
          while (queue.length) {
            const u = queue.shift();
            if (u.onend) u.onend({});
          }
        };
        w.__speech = log;
        Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
        w.SpeechSynthesisUtterance = class {
          text: string;
          voice = null;
          lang = "";
          rate = 1;
          pitch = 1;
          onend = null;
          onerror = null;
          onboundary = null;
          constructor(text: string) {
            this.text = text;
          }
        };
      } else {
        // Like a browser without text-to-speech.
        Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => undefined });
        delete w.SpeechSynthesisUtterance;
      }
      if (recognition) {
        const rec: any = { instances: 0, active: null };
        rec.say = (text: string) => {
          const r = rec.active;
          if (!r) return false;
          const result: any = [{ transcript: text }];
          result.isFinal = true;
          if (r.onresult) r.onresult({ results: [result] });
          return true;
        };
        w.__recognition = rec;
        class Recognition {
          continuous = false;
          interimResults = false;
          lang = "";
          onresult = null;
          onerror = null;
          onend: (() => void) | null = null;
          constructor() {
            rec.instances++;
          }
          start() {
            rec.active = this;
          }
          stop() {
            if (rec.active === this) rec.active = null;
            setTimeout(() => this.onend && this.onend(), 0);
          }
          abort() {
            this.stop();
          }
        }
        w.SpeechRecognition = Recognition;
        w.webkitSpeechRecognition = Recognition;
      } else {
        // Like Firefox.
        delete w.SpeechRecognition;
        delete w.webkitSpeechRecognition;
      }
    },
    { synthesis, recognition }
  );

export const spoken = (page: Page) => page.evaluate(() => (window as any).__speech.spoken as { text: string; voice: string | null; rate: number; pitch: number }[]);
export const say = (page: Page, text: string) => page.evaluate((t) => (window as any).__recognition.say(t), text);
