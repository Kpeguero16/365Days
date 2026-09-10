# R06/R07/R11: One render lifecycle, correct order, working scroll spy

Status: implemented and verified, 2026-09-09. Branch `r06-render-lifecycle`, rebased onto `main` after R02 and R03 merged and re-verified against that merged state: 17 sections with the R02 stylesheet and the R02 reveal threshold in place, 1 click listener, 2 IntersectionObservers (reveals and loading; the spy no longer creates one), navigation order equal to DOM order, 0 console errors.
Tracker: [R06, R07, R11](OPEN_ITEMS.md). Plan: [tasks/plan-r06.md](tasks/plan-r06.md). Checklist: [tasks/todo-r06.md](tasks/todo-r06.md).

## Objective

`scripts/app.js` builds the page and then wires it up. All three tracker items are defects in that one wiring step, so they are specified and fixed together rather than in three passes over the same forty lines.

After this change: every observer and listener is registered exactly once; a season's trips render after that season, in the order navigation lists them; and the sidebar highlights the section the reader is actually looking at, at every window width.

### Why these three and not one at a time

They are not independent. The scroll spy is registered twice (R07), so two observers race to write the `active` class; each callback sees only its own entries (R11), so each writes a different answer. Fixing R11's selection rule while two observers still race would leave the symptom in place, and fixing R07 alone would make R11's behavior change without explaining why. R06 adds trips to the same observer and the same navigation list. One spec, one diff, one round of browser verification.

## Current behavior

`render()` ends by calling four setup functions (`scripts/app.js:115-118`). The `render().then()` handler calls the same four again (`scripts/app.js:223-228`), with `document` as the root instead of `#content`. Both run before any IntersectionObserver callback is delivered, so both see the same undisturbed DOM.

| Registered twice | Consequence |
| --- | --- |
| `setupSidebarNavigation()` | Two click listeners on `#timeline`. Every chip click runs two handlers: two `scrollIntoView({behavior:'smooth'})` calls on the same target, and two 1000ms timers that each re-apply the inline `scroll-snap-type`. |
| `setupScrollSpy()` | Two IntersectionObservers over the same sections, each writing `active` from its own partial view of visibility. |
| `MediaAPI.setupReveals()` | Two reveal observers over `.reveal, .section`. Adding the `in` class twice is harmless; the duplicate work is not free at 546 cards. |
| `MediaAPI.lazyLoadMedia()` | Two loading observers over the same media. The second finds `data-src` already consumed and skips the `src` assignment — but the `if (t.tagName === 'VIDEO')` branch sits **outside** that guard (`scripts/media.js:25-29`), so every video gets a second `load()` and `play()`. `load()` resets the element and aborts playback in progress, so the first play is cancelled and restarted. |

Two further defects in the same code path:

**Trips render before their own season.** The content loop appends each trip element to `#content` at `scripts/app.js:108`, then appends the season itself at line 112. The navigation loop emits the season link first, then its trip links (lines 33-49). So navigation promises season → trips while the DOM delivers trips → season, and a season's trips sit immediately after the *previous* season's content.

**Trips are never observed.** The scroll spy observes `document.querySelectorAll('.section')` (`scripts/app.js:183`). Trip elements carry `trip-section`, not `section`. Their navigation chips are built, are mapped, and can never become active.

**The selection rule reads one frame of a partial picture.** The callback computes the most-visible target from `entries` alone, starting `maxRatio` at 0 (`scripts/app.js:161-176`). `entries` holds only the targets whose intersection *changed* this cycle. A section that is unchanged and filling the viewport is not in the list and cannot win, so a neighbour dropping to a 10% sliver takes the highlight.

### What T1 measured

Every claim above is a counted value, taken at 1280x800 and 375x740 against the real 546-item manifest, plus a fixture for the trip cases. Method: same-origin iframe for viewport control, a probe wrapping `IntersectionObserver`, `addEventListener`, `HTMLMediaElement.load/play` and `Element.scrollIntoView` before the deferred scripts run, and screenshot pulses to force rendering updates.

