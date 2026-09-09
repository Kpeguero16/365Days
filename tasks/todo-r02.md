# R02 implementation checklist

Status: complete, 2026-09-09; reopened and re-closed after an independent review of PR #2 found a blank-screen defect (T5 below). All slices implemented; every acceptance criterion measured except two that need real media playback, recorded below and handed to R18. Follow [the specification](../SPEC-r02.md) and [plan](plan-r02.md). Unchecked boxes describe work not yet started.

Measurements are read from the live page inside a same-origin iframe served by `python3 -m http.server`. Chrome would not accept a window resize below the 1470px screen width, and an iframe is a separate browsing context with its own viewport, so media queries evaluate against its width exactly as they would in a resized window.

## T1 — Stack the navigation below 900px

- [x] Append the `max-width: 900px` block: `.app` to one column and two rows at `100dvh` with `min-height: 0`; `.sidebar` static, bordered below, laid out as brand plus music button with the timeline spanning beneath; `.timeline` horizontal, `min-width: 0`, `overflow-x: auto`, scrollbar hidden; `.player` static in the top row with `width: auto` on its button; `.content` at `height: 100%`.
- Acceptance: at 375x667 and 390x844 the brand, music button and first season chip are visible without scrolling; the strip scrolls sideways to the last season; no horizontal page overflow; the body does not scroll.
- Verify: read `documentElement.scrollWidth` vs `innerWidth`, `documentElement.scrollHeight` vs `innerHeight`, and `#timeline.scrollWidth` vs `clientWidth` from the live page.
- Dependencies: none.
- Files: `styles/layout.css` (small, 1 file).

**Result, 375x667 and 390x844.** Page overflow 0 horizontal and 0 vertical, so the body does not scroll. `#content` horizontal overflow 0, against 79px before the change. `.app` is one 375px column of `106px 561px` rows. The sidebar is static, full width, 106px tall, `border-bottom: 1px`, `border-right: 0`. The brand sits at y=18 and the music button at x=252 y=10, 107px wide rather than the full column. The timeline is `flex-direction: row` with `scrollWidth` 1911 against `clientWidth` 343; scrolling it to the end brings the last chip, `Fall 2025`, fully inside the strip. Photos lazy-load and reveal normally.

**Regression check.** The breakpoint flips between 900 and 901. At 901px and 1280px: `280px` sidebar, `position: sticky`, column timeline, absolute player, 231px button, 48px section padding, `snap: y mandatory`, three columns. Identical to `main`.

## T2 — Adapt the gallery and turn snap off

- [x] In the same block: `.section` `min-height: 0`, `scroll-snap-align: none`, `padding: 24px`; `.trip-section` padding; `.grid` to `repeat(auto-fill, minmax(200px, 1fr))`; `.scroll-snap-y { scroll-snap-type: none !important }` with a comment naming `setupSidebarNavigation()` as the reason.
- Acceptance: columns are 3 at 700px and 4 at 900px; after a nav click and a wait past 1000ms, computed `scroll-snap-type` on `#content` is `none`.
- Verify: count `grid-template-columns` tracks from `getComputedStyle`; click a chip, wait, then read computed snap.
- Dependencies: T1.
- Files: `styles/layout.css` (small, 1 file).

**Result.** Section padding 24px, `min-height: 0`, `scroll-snap-align: none` and `scroll-snap-type: none` below 900px; 48px, a full-viewport minimum, `start` and `y mandatory` at 901px and above. Columns: 1 at 375 and 390 (T3 sets the explicit two-column rule), 3 at 700, 4 at 900, 3 at 901 and 1280. Page and `#content` horizontal overflow are 0 at every width.

**The `!important` is load-bearing.** After clicking a navigation chip and waiting past the 1000ms timer, `#content` carries the inline value `scroll-snap-type: y mandatory` written by `setupSidebarNavigation()` at every width — 375, 900, 901 and 1280. Computed value is `none` at 375 and 900, and `y mandatory` at 901 and 1280. Without `!important` the inline declaration would win and snap would come back on phones after the first tap.

## Checkpoint A

- [x] Sweep 320, 375, 390, 520, 700, 900, 901 and 1280 and record measurements.
- [x] Confirm 901px and 1280px match `main`: sidebar 280px, section padding 48px, three columns, snap `y mandatory`.
- [x] Confirm `scripts/`, `app.html`, `content.json` and `assets/` are unchanged.

