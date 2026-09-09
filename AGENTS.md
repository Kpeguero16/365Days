# Repository guide

## Structure and patterns

- Static anniversary site for GitHub Pages: plain HTML, CSS, and JavaScript; no framework, bundler, package manifest, or backend. Keep URLs relative for project-subpath hosting; preserve `.nojekyll`.
- `index.html` and `scripts/gate.js` implement the date gate. `app.html` is the timeline shell; `scripts/app.js` renders cards, sections, navigation, and scroll spy.
- Browser scripts use IIFEs, two-space indentation, semicolons, and mostly single quotes. Shared helpers are exposed as `window.ContentAPI` and `window.MediaAPI`, not ES modules. Preserve deferred script order in `app.html`: content, media, music, app, easter.
- `scripts/content.js` fetches `content.json` and groups items by season/year and optional trip, oldest first. A winter spans two calendar years and is labelled with both, `Winter 2021–22`: December opens the winter, the following January and February close it. Season assignment reads the `YYYY-MM-DD` string directly and builds no `Date`, so it cannot vary by timezone — keep it that way. `scripts/media.js` handles IntersectionObserver reveals and lazy loading; music and easter eggs have separate scripts.
- CSS loads as `styles/base.css` (theme variables and gate), `styles/layout.css` (sidebar, timeline, cards), then `styles/effects.css` (reveals and transitions). Reuse the `:root` color/shadow variables.
- Follow `renderItem()` for cards: content text uses `textContent` or `escapeHtml`; media starts with `data-src`/`data-poster`. Poems render before media and span the grid. Videos are muted, looping, inline, and lazily loaded; music starts on a button click.

## Content and pitfalls

- `content.json` has an `items` array. Media uses `id`, `type` (`image`/`video`), `src`, `date` (`YYYY-MM-DD`), and `caption`; optional fields include `trip` and video `poster`. Poems use `type: "poem"`, `title`, and `text`. Existing content currently contains only media.
- Assets live in `assets/images/`, `assets/videos/`, and `assets/audio/`; background music is `assets/audio/background.mp3`. Preserve exact filename/extension case for hosting.
- `node tools/generate-manifest.js` updates `content.json` from the files in `assets/`. Run it after adding, moving, or removing media, and review the diff. Dates come from filenames and are calendar-validated, defaulting to `2021-09-11` when absent or invalid. Only allowlisted image (`.jpg/.jpeg/.png/.gif/.webp/.avif`) and video (`.mp4/.webm/.mov`) extensions become items; everything else is skipped and listed in the run output, so check that list after adding files. Trips come from directories below `assets/images` or `assets/videos`; `*_poster.*` files attach to the matching video instead of becoming their own card. Captions come from the filename: a bare capture time becomes a readable clock time (`2021-09-17_16-52-07.jpeg` gives `4:52 PM`), any other text is kept as words, and a date-only name gives `Memory`. Times are built without `toLocaleTimeString`, so output does not vary by machine locale.
- **The generator merges; it does not overwrite (R01).** Existing `id`, `date`, `caption`, `trip`, `poster`, poems, unknown properties and unknown top-level keys are preserved; only `src`, `type` and `fileSize` are refreshed from disk. Entries match by exact `src`, then by unambiguous basename, so a file moved between directories keeps its metadata; a file renamed to a different basename cannot be followed and comes back as a new entry. Unmatched entries are dropped and reported, never turned into an error you must fix by hand. Malformed input aborts before any write, and replacement happens by rename so a failure cannot truncate the file. Diagnostics report the parser's location only — never its message text, which can quote your content.
- The gate accepts `2021-09-11` and stores `sessionStorage.unlocked = '1'`. Clear that key to retest the gate. This is a client-side reveal, not access control; static assets remain directly accessible.
- `#content` is the scrolling container, not the window. Keep navigation, scroll snap, and observer roots consistent with it.
- README feature claims exceed the implementation: do not assume responsive `srcset`, a welcome overlay, or mobile breakpoints exist. Inspect source before extending them.

## Commands and verification

Run from the repository root:

- Local preview: `python3 -m http.server 8000 --bind 127.0.0.1`, then open `http://127.0.0.1:8000/`. Serve over HTTP because content loads with `fetch`; do not rely on `file://`.
- JavaScript syntax: `for f in scripts/*.js tools/*.js tests/*.js; do node --check "$f" || break; done`
- JSON parse check: `node -e 'JSON.parse(require("fs").readFileSync("content.json", "utf8"))'`
- Whitespace check: `git diff --check`.
- Generator tests: `node --test tests/generate-manifest.test.js`. They run against temporary fixtures only and never read or write the real `content.json` or `assets/`.
- Content tests: `node --test tests/content.test.js`. Season and date boundaries, including timezone independence. `scripts/content.js` is a browser IIFE, so the tests load it with `node:vm` against a stub `window` and drive the public `groupBySeason`; the source needs no test-only export. Timezone cases run one child process per zone because `TZ` must be set before the first `Date` use.
- Both suites: `node --test tests/*.test.js` (40 tests). Pass the files, not the directory — `node --test tests` treats the argument as a module path and fails with `MODULE_NOT_FOUND` on Node 24.
- No lint configuration, build step, or type checker is configured. `tools/generate-manifest.js` and `scripts/content.js` have tests; `scripts/app.js`, `media.js`, `music.js`, `gate.js` and `easter.js` do not. Syntax/JSON checks do not replace browser verification.
- Dry-run the generator without writing: `node -e 'const {buildManifest}=require("./tools/generate-manifest.js");const r=buildManifest("assets","content.json");console.log(r.manifest.items.length, r.report.skipped, r.report.warnings)'`. `buildManifest()` is pure; only `generateManifest()` writes.
- For behavior changes, check empty/wrong/correct date entry and redirects, timeline scrolling, image/video loading, music toggle, and affected easter eggs. Inspect console/network errors and test narrow screens and Safari where available.

Keep changes scoped; preserve personal media and copy unless the task calls for editing them. Do not regenerate content or introduce build tooling as incidental cleanup.