| Measured | Value |
| --- | --- |
| Click listeners on `#timeline` | **2**, both from `setupSidebarNavigation` (app.js:187) |
| IntersectionObservers constructed | **6** — scroll spy x2 (18 targets each), reveals x2 (564 each), loading x2 (546 each) |
| `scrollIntoView` calls per chip click | **2**, same target |
| `load()` / `play()` calls for one video entering view | **2** and **2** |
| Trip chips built vs. trip elements observed by the spy | **3** vs. **0** |

Fixture ordering, which is R06 exactly as filed:

```
nav: spring-2022, spring-2022-paris, spring-2022-rome, summer-2022, summer-2022-lisbon, fall-2022
DOM: spring-2022-paris, spring-2022-rome, spring-2022, summer-2022-lisbon, summer-2022, fall-2022
```

### The selection metric is wrong, and that is what decides the design

`intersectionRatio` is intersection area divided by **target** area, so it rewards short targets. Caught mid-page in real content at 375px with PR #2's stylesheet applied:

| Section | Height | Occupies of the 497px band | `intersectionRatio` |
| --- | --- | --- | --- |
| `fall-2023` | 1450px | 238px | 0.1638 |
| `winter-2024` | 2476px | **279px** | **0.1128** |

`winter-2024` fills more of the activation band and scores lower, so the spy highlights `fall-2023`. These two differ in height by only 1.7x — this is the ordinary case, not a contrived one. Any fix that keeps ratio as the comparison key has to divide by root height instead, at which point the observer is doing arithmetic the scroll position gives directly.

### The threshold is a second, narrower defect

A target taller than `band / 0.1` can never reach the smallest threshold, and `isIntersecting` is derived from the threshold index, so such a section never reports as intersecting and can never take the highlight.

| Layout | Scrollport | Sections below the 0.1 threshold | Share of scroll extent |
| --- | --- | --- | --- |
| 1280px | 800px | **0 of 18** (lowest max ratio 0.149) | 0% |
| 375px, current `main` CSS | 740px | **1 of 18** | 22% |
| 375px, with PR #2's CSS | 621px | **1 of 18** — `summer-2024`, 130 cards, 6259px | 21% |

Scrolled into the middle of `summer-2024`, that section is the **only** thing in the activation band, filling 497 of 497px at ratio 0.0695 — and the active chip reads `Fall 2023`, two sections stale.

An earlier draft of this spec claimed the spy was inert on phones generally. That was inference from the R02 media measurement, and it is wrong: most sections clear the threshold at both widths, and desktop clears it everywhere. The defect is narrower than claimed and the ratio flaw above is the load-bearing one.

## Proposed behavior

### One registration

`render()` keeps the four setup calls. The duplicate block in the `.then()` handler is removed, leaving that handler responsible only for the failure path. Setup needs a built DOM, `render()` is where the DOM is built, and this is the smaller diff. No guard flags, no idempotence wrappers, no init registry.

### Trips follow their season

Append the season element, then that season's trip elements, as siblings inside `#content`. DOM order becomes season → its trips → next season, matching the order navigation already emits. Trips are not nested inside the season element: nesting would make every trip a descendant of an observed section and force the spy to disambiguate overlapping targets for no gain.

### Scroll spy driven by scroll position

Replace the IntersectionObserver with a scroll handler on `#content`, throttled with `requestAnimationFrame`.

Collect the season and trip elements in document order once per render. On each frame, the active target is the **last one whose top edge has passed the activation line**, where the activation line sits 25% down the scrollport. When the scroller is at its end, the last target wins regardless, so a short final section can always be reached. Nothing is active before the first target's top passes the line; the first target holds until the second arrives.

This is correct for targets of any height relative to the scrollport, needs no thresholds, and cannot go stale between callbacks, because it reads position rather than accumulating change notifications. It also removes an observer rather than adding state to one.

Run the same computation once after render so the correct chip is active before the reader scrolls, and register the listener as `passive`.

### What deliberately does not change