## T3 — Phone refinements below 520px

- [x] Append the `max-width: 520px` block: `.section` `padding: 20px 16px`; `.trip-section` `padding: 16px`; `.grid` to two columns with a 12px gap; `.card .meta` smaller; `.section .section-header` allowed to wrap.
- [x] Give `.timeline a` `display: inline-flex`, `align-items: center` and `min-height: 44px` so chips meet the touch-target minimum.
- Acceptance: two columns at 375px; every chip renders at 44px or taller; captions and dates stay legible and do not overflow their cards.
- Verify: `getBoundingClientRect().height` across all chips; column count; visual check of a caption-heavy season.
- Dependencies: T2.
- Files: `styles/layout.css` (small, 1 file). The 44px rule went into the 900px block rather than the 520px one: touch targets matter at every stacked width, not only on phones.

**Result.** Measured at 320, 375, 390, 520, 521, 700, 900, 901 and 1280.

| Width | Section padding | Meta | Columns | Gap | Chip height |
| --- | --- | --- | --- | --- | --- |
| 320 / 375 / 390 / 520 | `20px 16px` | 13px | 2 | 12px | 44px |
| 521 / 700 / 900 | `24px` | 14px | 2 / 3 / 4 | 16px | 44px |
| 901 / 1280 | `48px` | 14px | 3 | 16px | 37px |

Page overflow is 0 horizontal and 0 vertical, and `#content` horizontal overflow is 0, at every one of those widths, including 320px. Card width at 375px is 166px and captions wrap to one or two lines (meta box 39px or 59px) against four lines in the 82px columns before the change.

**Visual check at 375px.** Two columns of 166px cards, photos large and legible, captions on one or two lines, active chip highlighted in the strip, music button top right.

## T4 — Media, music and trips at 375px

- [x] Confirm images lazy-load on scroll. Scrolling to `winter-2024` took loaded images from 14 to 23.
- [x] Confirm the music toggle is reachable and wired. At 375px the button sits at x=252 y=10, 107x44, fully inside the viewport; a click reaches the handler and calls `audio.play()` exactly once.
- [x] Serve a temporary trip fixture from the scratchpad and confirm trip chips and trip sections render at 375px. Left `content.json` and `assets/` untouched.
- [x] Capture console output; 128 messages, all of them `app.js`'s own `console.log` calls, zero errors and zero warnings. Zero 404s in the server log.
- [ ] Video playback and audible music. Not verifiable in this environment; see below.
- Acceptance: every acceptance criterion in the specification has a recorded result.
- Verify: browser console and network panel; hashes of `content.json` before and after.
- Dependencies: T3.
- Files: none in the repository; fixture lives in the scratchpad.

**Trip fixture.** A second `http.server` on port 8001, rooted at a scratchpad directory holding symlinks to `styles/`, `scripts/` and `assets/`, copies of `app.html` and `index.html`, and a seven-item `content.json` with two trips and a poem. Same-origin within that port, so the harness could read into it. Result at 375px: the strip reads `Fall 2021 - Paris - Rome` with trip chips smaller, muted, `margin-left: 0` and 44px tall; trip sections take 16px padding and two columns; the poem card spans `1 / -1` at the full 343px. No overflow. The trip sections render before their parent season, which is R06 and was not touched.

**Gate at 375px.** Not in scope and not modified. Checked and not broken: card 295px wide, input 43px, button 48px, no overflow in either axis.

**Deviation from the plan.** `.player button` gained `min-height: 44px`. It measured 42px, which is under the touch minimum applied to the chips, and the inconsistency was not worth shipping. Desktop keeps its own 46px.

## Environment: a hidden tab, and what it does and does not block

Chrome reported `document.visibilityState === "hidden"` for the verification tab throughout, because a fully occluded window on macOS is hidden rather than merely unfocused. A hidden tab runs no rendering updates, and IntersectionObserver callbacks depend on those, so reveals and lazy loading appeared dead and `behavior: 'smooth'` scrolling never advanced while `'instant'` worked.

Taking a screenshot forces Chrome to produce a frame, which runs the observers. Pulsing a screenshot after each action made reveals, lazy loading and scroll spy verifiable: after one pulse, one section had `.in`, 19 cards had `.in`, 19 images were decoded and `opacity` was 1.

Two things the pulse does not restore, because Chrome defers media resource loading for hidden pages:

