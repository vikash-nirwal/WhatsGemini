import { AmbientSound, Character, Chat } from "../../types";

// Ambient sound (#89): soft background sound for the scene - rain, a café,
// a fireplace, the sea, a city at night - picked from where the scene is
// (the tracked location and time, the scenario, the setting tags) or chosen
// by hand. Everything is synthesized with Web Audio from noise and a few
// scheduled sounds: nothing to download, nothing to pay for.

export type { AmbientSound };

export const AMBIENT_SOUNDS: { value: AmbientSound; label: string }[] = [
  { value: "rain", label: "Rain" },
  { value: "cafe", label: "Café" },
  { value: "fireplace", label: "Fireplace" },
  { value: "sea", label: "Sea" },
  { value: "city", label: "City at night" },
];

export const ambientLabel = (sound: AmbientSound) => AMBIENT_SOUNDS.find((s) => s.value === sound)?.label || sound;

// First match wins: weather is louder than a place, so rain on a beach is rain.
const SCENE_WORDS: [AmbientSound, RegExp][] = [
  ["rain", /\b(rain\w*|storm\w*|drizzl\w*|thunder\w*|downpour|monsoon)\b/i],
  ["fireplace", /\b(fire ?place|hearth|campfire|bonfire|fire pit|log cabin|cabin|lodge|fire)\b/i],
  ["sea", /\b(sea|seaside|ocean|beach|shore|coast\w*|harbou?r|pier|dock|boat|ship|waves?|bay)\b/i],
  // No \b at the end: JavaScript doesn't count "é" as a word character.
  ["cafe", /\b(caf[eé]s?|coffee ?(shop|house)?|bar|pub|tavern|inn|restaurant|diner|bistro|bakery|tea ?house)(?![\wÀ-ɏ])/i],
  ["city", /\b(city|street|downtown|rooftop|alley|avenue|traffic|neon|metropolis|skyline|subway|apartment)\b/i],
];

// Texts in order of how much they say about right now: the first one that
// suggests a sound decides (the tracked place before the opening scenario).
export const soundForScene = (...texts: (string | undefined)[]): AmbientSound | undefined => {
  for (const text of texts) {
    if (!text?.trim()) continue;
    const hit = SCENE_WORDS.find(([, words]) => words.test(text));
    if (hit) return hit[0];
  }
  return undefined;
};

// What the scene sounds like is read from: the tracked place and time, the
// chat's or the character's scenario, and the setting tags.
export const ambientSceneTexts = (chat: Chat | undefined, character?: Pick<Character, "scenario">): (string | undefined)[] => [
  chat?.sceneState?.location,
  chat?.sceneState?.time,
  chat?.scenario || character?.scenario,
  chat?.worldTags?.join(" "),
];

// What a chat plays: its own pick, or what its scene sounds like; nothing
// while sound is off.
export type AmbientSettings = NonNullable<Chat["ambient"]>;

export const ambientFor = (ambient: AmbientSettings | undefined, ...sceneTexts: (string | undefined)[]): AmbientSound | undefined => {
  if (!ambient?.on) return undefined;
  if (ambient.sound && ambient.sound !== "auto") return ambient.sound;
  return soundForScene(...sceneTexts);
};

export const DEFAULT_AMBIENT_VOLUME = 0.4;

// ---- The player ----

const FADE_S = 1.5;

const noiseBuffer = (ctx: AudioContext, kind: "white" | "pink" | "brown", seconds = 3): AudioBuffer => {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === "white") data[i] = white;
    else if (kind === "brown") {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      // Paul Kellet's pink noise filter.
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }
  return buffer;
};

type Stop = () => void;

