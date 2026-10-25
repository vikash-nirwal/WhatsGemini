// Draws the app icons in public/ from Kindred's mark (the same drawing as
// src/components/atoms/Logo.tsx, in the cozy theme's colours), using the
// Chromium that Playwright already installs. Run: node scripts/make-icons.js
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const mark = `
  <path d="M10.5 10h11a4.5 4.5 0 0 1 4.5 4.5v4a4.5 4.5 0 0 1-4.5 4.5h-6.2l-3.8 3v-3.1A4.5 4.5 0 0 1 6 18.5v-4A4.5 4.5 0 0 1 10.5 10z" fill="#FFF4EC" opacity=".55"/>
  <path d="M14.5 15h11a4.5 4.5 0 0 1 4.5 4.5v3a4.5 4.5 0 0 1-4.5 4.5H25v3.2l-4-3.2h-6.5a4.5 4.5 0 0 1-4.5-4.5v-3a4.5 4.5 0 0 1 4.5-4.5z" fill="#FFF4EC"/>
  <circle cx="16.5" cy="21" r="1.3" fill="#C9573A"/><circle cx="20.5" cy="21" r="1.3" fill="#C9573A"/><circle cx="24.5" cy="21" r="1.3" fill="#C9573A"/>`;
const gradient = `<defs><linearGradient id="g" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#EE8559"/><stop offset="1" stop-color="#C9573A"/></linearGradient></defs>`;
// "any": the rounded tile. "maskable": full bleed, the mark shrunk into the
// safe zone, since launchers cut their own shape out of it.
const rounded = `<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">${gradient}<rect width="36" height="36" rx="11" fill="url(#g)"/>${mark}</svg>`;
const fullBleed = `<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">${gradient}<rect width="36" height="36" fill="url(#g)"/><g transform="translate(3.6 3.6) scale(0.8)">${mark}</g></svg>`;

const out = path.join(__dirname, "..", "public");
const icons = [
  ["favicon-32.png", rounded, 32],
  ["logo192.png", rounded, 192],
  ["logo512.png", rounded, 512],
  ["logo-maskable-192.png", fullBleed, 192],
  ["logo-maskable-512.png", fullBleed, 512],
  ["apple-touch-icon.png", fullBleed, 180], // iOS rounds the corners itself
];

// A .ico that holds PNGs (every current browser reads these).
const ico = (pngs) => {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (svg, size) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
    return page.locator("svg").screenshot({ omitBackground: true });
  };
  for (const [name, svg, size] of icons) fs.writeFileSync(path.join(out, name), await render(svg, size));
  const sizes = [16, 32, 48];
  fs.writeFileSync(path.join(out, "favicon.ico"), ico(await Promise.all(sizes.map(async (size) => ({ size, data: await render(rounded, size) })))));
  await browser.close();
  console.log(`Wrote ${icons.length} PNGs and favicon.ico to public/`);
})();
