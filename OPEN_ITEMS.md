# Open review items

Source: full repository review on 2026-09-08. All items are open; no fixes were made during the review. Check an item only after its verification criteria pass. Keep IDs stable when updating this file.

## High priority

- [x] **R01 — Preserve media metadata during manifest regeneration.** *(fixed 2026-09-09, working tree)*
  `tools/generate-manifest.js` preserved only poems and overwrote custom media captions, dates, and trips. Invalid existing JSON also allowed an overwrite.
  **Fix:** The generator now validates the existing manifest before it touches anything, merges by exact `src` and then by unambiguous basename, and replaces the file by rename from an exclusively created sibling temporary file. Curated `id`, `date`, `caption`, `trip`, `poster`, poems, unknown item properties and unknown top-level keys survive; only `src`, `type` and `fileSize` are refreshed. Unmatched entries are dropped and reported instead of aborting, so no run ever requires a hand edit. Diagnostics report the parser's location only, never its message text.
  **Verify:** `node --test tests/generate-manifest.test.js` — passing tests covering validation, diagnostic leakage, preservation, empty-string values, unknown properties, independent same-basename files, move/rename recovery, ambiguity, drops, key order and null-omission, equal-date ordering, undated poems, injected write/rename failures, first-run failure, temp-file cleanup, CLI exit codes from an unrelated working directory, refusal to wipe a populated manifest when the scan comes back empty, and stale-poster warnings. Tests use temporary fixtures only. Against the real collection: a dry run reproduced `content.json` byte-for-byte (546 items, 0 recovered, 0 dropped), and a hand-edited caption and trip survived an actual regeneration. **Reviewed:** A post-implementation review probed prototype pollution (no pollution; a `__proto__` key is dropped), a `constructor` key (preserved), path-escaping `src` values (dropped, no traversal), poems with invalid dates (rejected), and mass deletion. Three issues were found and fixed: an empty scan would have emptied a populated manifest, a stale `poster` path was preserved with no warning, and the spec and README claimed renames were followed when only moves are. **Browser-verified:** served over `python3 -m http.server`, entered the gate, all 546 items rendered across 18 seasons, 356 lazily loaded images with 0 broken, 14 videos playing, no `NaN` section ids, and zero console errors or warnings.

- [x] **R02 — Make the layout usable on phones.** *(fixed 2026-09-09, working tree)*
  `styles/layout.css` fixed the sidebar at 280px, section horizontal padding at 96px total, and galleries at three columns, without breakpoints. At 375px the sidebar took 280 of 375 pixels and `#content` overflowed horizontally by 79px.
  **Fix:** Two `@media` blocks appended to `styles/layout.css`; nothing else in the repository changed. Below 900px the sidebar becomes a top strip — brand and music button on one row, seasons as a horizontally scrolling row of chips beneath — `#content` fills the remaining grid row and stays the scrolling container, sections size to their content, snap is off, and columns are `auto-fill minmax(200px, 1fr)`. Below 520px, padding drops to 16px, the grid is two fixed columns and card meta shrinks. Chips and the music button get a 44px minimum height. `.app` uses `100dvh` with `min-height: 0` to cancel the desktop `min-height: 100vh`, which would otherwise exceed the dynamic viewport and make the body scroll behind mobile browser chrome. The snap override carries `!important` because `setupSidebarNavigation()` re-applies `scroll-snap-type: y mandatory` as an inline style one second after every navigation click; this was confirmed at every width and is commented in the stylesheet for removal alongside R06/R07.
  **Verify:** Measured from the live page at 320, 375, 390, 520, 700, 900, 901 and 1280. Page overflow 0 in both axes and `#content` horizontal overflow 0 at every width. Columns 2/2/2/2/3/4/3/3; section padding `20px 16px` to 520, `24px` to 900, `48px` above; chips 44px below 900 and 37px above; music button 44px below 900, 46px above. The strip scrolls to reveal the last of 18 seasons. After a navigation click and past the 1000ms timer, computed snap is `none` at 375 and 900 and `y mandatory` at 901 and 1280, while the inline `y mandatory` is present at all four. 901px and 1280px are unchanged from `main`. Images lazy-load on scroll (14 to 23 loaded when scrolling to `winter-2024`); the music button is reachable and its click calls `audio.play()` once. A scratchpad fixture on a second port confirmed trip chips, trip sections and a full-width poem card at 375px. Console: 128 messages, all `app.js`'s own logs, zero errors, zero warnings, zero 404s. `content.json` hashes identically to `HEAD` and `assets/` is unchanged. The gate was checked at 375px and left alone.
  **Not verified:** Video decoding and audible music. Chrome reported the tab `hidden` throughout, and a hidden tab defers media resource loading — the server logged zero `.MOV` requests, and a synthetic click is not the user gesture audio playback needs. Both belong to R18, and neither is a layout property. Reveals, lazy loading and scroll spy were made verifiable by pulsing a screenshot after each action, which forces a frame.
  **Does not fix:** transfer size and layout shift (R08), trip ordering and duplicate observer setup (R06/R07 — `scrollIntoView` was observed running twice per click), reduced motion (R14), the active chip scrolling itself into view in the strip, and deployed behavior (R18).

