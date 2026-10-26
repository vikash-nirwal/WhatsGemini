// Memory recall by meaning (#200). Facts are picked for a reply by the words
// they share with the conversation, so "the thing with my sister" never
// found "Sam's sister Nora is sick". With this on, a small embedding model
// in the browser (about 25 MB, downloaded once, no GPU needed) finds the
// facts closest in meaning to what's being said, and they count as relevant
// alongside the word matches. Off unless you turn it on; kept on this device.

export const LS_SEMANTIC_MEMORY = "semantic_memory";
export const EMBEDDINGS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";
const MODEL = "Xenova/all-MiniLM-L6-v2";
const TOP = 4;
const MIN_SIMILARITY = 0.3;

export const semanticMemoryOn = () => {
  try {
    return localStorage.getItem(LS_SEMANTIC_MEMORY) === "true";
  } catch {
    return false;
  }
};
export const setSemanticMemory = (on: boolean) => {
  try {
    localStorage.setItem(LS_SEMANTIC_MEMORY, String(on));
  } catch {
    // Only a convenience.
  }
};

type Embed = (texts: string[]) => Promise<number[][]>;
let embedder: Promise<Embed> | null = null;

// Loaded at runtime from the CDN, like the in-browser chat model (#55), so
// it never weighs on the app's own download. Tests can stand in a fake.
const loadEmbedder = (): Promise<Embed> => {
  const fake = (window as unknown as { __kindredEmbed?: Embed }).__kindredEmbed;
  if (fake) return Promise.resolve(fake);
  if (!embedder) {
    embedder = (async () => {
      const lib = await import(/* webpackIgnore: true */ EMBEDDINGS_URL);
      const extract = await lib.pipeline("feature-extraction", MODEL, { dtype: "q8" });
      return async (texts: string[]) => {
        const out = await extract(texts, { pooling: "mean", normalize: true });
        return out.tolist() as number[][];
      };
    })();
    embedder.catch(() => {
      embedder = null;
    });
  }
  return embedder;
};

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] || 0), 0);
const norm = (a: number[]) => Math.sqrt(dot(a, a)) || 1;
export const similarity = (a: number[], b: number[]) => dot(a, b) / (norm(a) * norm(b));

// The facts closest in meaning to the query, best first.
export const rankByMeaning = (facts: string[], vectors: number[][], query: number[], top = TOP, min = MIN_SIMILARITY): string[] =>
  facts
    .map((f, i) => ({ f, s: vectors[i] ? similarity(vectors[i], query) : -1 }))
    .filter(({ s }) => s >= min)
    .sort((a, b) => b.s - a.s)
    .slice(0, top)
    .map(({ f }) => f);

const factVectors = new Map<string, number[]>();
const recalled = new Map<string, Set<string>>();

// Worked out just before a reply (async), read while its prompt is built
// (sync). Never throws: recall is a help, the word matches still work.
export const prepareRecall = async (key: string, facts: string[], queryText: string) => {
  if (!semanticMemoryOn() || facts.length === 0 || !queryText.trim()) {
    recalled.delete(key);
    return;
  }
  try {
    const embed = await loadEmbedder();
    const missing = facts.filter((f) => !factVectors.has(f));
    if (missing.length) (await embed(missing)).forEach((v, i) => factVectors.set(missing[i], v));
    const [query] = await embed([queryText.slice(-1500)]);
    recalled.set(key, new Set(rankByMeaning(facts, facts.map((f) => factVectors.get(f)!), query)));
  } catch (err) {
    console.warn("Recall by meaning failed (non-fatal):", err);
    recalled.delete(key);
  }
};

export const recalledFor = (key: string): Set<string> | undefined => recalled.get(key);
