# R06/R07/R11 implementation checklist

Status: T4 complete, Checkpoint B partially met, 2026-09-09. Follow [the specification](../SPEC-r06.md) and [plan](plan-r06.md). All boxes describe future implementation work.

## T1 — Measure the current behavior

- [x] Build a scratchpad fixture `content.json`: at least three seasons, at least two with multiple trips, a poem, an image and a video, so navigation order, append order and trip observation are all exercised.
- [x] Record the real `content.json` hash before starting. `aa49f47e…d37d2ef4`, unchanged after T1.
- [x] Count, on real content: click listeners on `#timeline`, live scroll-spy observers, reveal observers, loading observers, and `load()`/`play()` calls per video.
- [x] Record `intersectionRatio` and `isIntersecting` for the tallest and a median season at 1280px and at 375px, with the spy's current root, thresholds and `rootMargin`.
- Acceptance: every claim in the spec's "Current behavior" table has a measured number behind it, or is corrected to match what was measured.
- **Result:** 2 click listeners, 6 observers, 2 `scrollIntoView` per click, 2 `load()`/2 `play()` per video, 3 trip chips against 0 observed trips, and fixture DOM order inverted against nav order — all as filed. The spec's phone claim was **too strong and has been corrected**: 0 of 18 sections fall below the 0.1 threshold at 1280px and 1 of 18 at 375px, not "inert on phones". T1 instead found the stronger defect — `intersectionRatio` divides by target area, so a 1450px section holding 238px of the band beats a 2476px section holding 279px. That is now what drives the T4 design.
- Verify: browser, both widths, screenshot pulses to force rendering updates. No production file is edited in this slice.
- Dependencies: none.
- Files: scratchpad only (0 repository files).

## T2 — Register once (R07)

- [x] Remove the duplicate setup block from the `render().then()` handler, leaving it responsible for the failure path only.
- [x] Re-run every T1 count.
- Acceptance: one click listener, one scroll-spy mechanism, one reveal observer, one loading observer; exactly one `load()` and one `play()` attempt per video across a full page pass; one `scrollIntoView` and one snap-restore timer per chip click.
- **Result:** listeners 2 -> 1, observers 6 -> 3 (spy 18 targets, reveals 564, loading 546 — one of each), `scrollIntoView` per click 2 -> 1, `load()`/`play()` 2/2 -> 1 per video across two videos. A/B at a fresh load with only `scripts/app.js` swapped: revealed cards 5 vs 5, images with `src` 7 vs 7, active chip `Fall 2021` vs `Fall 2021` — identical, so nothing but the duplication changed. An earlier A/B taken at a jumped scroll position disagreed (4/6 vs 3/9); that was layout noise from images resizing cards mid-measurement, not a regression.
- Verify: browser counts before and after, at 1280px; page still renders, reveals, lazy-loads and navigates.
- Dependencies: T1.
- Files: `scripts/app.js` (1 file).

## Checkpoint A

- [x] All duplicate counts are exactly one.
- [x] Nothing else in page behavior changed: cards reveal, media loads, chips navigate.
- [x] No new console errors or warnings. Zero errors or exceptions captured across the T2 loads.

## T3 — Order trips with their season (R06)

- [x] Append the season element before its trip elements, keeping trips as siblings inside `#content`.
- [x] Assert against the fixture that `#content` child order equals `#timeline` link order, element for element.
- Acceptance: season → its trips → next season, matching navigation; real content (zero trips) renders identically to before.
- **Result:** fixture orders now match element for element — `spring-2022, spring-2022-paris, spring-2022-rome, summer-2022, summer-2022-lisbon, fall-2022` in both, with classes `section, trip-section, trip-section, section, trip-section, section`. Real content unchanged: 18 sections, 0 trip sections, 546 cards, nav order equals DOM order, `fall-2021` first and `fall-2025` last, 3 observers, 1 listener, 0 errors. Trip chips still cannot activate — the spy observes only `.section` until T4.
- Verify: browser against the fixture; compare the two orders programmatically rather than by eye. Confirm real content is unaffected.
- Dependencies: T2.
- Files: `scripts/app.js` (1 file).

## T4 — Replace the scroll spy (R11, R06)

- [x] Replace the IntersectionObserver with a `requestAnimationFrame`-throttled `passive` scroll handler on `#content`.
- [x] Collect seasons and trips in document order once per render; activate the last target whose top has passed the activation line at 25% of the scrollport.
- [x] Force the last target active at the end of the scroller; run the computation once after render for the initial state.
- Acceptance: spec criteria 5, 6 and 7 — chips activate correctly scrolling both directions at 1280px and 375px through many-screen-tall sections, trip chips activate, the bottom activates the last chip, and the pre-scroll state matches the first section.
- **Result:** 13 scroll stops at 1280px against real content, forward then backward, zero mismatches. At 375px with PR #2's stylesheet, `summer-2024` (6259px, the section that could never activate under the old threshold) is active and straddles the activation line; so does `winter-2024`; the bottom of the scroller activates `fall-2025`. Verified with an independent check that asks whether the active chip's section actually spans the line, rather than re-running the spy's own arithmetic.
- **Criterion 5 is met for season chips and for trip chips only when snap is off.** `#content` carries `scroll-snap-type: y mandatory`, `.section` has `scroll-snap-align: start` with `min-height: 800px`, and `.trip-section` has `scroll-snap-align: none` at 306px tall — so a trip between two full-height snap targets is not a resting scroll position and the scroller lands on the next season instead. With snap disabled, all three fixture trip chips activate correctly. This is the `styles/layout.css` follow-up the spec already recorded, now measured rather than predicted; it is not a regression, since trips could not activate at all before.
- Verify: browser at both widths against real content and the fixture, scrolling forward and backward, plus the top and bottom extremes.
- Dependencies: T3.
- Files: `scripts/app.js` (1 file).

## Checkpoint B

- [x] Criteria 1-4, 6, 7 and 8 pass with recorded evidence. Criterion 5 passes for season chips; trip chips need the `.trip-section` snap follow-up in `styles/layout.css`, which PR #2 owns.
- [x] `node --test tests/*.test.js` passes (34/34); `node --check scripts/app.js` passes; `git diff --check` is clean.
- [x] Real `content.json` hash `aa49f47e6a6c8ec8` unchanged; `assets/` untouched.
- [x] Review the diff for scope: `scripts/app.js` only.

## T5 — Document and close

- [ ] Record fix and verification evidence for R06, R07 and R11 in `OPEN_ITEMS.md`, including what was not verified.
- [ ] Note the `.trip-section` snapping follow-up, to land in `styles/layout.css` after PR #2 merges.
- [ ] Remove the scratchpad fixture and stop the local server.
- Acceptance: the tracker states what changed, what was measured, and what remains.
- Verify: read the tracker entries against the recorded measurements.
- Dependencies: Checkpoint B.
- Files: `OPEN_ITEMS.md` (1 file).
