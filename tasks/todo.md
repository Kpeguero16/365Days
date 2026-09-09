# R01 implementation checklist

Status: complete, 2026-09-09. All slices implemented and verified. Follow [the specification](../SPEC-r01.md) (revision r02) and [plan](plan.md). All boxes describe future implementation work.

Prerequisite complete: scanner correctness (R05) is fixed and closed, so R01 will not preserve generated mistakes.

## T1 — Reject unsafe existing input

- [x] Add temporary fixture tests, observe the invalid-input regression failures, and implement validation with nonzero CLI failures.
- [x] Implement sanitized diagnostics: report path plus parser offset/line/column, never the `JSON.parse` message text.
- Acceptance: missing manifest succeeds; invalid JSON/root/items/known fields, duplicate manifest `src` values, unsupported types, and read/scan failures preserve original bytes; a distinctive marker inside malformed input never appears on stdout or stderr.
- Verify: `node --test tests/generate-manifest.test.js`; assert child-process exit status, byte-for-byte unchanged output on failures, and marker absence in captured output.
- Dependencies: none.
- Files: `tools/generate-manifest.js`, `tests/generate-manifest.test.js` (small, 2 files).

## T2 — Preserve metadata by exact asset path

- [x] Add failing merge tests, then implement the spec's precedence rules, two-pass matching, and deterministic ordering.
- [x] Cover asset recovery: a file moved into a trip directory keeps its metadata and updates `src`; an unambiguous rename follows; a deleted file drops its entry; two same-basename files are ambiguous and drop. Every recovery and drop appears in the report.
- [x] Assert a byte-identical first run against a copy of the current real manifest — absent values omitted not nulled, fixed key order, equal-date order preserved.
- Acceptance: matched metadata, empty values, unknown properties, poems, and top-level extensions survive; new assets get defaults and current file sizes; duplicate basenames remain distinct; type conflicts abort; missing assets recover or drop with a report; no run needs a manual edit; repeated runs are byte-identical.
- Verify: `node --test tests/generate-manifest.test.js`; use image/video/poem fixtures with edited dates, custom posters/trips, nested metadata, and renamed/removed assets.
- Dependencies: T1.
- Files: `tools/generate-manifest.js`, `tests/generate-manifest.test.js` (small, 2 files).

## Checkpoint A

- [x] Focused tests pass and all precedence/identity decisions match the spec.
- [x] Confirm the real manifest/assets are unchanged.
- [x] Confirm no test path requires a manual edit to `content.json` to make a run succeed.

## T3 — Replace the manifest safely

- [x] Add failing filesystem fault tests, then implement exclusive sibling temporary-file writing, successful close before rename, and scoped cleanup.
- [x] Add `content.json.tmp-*` to `.gitignore`.
- Acceptance: write/close/rename failures preserve original bytes; first-run failure leaves no destination; success produces complete JSON and removes the temporary file; cleanup errors preserve the original diagnostic and identify leftovers.
- Verify: `node --test tests/generate-manifest.test.js`; inject failures deterministically and inspect destination/temp-file state.
- Dependencies: T2 and Checkpoint A.
- Files: `tools/generate-manifest.js`, `tests/generate-manifest.test.js`, `.gitignore` (small, 3 files).

## T4 — Document and verify end to end

- [x] Complete CLI fixture checks and update content-management instructions and verification commands.
- Acceptance: default command works from a different working directory in a fixture copy; documentation explains preservation, failure behavior, and explicit rename/removal reconciliation; evidence covers all spec criteria without regenerating real content.
- Verify: `node --test tests/generate-manifest.test.js`, `node --check tools/generate-manifest.js`, `node --check tests/generate-manifest.test.js`, `git diff --check`; compare real-manifest hashes and inspect `git diff -- content.json assets`.
- Dependencies: T3.
- Files: `tests/generate-manifest.test.js`, `README.md`, `AGENTS.md`, `OPEN_ITEMS.md` (medium, 4 files). Update this checklist with execution evidence as work finishes.

## Checkpoint B — Completion

- [x] Every spec acceptance criterion is covered and passing; record command results and limitations.
- [x] Review the final change for correctness, data preservation, and scope; no browser/deployment verification is claimed.
- [x] Mark R01 complete in `OPEN_ITEMS.md` with fix and verification references; keep unrelated items open.
