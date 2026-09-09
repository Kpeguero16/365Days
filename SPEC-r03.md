# R03/R04: Correct season boundaries

Status: specified, awaiting approval. No code has been changed.
Tracker: [R03 and R04](OPEN_ITEMS.md). Plan: [tasks/plan-r03.md](tasks/plan-r03.md). Checklist: [tasks/todo-r03.md](tasks/todo-r03.md).

R03 and R04 are specified together because both are defects in the same six-line `getSeason()` in `scripts/content.js`, and R03 cannot be fixed without rewriting the lines R04 is about.

## Objective

Every memory appears in the season it belongs to, in chronological order, and the same date produces the same season on every machine.

## What is broken

```js
function getSeason(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');   // local midnight
  const m = d.getUTCMonth() + 1;               // read back as UTC
  const y = d.getUTCFullYear();
  if ([12,1,2].includes(m)) return `Winter ${m===12?y:y}`;   // both branches are `y`
  ...
```

**R03 — winter spans a year, the label does not.** `m===12?y:y` returns `y` whichever branch is taken, so December of year Y is labelled `Winter Y`, the same label January and February of year Y produce. The two ends of the same calendar year land in one section. `groupBySeason()` then orders sections by their earliest date, so the section sorts on its January date and its December items render roughly nine months early.

Against the current 546 items, three sections are affected and 19 December items are misplaced:

| Section | Months it actually contains | December items | Rendered before |
| --- | --- | --- | --- |
| `Winter 2022` | 2022-01, 2022-02, **2022-12** | 5 | Spring 2022, Summer 2022 |
| `Winter 2023` | 2023-01, 2023-02, **2023-12** | 4 | Spring 2023, Summer 2023 |
| `Winter 2024` | 2024-01, 2024-02, **2024-12** | 10 | Spring 2024, Summer 2024 |

`Winter 2021` holds only December 2021, so it happens to sort correctly today; its label is still inconsistent with the sections around it.

**R04 — local parsing, UTC readback.** `new Date('2025-03-01T00:00:00')` is local midnight; `getUTCMonth()` then reads it in UTC. East of UTC every date shifts back a day, and any first-of-month date falls into the previous season.

| Timezone | `2025-03-01` | `2025-01-01` | `2024-12-01` | `2024-06-01` |
| --- | --- | --- | --- | --- |
| America/New_York | Spring 2025 | Winter 2025 | Winter 2024 | Summer 2024 |
| UTC | Spring 2025 | Winter 2025 | Winter 2024 | Summer 2024 |
| Asia/Tokyo | **Winter 2025** | **Winter 2024** | **Fall 2024** | **Spring 2024** |
| Pacific/Kiritimati | **Winter 2025** | **Winter 2024** | **Fall 2024** | **Spring 2024** |

`2025-01-01` crossing into `Winter 2024` shows the year boundary is affected too, not only the month.

## Proposed behavior

Read the year and month directly out of the `YYYY-MM-DD` string. No `Date` object takes part in season assignment, so there is no timezone to be wrong about.

| Months | Season |
| --- | --- |
| December Y, January Y+1, February Y+1 | `Winter Y–YY+1`, for example `Winter 2021–22` |
| March, April, May | `Spring Y` |
| June, July, August | `Summer Y` |
| September, October, November | `Fall Y` |

The winter label carries both years because a winter genuinely spans them. `Winter 2021–22` is unambiguous from either end: a December 2021 photo and a February 2022 photo are both findable by whichever year the viewer remembers. The alternatives — labelling the whole winter with the earlier or the later year alone — each put one end of the season under a year it did not happen in.

The separator is an en dash, and the second year is two digits: `Winter 2021–22`, not `Winter 2021–2022`. `cssId()` in `scripts/app.js` reduces it to `winter-2021-22`; the resulting ids were checked for collisions against the other labels and are unique.

### Resulting section order

```
Fall 2021       2021-09 .. 2021-11    19
Winter 2021–22  2021-12 .. 2022-02    12
Spring 2022     2022-03 .. 2022-05     8
Summer 2022     2022-06 .. 2022-08    11
Fall 2022       2022-09 .. 2022-11    49
Winter 2022–23  2022-12 .. 2023-02     9
...
Winter 2024–25  2024-12 .. 2025-02    49
Spring 2025     2025-03 .. 2025-05    15
Summer 2025     2025-06 .. 2025-08    69
Fall 2025       2025-09               36
```

Seventeen sections rather than eighteen: `Winter 2021` and `Winter 2022` merge into `Winter 2021–22`, and each later winter absorbs the previous December.

### Malformed dates

`groupBySeason()` already substitutes `2021-09-11` for a missing date. A date that is present but does not match `YYYY-MM-DD` currently yields `Fall NaN` and a section id of `fall-nan`. It will instead fall back to the same default, so no run can produce a `NaN` section. This is a small robustness change rather than a new feature; R10 owns error states properly and may revisit it.

## Acceptance criteria

1. December groups with the following January and February, never with the same year's January and February.
2. Against the real 546 items, sections render in strict chronological order, and no section contains dates more than three months apart.
3. `2025-03-01` is `Spring 2025` in `America/New_York`, `UTC`, `Asia/Tokyo` and `Pacific/Kiritimati`. So is every other probe, in every zone.
4. Every month boundary and every season boundary is covered by a test, including 12-01, 12-31, 01-01, 02-28, 02-29 in a leap year, 03-01, 05-31, 06-01, 08-31, 09-01 and 11-30.
5. No season label or section id contains `NaN`.
6. Section ids stay unique across all labels the real content produces.
7. Item order within a section is unchanged, and trip grouping is unchanged.
8. In a browser at desktop and 375px, the timeline reads chronologically, navigation targets resolve, and there are no console errors.

## Commands and testing

`scripts/content.js` is a browser IIFE that assigns `window.ContentAPI`; it is not a module. Tests will load the source with `node:vm` against a stub `window` and exercise the public `groupBySeason`, which is how the application reaches this code. No change to `scripts/content.js`'s shape, no build tooling, no dependencies.

- `node --test tests/content.test.js`
- Timezone cases run by setting `process.env.TZ` around the calls, and by a child process per zone so the first `Date` use cannot cache a zone.
- `node --check scripts/content.js`, `git diff --check`.
- Browser check against `python3 -m http.server`, at 1280 and 375 wide.

This satisfies part of [R17](OPEN_ITEMS.md), which asks for season and date boundary coverage.

## Boundaries

`scripts/app.js`, `styles/`, `content.json`, `assets/` and the generator are untouched. R06 (trip ordering), R07 (duplicate observers), R10 (error states) and R11 (scroll spy) stay open. The hardcoded `Autumn 2021` sample in `scripts/app.js` is a separate fallback path and is not part of this change.
