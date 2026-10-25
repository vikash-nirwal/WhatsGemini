// The status viewer's and composer's colours (#152): the canvas's six text
// status backgrounds. White text passes 4.5:1 on each.
export const STATUS_COLORS = [
  { name: "Clay", value: "#9A4A2A" },
  { name: "Blue", value: "#2E6CB8" },
  { name: "Plum", value: "#5B3F9E" },
  { name: "Pine", value: "#2F5F55" },
  { name: "Ink", value: "#26303B" },
  { name: "Rose", value: "#A0396B" },
];

// A character's text status has no colour of its own: one is picked from its
// id, so it stays the same every time it's opened.
export const statusColorFor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return STATUS_COLORS[hash % STATUS_COLORS.length].value;
};

// "@Sam" pieces of a status, for highlighting (#129).
export const mentionParts = (text: string) => text.split(/(@[\p{L}\p{N}_]+)/u);