- **Video.** The first video reached `src`, `muted: true` and `paused: false`, but `readyState` stayed 0 with nothing buffered and no error, and the server log recorded zero requests for any `.MOV` from Chrome. The file itself serves correctly, `200`, 11811225 bytes, `video/quicktime`.
- **Audio.** `play()` is called on the toggle, but a synthetic click is not a user gesture, so the promise rejects into `catch(()=>{})` and the label and `aria-pressed` do not change. That silent swallow is R09/R10, already tracked.

Both need a genuinely visible window and a real click, which is R18's job. Neither is a layout property, and neither is affected by this change.

An earlier reading of these same symptoms was briefly written up as a navigation defect, R20, and has been withdrawn from `OPEN_ITEMS.md`; nothing was concluded from it. One observation from that pass does stand and needs no frames: `scrollIntoView` runs twice per navigation click, the duplicate handler setup already tracked as R07.

## Checkpoint B — Completion

- [x] `git diff --check` clean; the diff touches `styles/layout.css` and the R02 documents only.
- [x] Review the change for scope: no JavaScript, HTML, generator or content edits. `content.json` hashes `aa49f47e6a6c8ec8` in both the working tree and `HEAD`; `git diff -- assets content.json` is empty.
- [x] Mark R02 complete in `OPEN_ITEMS.md` with the measurements, and record what R02 does not fix — transfer size (R08), nav ordering and duplicate observers (R06/R07), reduced motion (R14), deployed behavior and real media playback (R18).

## T5 — Fixes from the PR #2 review

Added after an independent code review. Findings were reproduced before acting on them, not taken on trust.

- [x] **Critical: the largest season rendered blank on phones.** `setupReveals()` in `scripts/media.js` observed `.section` at `threshold: 0.1`; `isIntersecting` follows the threshold index, so a section too tall to reach 10% of the viewport never reports as intersecting and never gains `.in`, leaving `effects.css`'s `opacity: 0` in force. Two phone columns put `#summer-2024` at 130 cards and 6930px in a 552px scroller — maximum ratio 0.079, blank at every scroll position, 130 of 546 items invisible. Fixed with `threshold: 0`.
- [x] **Focus ring clipped on the chips.** `.timeline` had `overflow-y: hidden`, `clientHeight` 44 and 44px chips: 0px of vertical slack, so the keyboard focus ring was clipped top and bottom. Fixed with `padding: 4px 0`, giving 8px of slack. Dropping `overflow-y: hidden` would not have worked — when one overflow axis is not `visible` the other computes to `auto` and clips identically.
- [x] **Scrollbar hidden on non-touch narrow windows.** The 900px block also covers narrow desktop windows, where a wheel does not scroll horizontally and the scrollbar was the only route to later seasons. `(pointer: coarse)` measured false in that context. Scrollbar hiding is now gated behind that query.
- [x] Accuracy fixes the review surfaced: the strip is a grid row, not sticky, and the comment said otherwise; `display: inline-flex` on a flex item is blockified, so it reads `flex`; the SPEC's breakpoint arithmetic implied 936px, not 900, and now says so along with the 901–936px consequence; the `OPEN_ITEMS.md` entry said "working tree" for committed work.

**Verification.** `#summer-2024` at 375x667: 130 cards, 6930px, maximum ratio 0.0791 — still far below 0.1 — now `.in` with `opacity: 1` and rendering. Paired IntersectionObserver probes on that element at the same instant gave `threshold: 0` true at ratio 0.0733 and `threshold: 0.1` false at the same ratio, which is the mechanism. `winter-2024`, ratio 0.32, revealed both before and after, which rules out the hidden-tab artifact. Desktop at 1280 renders `#summer-2024` normally, so the threshold change regresses nothing. Full sweep re-run at 320, 375, 390, 520, 700, 900, 901 and 1280: overflow 0/0/0 everywhere, chips 44px with 8px slack below 900 and 37px above, music button 44px/46px, padding and column counts unchanged, snap `none`/`y mandatory`, strip still scrollable, `scrollbar-width` back to `auto` on desktop.

**Scope note.** R02 was scoped CSS-only. The threshold fix is one option on one observer in `scripts/media.js` — the only JavaScript in the change. The CSS-only alternative (exempting `.section` from the fade below 900px) was rejected because it would leave the same trap above 900px, where three tracks are already down to 165px at 901.