- `setupSidebarNavigation()` still writes `scrollSnapType` inline. Deduplicating its registration means one writer instead of two; it does not remove the write. The `!important` override that PR #2 adds to `styles/layout.css` therefore remains necessary, and the two changes do not interact.
- Nothing in `scripts/media.js` changes. The unguarded video `load()`/`play()` becomes unreachable once the observer is registered once, and video playback control is [R09](OPEN_ITEMS.md).
- No CSS changes. `.trip-section` has neither `min-height` nor `scroll-snap-align`, so on desktop mandatory snapping will skip past a trip that a chip navigates to. Real content has zero trips today, and `styles/layout.css` belongs to the open PR #2, so this is recorded as a follow-up rather than fixed here — see Boundaries.

## Acceptance criteria

1. Each chip click runs exactly one handler: one `scrollIntoView` call and one snap-restore timer.
2. Each media element is observed by exactly one loading observer, and each video receives exactly one `load()` and one `play()` attempt during a full page pass.
3. Reveal and scroll-spy setup each run once per render; the page has one scroll-spy mechanism, not two.
4. With a fixture containing multiple seasons and multiple trips per season, `#content` child order equals `#timeline` link order, element for element.
5. Clicking any chip — season or trip — scrolls to its target and leaves that chip active.
6. Scrolling forward and backward through the real 546-item content activates the chip for the section under the activation line, at 1280px and at 375px, including where sections are many screens tall.
7. Scrolling to the very bottom activates the last chip; the state before any scroll matches the first section.
8. No new console errors or warnings; `content.json` and `assets/` are unchanged; `node --test tests/*.test.js` still passes.

## Implementation context and style

Browser IIFE, no modules, no dependencies, two-space indent, semicolons, single quotes — matching the surrounding file.

`scripts/app.js` is not unit-testable as it stands: it is an IIFE that checks `sessionStorage` and calls `render()` on load, and the project has no DOM environment and adds no dependencies. Verification for this item is therefore runtime browser measurement against a fixture and against real content, using the method established in R02 — a same-origin iframe for viewport control, screenshot pulses to force rendering updates in a background tab, and short scripts to stay inside the CDP timeout. Automated coverage of `app.js` needs a DOM harness and stays with [R17](OPEN_ITEMS.md)/[R18](OPEN_ITEMS.md).

The trip fixture is a scratchpad `content.json` served locally. It is never written into the repository and the real manifest is hashed before and after.

## Boundaries and decisions

- Always: measure before rewriting, verify at both widths, keep the real manifest and assets untouched, and record evidence before closing the items.
- Discuss a scope change before: touching `styles/layout.css` or `scripts/media.js`, adding a dependency or DOM test harness, or altering the snap behavior itself.
- Never: regenerate content as a side effect, commit a fixture over `content.json`, or widen into R08/R09/R10.

### Follow-up this creates

`.trip-section` needs `scroll-snap-align` and a minimum height once trips exist. T4 measured this rather than predicting it: `#content` carries `scroll-snap-type: y mandatory`, `.section` has `scroll-snap-align: start` at `min-height: 800px`, and a fixture trip is 306px with `scroll-snap-align: none`. A trip between two full-height snap targets is not a resting scroll position, so navigating to one lands on the next season. With snap disabled every trip chip activates correctly, so the spy is right and the stylesheet is the blocker. R02 has since merged, so `styles/layout.css` is free and nothing blocks this. It is not urgent: content has zero trips.

A second follow-up: on the phone strip the active chip is not scrolled into view horizontally, so the highlight can sit off-screen. This could not arise before, because no chip activated at phone width. It needs a judgement call — scrolling the strip under the reader as they scroll content can feel jumpy — so it is recorded rather than guessed at.

### Noticed, not fixed

`escapeHtml` emits `&gt` without the closing semicolon (`scripts/app.js:213`). Browsers resolve the bare reference in text content, so nothing renders wrong today. It is a one-character correctness fix in a function this item only reads, and it is left for whoever owns escaping next.