## Medium priority

- [ ] **R03 — Fix winter chronology.**
  `scripts/content.js` groups January, February, and December of the same year together, placing December memories before that year's spring and summer. Choose a consistent label for consecutive winter periods.
  **Verify:** January, June, and December 2024 display chronologically, and December/January boundaries group consistently. The current error was reproduced and affects existing content.

- [ ] **R04 — Make season assignment timezone-independent.**
  `scripts/content.js` combines local-midnight parsing with UTC getters. Parse calendar components directly or use one consistent convention.
  **Verify:** `2025-03-01` is Spring 2025 in both New York and Tokyo; test all season and year boundaries. The current timezone mismatch was reproduced.

- [x] **R05 — Correct generated trips, posters, and extension handling.** *(fixed 2026-09-09, working tree)*
  In `tools/generate-manifest.js`, `assets/images/Paris/` produced trip `images`; video poster paths lost a directory; posters also became standalone gallery entries; uppercase extensions leaked into captions and interfered with poster matching.
  **Fix:** Trip is now the path below the media bucket (`Paris`); poster paths resolve beside their video and match several extensions; poster files are excluded from items; the extension is stripped as spelled on disk. Also hardened beyond the original item: an explicit image/video extension allowlist (`.HEIC`, `.AAE`, `.txt`, `.ico` and similar are skipped and reported instead of becoming images), calendar validation of filename dates (`2024-13-45` no longer becomes a date), a total sort order so an undated item cannot leave dated items unsorted, name-sorted traversal, and a skip-with-warning for names containing `#` or `?`.
  **Verify:** Fixture tree in a temporary directory covering nested trips, uppercase/lowercase extensions, adjacent posters, invalid calendar dates, sidecar and unsupported files, URL-unsafe names, and an undated poem — all behaved as specified. Dry run against the real collection produced 546 items in and 546 out, 0 added, 0 dropped, 0 dates changed, 0 file sizes changed, and 384 corrected IDs and captions; `content.json` was not written and its hash was unchanged (`3c91e209…`). Not verified in a browser.
  **Follow-up:** R19 — the manifest still holds the old values until it is regenerated.

- [ ] **R06 — Align trip rendering and navigation.**
  `scripts/app.js` appends trips before their parent season, while navigation lists the season first. Scroll spy observes only `.section`, excluding trips.
  **Verify:** A fixture with multiple seasons and trips renders in navigation order; clicking and scrolling activate the corresponding season/trip links. Existing content has no trips.

- [ ] **R07 — Initialize observers and navigation once.**
  `scripts/app.js` sets up navigation, scroll spy, reveals, and lazy loading inside `render()` and again in its completion handler.
  **Verify:** Each navigation click runs one handler; each media element has one loading lifecycle; videos are not loaded or started twice by duplicate observers.

- [ ] **R08 — Reduce media transfer size and layout shifts.**
  `scripts/app.js` serves original images without responsive sources or reserved dimensions; `styles/layout.css` does not reserve media aspect ratios. Review baseline: 546 media items, about 1.24 GB total (782 MB images, 459 MB videos), 438 files over 1 MB, largest video about 99 MB.
  **Verify:** Generate display-sized image variants, select appropriate responsive sources, and reserve dimensions. Measure transferred bytes and layout shifts before/after in a browser; preserve original personal media.

