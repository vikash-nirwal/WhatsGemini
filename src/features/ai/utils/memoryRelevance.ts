import { Message } from "../../../types";
import { MEMORY_PROMPT_LIMIT, MEMORY_RELEVANCE_SCAN_COUNT } from "../../../utils/constants";

// Picks which long-term facts go into the next prompt once a memory list is
// too long to send whole. Pinned facts are handled by the caller (always
// sent); this only ranks the rest.
//
// A fact scores by how many of its meaningful words appear in the recent
// conversation, plus a small bonus for recency (the list is kept least
// recently touched first - see applyMemoryChanges), so with nothing in
// common the newest facts win. The chosen facts keep their original order.
// Same idea as the lorebook, but soft: no keyword has to match exactly.

const STOPWORDS = new Set(
  "the a an and or but if then than so to of in on at by for with about from into over after before under again is are was were be been being have has had do does did not no yes it its this that these those there here they them their he him his she her hers you your yours we our ours i me my mine who whom what which when where why how all any each some such very can will just also only own same too more most other new like said says".split(" ")
);

const words = (text: string): string[] =>
  (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [])
    .map((w) => w.replace(/'s$/, "").replace(/'/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

// A light stem so "promised"/"promise" and "swords"/"sword" meet.
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");

export const selectRelevantFacts = (
  facts: string[],
  recentMessages: Message[] | undefined,
  limit: number = MEMORY_PROMPT_LIMIT,
  // Facts found by meaning (#200), which count as having come up.
  boost?: Set<string>
): string[] => {
  if (facts.length <= limit) return facts;

  const recentText = (recentMessages || []).slice(-MEMORY_RELEVANCE_SCAN_COUNT).map((m) => m.txt || "").join("\n");
  const recentStems = new Set(words(recentText).map(stem));

  const scored = facts.map((fact, index) => {
    const factStems = new Set(words(fact).map(stem));
    let overlap = 0;
    factStems.forEach((s) => { if (recentStems.has(s)) overlap++; });
    // Recency: 0 for the oldest fact, up to 1 for the newest - enough to
    // break ties, never enough to beat a fact that actually came up.
    const recency = facts.length > 1 ? index / (facts.length - 1) : 1;
    return { index, score: overlap * 2 + recency + (boost?.has(fact) ? 3 : 0) };
  });

  const chosen = new Set(
    scored
      .sort((a, b) => b.score - a.score || b.index - a.index)
      .slice(0, limit)
      .map((s) => s.index)
  );
  return facts.filter((_, i) => chosen.has(i));
};
