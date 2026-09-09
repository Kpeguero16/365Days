# R03/R04 implementation checklist

Status: complete, 2026-09-09 (branch `r03-season-boundaries`). R03 and R04 both closed. Follow [the specification](../SPEC-r03.md) and [plan](plan-r03.md). Unchecked boxes describe work not yet started.

## T1 — Prove both defects with failing tests

- [x] Add `tests/content.test.js`: load `scripts/content.js` via `node:vm` with a stub `window`, exercise `window.ContentAPI.groupBySeason`.
- [x] Failing case for R03: December of year Y must not share a section with January of year Y; a fixture spanning 2021-09 to 2025-09 must produce sections in strict chronological order.
- [x] Failing case for R04: `2025-03-01`, `2025-01-01`, `2024-12-01`, `2024-06-01` and `2024-09-01` must give the same season in `America/New_York`, `UTC`, `Asia/Tokyo` and `Pacific/Kiritimati`.
- Acceptance: both groups fail against the current code, each for the reason the specification states, not incidentally.
- Verify: `node --test tests/content.test.js`; record the failure output before writing any fix.
- Dependencies: none.
- Files: `tests/content.test.js` (small, 1 file).

**Result.** Six tests, all failing against the current `scripts/content.js`, each for the reason the specification gives rather than incidentally:

| Test | Failure |
| --- | --- |
| December does not share a section with the same year January | `January and December of 2022 share section "Winter 2022"` |
| December groups with the following January and February | `one winter spans Dec 2021 to Feb 2022` — two sections where one is expected |
| Sections run in strict chronological order | `rendered order is not chronological across sections` |
| No section spans more than three months | `section "Winter 2021" spans 12 months: 2021-01-15, 2021-02-15, 2021-12-15` |
| Season assignment is identical in every timezone | `2025-03-01: Asia/Tokyo gives "Winter 2025" but America/New_York gives "Spring 2025"` |
| `2025-03-01` is Spring 2025 regardless of zone | `wrong season in Asia/Tokyo` |

The 12-month span in the fourth message is the R03 defect stated as plainly as it can be: one section holding January, February and December of the same year.

`scripts/content.js` is unchanged; the loader reaches it through `node:vm` and a stub `window`, driving only the public `groupBySeason`.

## T2 — Rewrite getSeason()

- [x] Read year and month from the `YYYY-MM-DD` string with a regex; construct no `Date`.
- [x] December takes `Winter Y–YY+1`; January and February take `Winter Y-1–YY`. Spring, Summer and Fall unchanged.
- [x] A date that does not match the expected shape falls back to the `2021-09-11` default rather than producing `NaN`.
- Acceptance: every T1 test passes; item order within a section and trip grouping are unchanged.
- Verify: `node --test tests/content.test.js`, `node --check scripts/content.js`.
- Dependencies: T1.
- Files: `scripts/content.js` (small, 1 file).

**Result.** All six tests pass. They still fail 6/6 against the original `getSeason()`, checked by stashing only `scripts/content.js` and re-running, so they discriminate rather than merely agreeing with the new code.

One test-infrastructure fix was needed along the way, and it was not a defect in the source: `groupBySeason` returns arrays built inside the `vm` realm, whose prototype is not the test realm's `Array.prototype`, and `deepStrictEqual` compares prototypes. Two assertions reported "same structure but are not reference-equal". The helper now copies results across the boundary with `Array.from` before asserting.

Month values outside 1-12 are treated as malformed even though they match the `YYYY-MM-DD` shape, so `2024-13-01` cannot become a season.

The en dash is written `\u2013` rather than as a literal character, so the label cannot depend on how a server labels this file's charset. `python3 -m http.server` sends no charset for `.js`.

Item order within a section and trip grouping are unchanged: a mixed fixture gave `Winter 2021-22: items=[c@2022-01-15, a@2022-02-10] trips=Paris[b@2021-12-06, d@2022-01-20] Rome[e@2022-01-18]` - items date-ascending, trips separated and each date-ascending.

## Checkpoint A

- [x] Boundary table complete: 12-01, 12-31, 01-01, 02-28, 02-29 on a leap year, 03-01, 05-31, 06-01, 08-31, 09-01, 11-30, and both year edges.
- [x] No label or section id contains `NaN`; ids are unique across every label the real content produces.
- [x] `scripts/app.js`, `styles/`, `content.json` and `assets/` unchanged.

**Boundaries.** `2023-11-30` Fall 2023 | `2023-12-01` Winter 2023-24 | `2023-12-31` Winter 2023-24 | `2024-01-01` Winter 2023-24 | `2024-02-28` Winter 2023-24 | `2024-02-29` Winter 2023-24 | `2024-03-01` Spring 2024 | `2024-05-31` Spring 2024 | `2024-06-01` Summer 2024 | `2024-08-31` Summer 2024 | `2024-09-01` Fall 2024 | `2024-11-30` Fall 2024 | `2024-12-01` Winter 2024-25 | `2024-12-31` Winter 2024-25 | `2025-01-01` Winter 2024-25 | `2025-02-28` Winter 2024-25 | `2025-03-01` Spring 2025. Every season edge and both year edges land where the specification says.