- [ ] **R09 — Manage video playback and expose controls.**
  `scripts/media.js` starts looping videos and stops observing them, so nothing pauses offscreen playback. `scripts/app.js` supplies no controls, and rejected playback is silently ignored.
  **Verify:** Offscreen videos pause; returning to view behaves consistently; users can play/pause videos, including when autoplay is blocked. Check Safari and another browser.

- [ ] **R10 — Provide honest empty/error states and retry.**
  `scripts/content.js` turns fetch/parse failures into empty data. `scripts/app.js` then references two missing fallback images; other render failures display a permanent loading message.
  **Verify:** Empty content, HTTP failure, malformed JSON, and invalid content shape show appropriate states. Errors allow recovery without broken sample images or indefinite loading text. Both fallback image paths were confirmed missing.

- [ ] **R11 — Track scroll-spy visibility across callbacks.**
  `scripts/app.js` compares only entries in the latest IntersectionObserver callback, not all currently visible sections.
  **Verify:** Scrolling forward/backward through short and tall sections maintains the intended active link, including when multiple sections are visible and when navigating directly to a trip.

## Additional gaps and decisions

- [ ] **R12 — Preserve poem line breaks.** `scripts/app.js` renders poem text in a normal paragraph. Preserve intentional line breaks; verify multiline poems without interpreting their text as HTML.
- [ ] **R13 — Make the brand interaction keyboard-accessible.** Update `app.html` and `scripts/easter.js` to use an appropriate interactive element. Verify focus visibility and keyboard activation of the heart effect.
- [ ] **R14 — Respect reduced-motion preferences.** Review CSS reveals/transitions, smooth scrolling, confetti, and video behavior. Verify reduced-motion mode keeps content visible and usable without unnecessary animation.
- [ ] **R15 — Reconcile README claims with implementation.** `README.md` describes responsive image sources and a welcome experience that are not implemented. Update the claims or explicitly scope those features; verify documentation matches shipped behavior.
- [ ] **R16 — Confirm whether public media access is intentional.** The gate in `scripts/gate.js` and `scripts/app.js` is a client-side reveal, not access control. Record the intended privacy model. If media must be private, choose hosting/access controls that protect the assets themselves; changing the date check is insufficient.
- [ ] **R17 — Add focused regression coverage.** *(partially done: `tests/generate-manifest.test.js` covers the generator; `node --test tests/generate-manifest.test.js` is documented in `AGENTS.md`. Season/date boundaries and content error handling remain uncovered.)* There was no automated test suite. Cover season/date boundaries, manifest preservation/path generation, and content error handling as fixes land; document the actual test command in `AGENTS.md`.
- [x] **R19 — Regenerate `content.json` with the corrected scanner.** *(done 2026-09-09, working tree)*
  The committed manifest carried 384 IDs and captions containing the file extension (caption `"13 01 36.JPG"`, ID `2021_11_06_13_01_36_JPG`).
  **Fix:** Corrected the caption format so a bare capture time renders as a clock time (`4:52 PM`) rather than `16 52 07`, including filenames with a duplicate-export suffix such as `..._07-49-03-1.JPG`. Then ran `node tools/generate-manifest.js`. Output is byte-identical to the reviewed dry run.
  **Verify:** 546 items in, 546 out; 0 added, 0 dropped, 0 dates changed, 0 file sizes changed; 384 IDs corrected and all 546 captions now clock times; `git diff --stat` shows 768 insertions and 768 deletions in `content.json` only; every `src` resolves on disk; items remain chronological; no file under `assets/` changed. Not verified in a browser — see R18.

- [ ] **R18 — Complete browser and deployment verification.** No browser was available during review. Check date-gate paths, timeline/trips, media loading and playback, music, easter eggs, narrow screens, and console/network errors. Verify the deployed site separately, including relative paths under its hosting subpath.

## Review baseline and completion notes

- JavaScript syntax checks passed; `content.json` parsed; all 546 manifest media paths existed locally.
- Generator reproductions used temporary fixtures; repository content was not regenerated.
- Visual layout, playback compatibility, and deployed behavior were not verified.
- When closing an item, append the fix/commit reference and verification evidence beneath it. Syntax checks alone do not establish that a behavior fix works.
