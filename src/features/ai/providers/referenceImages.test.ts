import { collectReferences, referenceLegend } from "./referenceImages";

const PNG = "iVBORw0KGgoAAAANSUhEUg";
const JPEG = "/9j/4AAQSkZJRg";

test("a flat list is capped and keeps its order", () => {
  const images = [1, 2, 3].map((n) => ({ mimeType: "image/jpeg", data: `${JPEG}${n}` }));
  const refs = collectReferences({ referenceImages: images }, 2);
  expect(refs.images.map((i) => i.data)).toEqual([`${JPEG}1`, `${JPEG}2`]);
  expect(refs.names).toEqual([undefined, undefined]);
  expect(referenceLegend(refs.names)).toBe("");
});

test("named groups are interleaved so every character fits under the cap", () => {
  const refs = collectReferences(
    {
      referenceCharacters: [
        { name: "Aria", images: [{ mimeType: "image/jpeg", data: `${JPEG}a1` }, { mimeType: "image/jpeg", data: `${JPEG}a2` }] },
        { name: "Empty", images: [] },
        { name: "Ben", images: [{ mimeType: "image/jpeg", data: `${JPEG}b1` }] },
      ],
    },
    2
  );
  expect(refs.images.map((i) => i.data)).toEqual([`${JPEG}a1`, `${JPEG}b1`]);
  expect(refs.names).toEqual(["Aria", "Ben"]);
});

test("a PNG labelled image/jpeg gets its real type", () => {
  const refs = collectReferences({ referenceImages: [{ mimeType: "image/jpeg", data: PNG }] }, 1);
  expect(refs.images[0].mimeType).toBe("image/png");
});
