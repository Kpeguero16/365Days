# Implementation plan: R02

Status: complete, 2026-09-09. Contract: [SPEC-r02.md](../SPEC-r02.md). Execution checklist: [todo-r02.md](todo-r02.md).

## Approach

Append two `@media` blocks to the end of `styles/layout.css` and change nothing else. Appending matters: every mobile rule matches the specificity of the base rule it overrides, so the cascade resolves on source order. `.section .section-header` has to keep both classes, `.card .meta` both of its own, and so on. A rule written at lower specificity would silently lose.

The blocks are `max-width: 900px` (stack the navigation, adaptive columns, snap off) and `max-width: 520px` (phone padding and a fixed two-column grid). Nothing is restructured above 900px, so desktop verification is a comparison against `main` rather than a judgement call.

`styles/base.css` and `styles/effects.css` are not touched. `.section-title` at 28px lives in `effects.css` and reads fine on a phone.

Verification is a browser sweep, because that is the only thing that can close R02 — there is no test runner for CSS here, and `OPEN_ITEMS.md` explicitly marks R02's browser verification as pending. Measurements are read out of the live page rather than eyeballed from screenshots, so the evidence is numbers.

## Ordered slices

1. **T1: Stack the navigation.** The `max-width: 900px` block: single-column app grid, sidebar as a top strip, horizontal timeline, static music button, `#content` filling the remaining row. Verify no horizontal overflow and a reachable last season at 375px.
2. **T2: Adapt the gallery and turn off snap.** Section and trip padding, `auto-fill` columns, `min-height: 0`, and the `!important` snap override with its comment. Verify column counts and computed snap after a navigation click.
3. **Checkpoint A:** measure the full width sweep; confirm 901px and 1280px match `main`.
4. **T3: Phone refinements.** The `max-width: 520px` block: tighter padding, two columns, smaller meta. Verify 44px chips and readable captions at 375px.
5. **T4: Media, music and trips at 375px.** Confirm images lazy-load, a video plays, the music toggle works, and a trip fixture renders. Capture console output.
6. **Checkpoint B:** all acceptance criteria pass with recorded numbers; close R02 in `OPEN_ITEMS.md` with the evidence and note which sibling items remain open.

Slices are sequential; they edit one file.

## Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| An override loses on specificity and the phone silently keeps a desktop rule | Match the base selector exactly and append after it; verify by reading computed styles from the page, not by reading the stylesheet. |
| `min-height: 100vh` on `.app` survives and the body scrolls behind mobile browser chrome | Explicitly set `min-height: 0` alongside `height: 100dvh`; assert `documentElement.scrollHeight` against `innerHeight`. |
| The inline `scrollSnapType` written by `setupSidebarNavigation()` re-enables snap on a phone | `!important` in the media query, commented with why; verify computed snap *after* a nav click and a wait past the 1000ms timer, not on load. |
| Desktop changes as a side effect | Compare computed styles and screenshots at 901px and 1280px against `main` before and after. |
| `overflow-x: auto` on a grid item does not scroll | Give `.timeline` `min-width: 0`; verify `scrollWidth > clientWidth` and that scripted scrolling reaches the last chip. |
| Trip styling is unverifiable from real content | Serve a temporary fixture manifest from the scratchpad; never modify `content.json` or `assets/`. |
| Fixing adjacent problems noticed in passing | R06, R07, R08, R13, R14 and R18 stay open and untouched; note anything new in `OPEN_ITEMS.md` rather than fixing it. |

## Verification

Browser sweep at 375x667, 390x844, 700, 900, 901 and 1280 against a local `http.server`, plus `git diff --check`. Record overflow measurements, column counts, chip heights, computed snap values and console output per width. Deployment verification stays with R18.
