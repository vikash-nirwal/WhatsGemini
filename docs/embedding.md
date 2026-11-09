# Embedding Kindred in another app

Kindred can run inside another app's page (a *host app*) in an `<iframe>`. One such host is Reeldeck. This page covers the embedded build, the message protocol between Kindred and the host (the bridge, version 1), and the release Action that publishes signed embedded builds.

Without the embedded build nothing here applies: the normal build (`npm run build`, GitHub Pages) has no bridge and behaves as before.

## The embedded build (#263)

```sh
npm run build:embedded
```

`scripts/build-embedded.mjs` runs `react-scripts build` with `REACT_APP_EMBEDDED=1` and `PUBLIC_URL=.`, so `build/` works from any origin and path (every asset path is relative; routes are in the URL's hash). In this build:

- no service worker is registered (the host ships and updates the files);
- Kindred's PIN screen is never shown, and Settings › Privacy says why (the host's own lock covers the frame);
- the 18+ confirmation is kept;
- everything else is as on the normal site. Data still lives in the browser's storage for the origin Kindred is served from, so the host must serve it from the same origin every time. Moving data between devices or origins works with Kindred's own backup and restore.

It also writes `build/embedded.json`:

```json
{ "name": "kindred-embedded", "version": "1.0.0+202611091703.abc1234", "commit": "<full sha>", "built": "2026-11-09T17:03:00Z", "bridge": 1 }
```

`version` is `<package.json version>+<YYYYMMDDHHMM UTC>.<short commit>`; `bridge` is the protocol version below.

The page loads fonts from Google Fonts and talks to AI providers directly (https, and local ones such as Ollama, ComfyUI and SD WebUI on `http://localhost` or `http://127.0.0.1`), so a host's Content-Security-Policy must allow those.

## The bridge, protocol version 1 (#264)

`window.postMessage` between the host page and Kindred's frame. Code: `src/features/embed/hostBridge.ts`.

- The host loads Kindred as `<Kindred's URL>?host=<the host's origin, URL-encoded>`. The value must be a bare `http(s)` origin.
- Kindred accepts messages only from `window.parent` **and** only when `event.origin` equals that origin, and posts only to it. Without `?host=`, outside a frame, or in the normal build, Kindred sends and accepts nothing.
- Every message is `{ "rd": 1, "type": "<type>", ... }`. Messages with another `rd`, unknown types and anything malformed are ignored. The host should check `event.source` (Kindred's frame) and `event.origin` (Kindred's origin) the same way.

### Host to Kindred

| type | fields | what Kindred does |
| --- | --- | --- |
| `panic` | | Stops speech and sound at once, closes dialogs and menus, and shows a blank, neutral cover over everything until `unpanic` or `open` (or the frame is reloaded). |
| `unpanic` | | Takes the cover away. |
| `lock` | | Same as `panic`. |
| `open` | `adaptStory: { title, author?, text }` | Opens the new story page (Stories › New story) with the text pasted and the title filled; the user carries on there, 18+ switch and all. A request sent while the app is still starting is kept until it can be shown. |
| `theme` | `scheme: "dark" \| "light"` | Advisory; Kindred keeps its own look. |

### Kindred to host

| type | fields | when |
| --- | --- | --- |
| `ready` | `version`, `commit`, `bridge: 1` | Once, when the app has started (the same values as `embedded.json`). |
| `title` | `text` | The screen's title, whenever it changes, for the host's own bar. |
| `saveImage` | `png` (base64 PNG, no `data:` prefix), `prompt`, `negative?`, `settings?: { model?, seed?, steps?, cfg?, sampler?, width?, height?, tool? }`, `name?` | From **Save to library**, shown only when embedded: in the image playground (`/images`) under each picture, and on a generated chat or adventure picture opened full screen. JPEG and WebP are converted to PNG first. At most 25 MB. |

The host answers each `saveImage` with `{ rd: 1, type: "saved", ok: boolean, error?: string }`, in order; Kindred shows it as a toast ("Saved to library" or the error). No answer within a minute counts as a failure.

### Testing it

- Unit tests: `src/features/embed/*.test.ts`.
- `e2e/embedded.spec.ts` serves `build/` on one origin and a stand-in host page on another, and checks `ready`, `title`, panic and unpanic, `open` and Save to library (with a generated test-pattern picture; no AI is called). Run `npm run build:embedded` first; it skips otherwise.

## Releases (#265)

`.github/workflows/embedded-release.yml` runs on every push to `main` (and by hand from the Actions tab):

1. type-check and unit tests;
2. `npm run build:embedded`;
3. `scripts/package-embedded.mjs` zips `build/` (files at the zip's root, `embedded.json` included) and writes the manifest:
   ```json
   { "name": "kindred-embedded", "version": "...", "commit": "...", "built": "...", "bridge": 1,
     "zip": { "name": "kindred-embedded.zip", "size": 1703506, "sha256": "<hex>" } }
   ```
4. `scripts/sign-embedded.mjs` signs the manifest file's exact bytes with Ed25519 (Node's own `crypto.sign(null, bytes, key)`), base64 on one line, as `kindred-embedded.json.sig`;
5. publishes a release tagged `embedded-<version with + replaced by ->`, named "Kindred embedded <version>", with the zip, the manifest and the signature;
6. keeps the newest 5 `embedded-*` releases and deletes older ones with their tags. Other releases are never touched.

A host should verify the signature against the public key it pins **before** trusting the manifest, then check the zip's size and SHA-256 against it, and refuse a `bridge` version it doesn't know.

### The signing key

The Action needs a repository secret named `KINDRED_EMBED_SIGNING_KEY` holding an Ed25519 private key as PKCS#8 PEM. Without it the Action still builds and tests, and logs that nothing was published.

To make a key pair (keep the private key out of every repository):

```sh
openssl genpkey -algorithm ed25519 -out kindred-release.key
# The raw public key in base64, as hosts pin it:
openssl pkey -in kindred-release.key -pubout -outform DER | tail -c 32 | base64
```

Add it in GitHub under Settings › Secrets and variables › Actions › New repository secret, named `KINDRED_EMBED_SIGNING_KEY`, pasting the whole PEM file (with its `BEGIN`/`END` lines), or with the GitHub CLI:

```sh
gh secret set KINDRED_EMBED_SIGNING_KEY < kindred-release.key
```

### Building and checking a release locally

```sh
npm run build:embedded
node scripts/package-embedded.mjs out/
node scripts/sign-embedded.mjs out/kindred-embedded.json --key-file kindred-release.key
node scripts/verify-embedded.mjs out/kindred-embedded.json <public key, base64 or a file>
```

`verify-embedded.mjs` checks the signature, then the zip beside the manifest, and exits non-zero on any mismatch.