// One sound: a looping bed of filtered noise, plus little events (drops,
// crackles, clinks, passing cars) scheduled at random while it plays.
const buildSound = (ctx: AudioContext, sound: AmbientSound, out: AudioNode): Stop => {
  const stops: Stop[] = [];
  const bed = (kind: "white" | "pink" | "brown", filter: BiquadFilterType, frequency: number, gain: number, q = 0.7) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, kind);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = frequency;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(out);
    src.start();
    stops.push(() => src.stop());
    return g;
  };
  const every = (minMs: number, maxMs: number, fn: () => void) => {
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        fn();
        next();
      }, minMs + Math.random() * (maxMs - minMs));
    };
    next();
    stops.push(() => window.clearTimeout(timer));
  };
  const white = noiseBuffer(ctx, "white", 1);
  const burst = (durationS: number, frequency: number, gain: number, filter: BiquadFilterType = "bandpass") => {
    const src = ctx.createBufferSource();
    src.buffer = white;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = frequency;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durationS);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5, durationS + 0.05);
  };

  if (sound === "rain") {
    bed("pink", "lowpass", 5000, 0.55);
    bed("white", "highpass", 3000, 0.05);
    every(30, 160, () => burst(0.02 + Math.random() * 0.03, 2000 + Math.random() * 4000, 0.08 + Math.random() * 0.12));
  } else if (sound === "sea") {
    const waves = bed("brown", "lowpass", 900, 0.6);
    // Slow swells: a 10-second LFO on the bed's gain.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.1;
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(waves.gain);
    lfo.start();
    stops.push(() => lfo.stop());
    bed("pink", "highpass", 2500, 0.04);
  } else if (sound === "fireplace") {
    bed("brown", "lowpass", 400, 0.7);
    every(60, 450, () => burst(0.005 + Math.random() * 0.03, 1500 + Math.random() * 3000, 0.15 + Math.random() * 0.35, "highpass"));
  } else if (sound === "cafe") {
    bed("brown", "lowpass", 1200, 0.45);
    const murmur = bed("pink", "bandpass", 450, 0.35, 0.8);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const depth = ctx.createGain();
    depth.gain.value = 0.12;
    lfo.connect(depth).connect(murmur.gain);
    lfo.start();
    stops.push(() => lfo.stop());
    // A cup or a spoon now and then.
    every(2500, 8000, () => {
      const osc = ctx.createOscillator();
      osc.frequency.value = 2200 + Math.random() * 1800;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.025, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } else {
    bed("brown", "lowpass", 280, 0.75);
    // A car going past in the distance.
    every(5000, 14000, () => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, "pink", 4);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      const g = ctx.createGain();
      const t = ctx.currentTime;
      f.frequency.setValueAtTime(300, t);
      f.frequency.linearRampToValueAtTime(1100, t + 1.8);
      f.frequency.linearRampToValueAtTime(300, t + 3.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.25, t + 1.8);
      g.gain.linearRampToValueAtTime(0.0001, t + 3.6);
      src.connect(f).connect(g).connect(out);
      src.start(t);
      src.stop(t + 3.8);
    });
  }

  return () => {
    stops.forEach((stop) => {
      try {
        stop();
      } catch {
        // Already stopped.
      }
    });
  };
};

// Plays one sound at a time, fading between them. Created on demand, so no
// audio context exists until a chat turns sound on.
export class AmbientPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private current: { sound: AmbientSound; gain: GainNode; stop: Stop } | null = null;
  private volume = 0.5;

  get playing(): AmbientSound | undefined {
    return this.current?.sound;
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  // Browsers keep audio suspended until the page gets a tap or a key.
  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume().catch(() => undefined);
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
  }

  play(sound: AmbientSound) {
    if (this.current?.sound === sound) return;
    const ctx = this.context();
    if (!ctx || !this.master) return;
    this.resume();
    this.fadeOut();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_S);
    gain.connect(this.master);
    this.current = { sound, gain, stop: buildSound(ctx, sound, gain) };
  }

  private fadeOut() {
    const old = this.current;
    if (!old || !this.ctx) return;
    this.current = null;
    old.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    old.gain.gain.setValueAtTime(old.gain.gain.value, this.ctx.currentTime);
    old.gain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + FADE_S);
    window.setTimeout(() => {
      old.stop();
      old.gain.disconnect();
    }, FADE_S * 1000 + 100);
  }

  stop() {
    this.fadeOut();
  }

  close() {
    this.current?.stop();
    this.current = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
  }
}