**Malformed input.** `""`, `null`, `undefined`, `"not-a-date"`, `"2024-13-01"`, `"2024-00-15"`, `"20240101"` and `"2024-1-1"` all resolve to `Fall 2021`, the default date's season. No `NaN` reaches a label or an id.

**Real content.** Regrouping all 546 items gives 17 sections and 17 unique ids, no `NaN`. The full section table is T3.

## T3 — Verify against the real manifest

- [x] Regroup all 546 items and compare against the expected section table: 17 sections, strict chronological order, no section spanning more than three months.
- [x] Confirm the 19 previously misplaced December items now sit after that year's Fall.
- Acceptance: output matches the specification's section table exactly, including counts.
- Verify: a read-only script over `content.json`; confirm the file's hash is unchanged afterwards.
- Dependencies: T2.
- Files: none in the repository; script lives in the scratchpad.

**Result.** 17 sections, all 546 items regrouped, chronological across sections, and no section wider than three months. Counts match the specification's predicted table exactly.

| Section | n | Range | Span |
| --- | --- | --- | --- |
| Fall 2021 | 19 | 2021-09-17 .. 2021-11-25 | 3mo |
| Winter 2021-22 | 12 | 2021-12-06 .. 2022-02-25 | 3mo |
| Spring 2022 | 8 | 2022-03-05 .. 2022-05-22 | 3mo |
| Summer 2022 | 11 | 2022-06-05 .. 2022-08-27 | 3mo |
| Fall 2022 | 49 | 2022-09-03 .. 2022-11-18 | 3mo |
| Winter 2022-23 | 9 | 2022-12-04 .. 2023-02-18 | 3mo |
| Spring 2023 | 21 | 2023-03-04 .. 2023-05-22 | 3mo |
| Summer 2023 | 9 | 2023-06-03 .. 2023-08-11 | 3mo |
| Fall 2023 | 26 | 2023-09-01 .. 2023-11-18 | 3mo |
| Winter 2023-24 | 24 | 2023-12-08 .. 2024-02-28 | 3mo |
| Spring 2024 | 26 | 2024-03-11 .. 2024-05-24 | 3mo |
| Summer 2024 | 130 | 2024-06-20 .. 2024-08-18 | 3mo |
| Fall 2024 | 33 | 2024-09-03 .. 2024-11-16 | 3mo |
| Winter 2024-25 | 49 | 2024-12-24 .. 2025-02-27 | 3mo |
| Spring 2025 | 15 | 2025-03-16 .. 2025-05-30 | 3mo |
| Summer 2025 | 69 | 2025-06-11 .. 2025-08-23 | 3mo |
| Fall 2025 | 36 | 2025-09-01 .. 2025-09-11 | 1mo |

The 19 December items R03 misplaced now sit in the winter immediately after that year's Fall: 2022-12 (5 items) in `Winter 2022-23` at index 5 against `Fall 2022` at 4; 2023-12 (4) in `Winter 2023-24` at 9 against 8; 2024-12 (10) in `Winter 2024-25` at 13 against 12.

`content.json` hashed `aa49f47e6a6c8ec8` before and after the regroup; the script only reads it.

## T4 — Browser and documentation

- [x] Serve locally and check the timeline at 1280 and 375: chronological order, navigation targets resolve, console clean.
- [x] Close R03 and R04 in `OPEN_ITEMS.md` with evidence; note the season/date coverage now added against R17 and that its remaining gaps stay open.
- Acceptance: every acceptance criterion in the specification has a recorded result.
- Verify: browser console; `git diff --check`; final diff limited to `scripts/content.js`, `tests/content.test.js` and the R03 documents.
- Dependencies: T3.
- Files: `OPEN_ITEMS.md`, `AGENTS.md` (small, 2 files).

**Browser.** 17 sections and 17 nav chips at both 1280 and 375. Chip text matches the section titles exactly; zero unresolved `href`s; ids unique with no `NaN`; first date per section strictly ascending from Sep 17 2021 to Sep 1 2025. `Winter 2022-23` reads Dec 4 2022 through Feb 18 2023 in order, and `Winter 2024-25` reads Dec 24 2024 through Feb 27 2025 — continuous winters across the year boundary, which is the point of R03. The en dash renders correctly from the `\u2013` escape. Zero console errors and zero warnings; the log itself shows the change, `Groups created: Array(18)` from the cached previous code and `Array(17)` on every load after.

At 375 the layout is the pre-R02 desktop layout, because the mobile CSS lives on `r02-mobile-layout` and this branch is cut from `main`. Section grouping and navigation are layout-independent and were verified on their own terms.

**Documentation.** `AGENTS.md` gains the content test command and the winter-label rule, and its claim that "nothing outside `tools/generate-manifest.js` has tests" is corrected. R17 is updated: season and date boundaries are now covered, content error handling still is not and belongs with R10.

**One correction.** `node --test tests/` was documented first and does not work — Node 24 treats the argument as a module path and fails with `MODULE_NOT_FOUND`. Caught by running it. The working form, `node --test tests/*.test.js`, is documented instead along with the reason, and all three commands were then run: 34 generator tests, 6 content tests, 40 together, all passing.
