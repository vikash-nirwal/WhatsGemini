import { prepareRecall, rankByMeaning, recalledFor, setSemanticMemory, similarity } from "./semanticRecall";

test("facts are ranked by how close they are in meaning (#200)", () => {
  expect(similarity([1, 0], [1, 0])).toBeCloseTo(1);
  expect(similarity([1, 0], [0, 1])).toBeCloseTo(0);
  const facts = ["Sam's sister Nora is sick", "Sam likes jazz", "Sam hates mornings"];
  const vectors = [[1, 0.1], [0, 1], [0.2, 0.2]];
  expect(rankByMeaning(facts, vectors, [1, 0], 2)).toEqual(["Sam's sister Nora is sick", "Sam hates mornings"]);
  expect(rankByMeaning(facts, vectors, [-1, -1])).toEqual([]);
});

test("recall is worked out before a reply, only when switched on", async () => {
  const facts = ["Sam's sister Nora is sick", "Sam likes jazz"];
  (window as any).__kindredEmbed = async (texts: string[]) => texts.map((t) => (/sister|nora|family/i.test(t) ? [1, 0] : [0, 1]));
  setSemanticMemory(false);
  await prepareRecall("c1", facts, "how's your family?");
  expect(recalledFor("c1")).toBeUndefined();
  setSemanticMemory(true);
  await prepareRecall("c1", facts, "the thing with my family");
  expect(Array.from(recalledFor("c1")!)).toEqual(["Sam's sister Nora is sick"]);
  delete (window as any).__kindredEmbed;
});
