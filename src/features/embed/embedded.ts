// The embedded build (#263): Kindred running inside another app's page (a
// "host app") in an <iframe>, built with `npm run build:embedded`. These are
// fixed at build time, so the normal build (GitHub Pages) leaves every
// embedded-only branch out and behaves exactly as before.
export const IS_EMBEDDED = process.env.REACT_APP_EMBEDDED === "1";

// Written by scripts/build-embedded.mjs into both the bundle and
// build/embedded.json, so the host can match what it unpacked with what runs.
export const EMBEDDED_VERSION = process.env.REACT_APP_EMBEDDED_VERSION || "";
export const EMBEDDED_COMMIT = process.env.REACT_APP_EMBEDDED_COMMIT || "";
