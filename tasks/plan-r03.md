# Implementation plan: R03/R04

Status: awaiting approval of the specification. Contract: [SPEC-r03.md](../SPEC-r03.md). Execution checklist: [todo-r03.md](todo-r03.md).

## Approach

Replace the body of `getSeason()` in `scripts/content.js` with a regex read of the `YYYY-MM-DD` string. Year and month become numbers directly, no `Date` object is constructed, and the timezone question disappears rather than being answered. Everything else in the file stays as it is: `groupBySeason()` already orders sections by their earliest date, which is correct once the grouping is.

Tests come first, because both defects are reproducible from data alone and the fix is small enough that a test written afterwards would be written to match the code.

`scripts/content.js` is a browser IIFE, so the test loads the file with `node:vm` against a stub `window` and drives the public `groupBySeason`. That keeps the source unchanged — no dual export, no module wrapper, no bundler — and tests the same entry point the application uses.

Timezone coverage runs the same assertions in four zones. `process.env.TZ` is set inside the test for the fast path, and a child process per zone guards against a cached zone from the first `Date` use in the process. After the fix no `Date` participates in season assignment, so these tests assert an invariant rather than a workaround.

## Ordered slices

1. **T1: Prove both defects.** Add `tests/content.test.js` with failing cases: December grouping, section chronology against a fixture mirroring the real month distribution, and the four-timezone probes. Confirm they fail against the current code for the stated reasons.
2. **T2: Rewrite `getSeason()`.** String-based year/month, span label for winter, malformed-date fallback. Tests go green.
3. **Checkpoint A:** boundary table complete — every month and season edge, leap day, year edges. Confirm ids stay unique and `NaN` cannot appear.
4. **T3: Verify against the real manifest.** Regroup all 546 items, confirm 17 sections in strict chronological order, no section spanning more than three months, and the 19 misplaced December items now in the right place. `content.json` is read, never written.
5. **T4: Browser and documentation.** Check the timeline at 1280 and 375, confirm navigation targets resolve and the console is clean, then close R03 and R04 with evidence and note the R17 coverage added.

## Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| The new label breaks `cssId()` or collides with another id | Assert uniqueness across every label the real content produces; en dash reduces to `-`. |
| A test passes because it was written to match the implementation | Write and run the tests before the fix, and record that they failed for the right reason. |
| Timezone tests silently pass because Node cached a zone | One child process per zone in addition to in-process `process.env.TZ`. |
| Loading a browser IIFE under test diverges from browser behaviour | Drive the public `groupBySeason` through the same `window.ContentAPI` surface the app uses; do not reach into internals. |
| Malformed-date handling quietly expands scope | Limit it to removing `NaN`; leave real error states to R10 and say so. |
| Fixing adjacent problems noticed in passing | R06, R07, R10 and R11 stay open and untouched. |

## Verification

`node --test tests/content.test.js`, `node --check scripts/content.js`, `git diff --check`, a regroup of the real 546 items compared against the expected section table, and a browser pass at two widths. `content.json` and `assets/` are read-only throughout.
