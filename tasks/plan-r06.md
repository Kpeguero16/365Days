# Implementation plan: R06, R07, R11

Status: proposed, 2026-09-09. Contract: [SPEC-r06.md](../SPEC-r06.md). Execution checklist: [todo-r06.md](todo-r06.md).

Branch `r06-render-lifecycle`, cut from `main`. Touches `scripts/app.js` only, which neither open PR modifies, so this work is independent of the review outcome on PR #2 and PR #3.

## Approach

The whole change is confined to the setup step of one file. Work in dependency order, smallest and most certain first:

`measure what is actually happening → register once → fix append order → replace the spy → document and close`

Deduplication comes first because it is a deletion, it is provably correct by reading the code, and every later measurement is cleaner once observers are not racing. Append order is next because it is three lines and unblocks the trip half of the spy work. The scroll spy is last because it is the only genuine rewrite, and by then it runs alone against a DOM whose order is correct.

The spy stops being an IntersectionObserver. Sections here are routinely ten times the height of the scrollport, which puts them below the smallest ratio threshold, so the observer delivers no callbacks for exactly the elements the spy exists to track. A `requestAnimationFrame`-throttled scroll handler on `#content` reads element tops against an activation line instead. It is fewer lines than what it replaces, has no threshold tuning, and cannot hold stale state.

No abstraction is introduced. No init registry, no guard flags, no observer manager.

## Ordered slices

1. **T1: Measure the current behavior.** Build the trip fixture, count listeners, observers, and video `load()` calls, and record the real intersection ratios at 1280px and 375px. No production edits — this is the evidence that the fixes are aimed at something real.
2. **T2: Register once (R07).** Delete the duplicate setup block from the `.then()` handler. Re-run T1's counts.
3. **Checkpoint A:** counts are exactly one across the board; nothing else changed behavior.
4. **T3: Order trips with their season (R06).** Append the season before its trips. Assert `#content` order equals `#timeline` order against the fixture.
5. **T4: Replace the scroll spy (R11, R06).** Scroll-position tracking over seasons and trips, with initial state and passive listener.
6. **Checkpoint B:** all acceptance criteria pass at both widths against real content and the fixture.
7. **T5: Document and close.** Record evidence in `OPEN_ITEMS.md`, close R06/R07/R11, and note the `.trip-section` snapping follow-up against PR #2.

Sequential — every slice edits the same forty lines.

## Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| The threshold analysis is reasoning, not measurement, and the desktop case is untested | T1 measures real ratios at both widths before T4 rewrites anything. If desktop ratios clear 0.1 comfortably the rewrite is still correct, but the spec's phone claim gets a number instead of an inference. |
| A background tab reports no IntersectionObserver activity and no smooth scrolling, which reads as a defect | Screenshot pulses force rendering updates. This produced a false tracker item during R02; do not report a runtime finding measured in a hidden tab. |
| The activation line is a taste choice that only shows up in feel | Verify the intended chip at both widths scrolling in both directions, and at the top and bottom extremes, rather than judging from one screenshot. |
| A scroll handler runs on every frame of a 546-card page | `requestAnimationFrame` throttle, `passive` listener, and a target list collected once per render rather than re-queried per frame. |
| The fixture is mistaken for content | Fixture lives in the scratchpad and is served from there; hash the real `content.json` before and after. |
| Deduplication silently removes something that was load-bearing | T2 is a pure deletion of calls that are made identically thirty lines earlier; Checkpoint A confirms the page still renders, reveals, lazy-loads, navigates and highlights. |

## Verification

Runtime browser measurement, using the R02 method: same-origin iframe for viewport control, screenshot pulses, short scripts, and computed values read from the live page rather than judged from screenshots. `node --test tests/*.test.js` must still pass, though no test in it covers `app.js` — a DOM harness for that belongs to R17/R18.
