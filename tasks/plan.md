# Implementation plan: R01

Status: implemented and verified, 2026-09-09. Contract: [SPEC-r01.md](../SPEC-r01.md) (revision r02). Execution checklist: [todo.md](todo.md).

Prerequisite done: the scanner defects that R01's merge rules would have made permanent are fixed and [R05](../OPEN_ITEMS.md) is closed. This plan assumes a scanner that cannot emit an invalid date, misclassify a file by extension, or write a broken poster path.

## Approach

Keep one synchronous CommonJS generator with a short orchestration flow:

`read and validate → scan → reconcile and merge → stable sort → serialize → temporary write → rename → report success`

`generateManifest()` keeps zero-argument CLI behavior with `__dirname`-relative defaults, and takes optional `assetsDir`/`outputFile` arguments for fixtures. The pure `buildManifest()` already exists and returns a manifest plus a report without writing; tests and dry runs use it. Avoid a generic storage abstraction or separate service layer.

Match in two passes: a `Map` keyed by exact `src`, then an unambiguous-basename pass over the leftovers so moved and renamed assets keep their metadata. Drop and report anything still unmatched; never abort on a missing asset. Apply generated defaults, then existing own properties, then authoritative scanned `src`, `type`, and `fileSize`. Omit inapplicable defaults rather than emitting `null`, and hold the documented key order — this is what keeps the first run byte-identical. Reject type mismatches and unmatched old paths before any write. Preserve poems and top-level extensions.

Write a uniquely named sibling temporary file with exclusive creation and replace using rename only after a successful close. Use narrowly scoped filesystem injection for deterministic failure tests rather than relying on platform permission behavior. Report errors at the CLI boundary with sanitized diagnostics that never quote manifest content; imported callers receive exceptions.

## Ordered slices

1. **T1: Reject unsafe existing input.** Establish temporary fixtures and failing regression tests, then implement validation, sanitized diagnostics, and CLI failure behavior.
2. **T2: Merge curated metadata.** Add failing preservation, identity, moved-asset recovery, ambiguity, drop-reporting, byte-identical-first-run, and idempotency tests, then implement two-pass reconciliation and deterministic ordering.
3. **Checkpoint A:** T1–T2 focused tests pass; review field precedence, absent-value representation, and recovery/drop reporting against the spec.
4. **T3: Replace output safely.** Add failure injection tests, implement sibling temporary-file replacement with cleanup, and add the temporary-file pattern to `.gitignore`.
5. **T4: Document and verify the complete workflow.** Exercise the CLI from another working directory, confirm real content is untouched, update usage/rules, and record evidence.
6. **Checkpoint B:** All acceptance criteria pass; review the diff, then close R01 with evidence.

Tasks are sequential because they share the generator and its tests. No parallel agent work is needed. Detailed acceptance criteria and file counts live in `todo.md`.

## Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| Existing generated fields are indistinguishable from authored fields | Preserve existing editorial properties by default; only refresh explicitly scanner-owned fields. |
| Renames/deletions discard metadata | Recover by unique basename; drop and report the rest. Git provides the undo. |
| Merge silently rewrites every item | Assert a byte-identical first run against a copy of the real manifest, not only tool-vs-itself idempotence. |
| Diagnostics leak personal text | Never forward `JSON.parse` messages; assert a marker in malformed input never reaches output. |
| Tests accidentally target personal content | Temporary fixture roots, child-process CLI fixture copies, and before/after hashes of the real manifest. |
| Merge hides duplicate paths or type changes | Validate before creating output. |
| Failed write truncates valid JSON | Exclusive sibling temporary file, close, rename, and tested cleanup. |
| Orphan temporary file reaches the live site | Deterministic naming plus a `.gitignore` entry. |
| Atomic replacement mistaken for concurrency protection | Document single-writer operation; rename is the commit point. Concurrency and power-loss durability are out of scope. |

## Verification

Run `node --test tests/generate-manifest.test.js`, syntax checks for generator/tests, and `git diff --check`. Exercise success and failure through the actual CLI in fixtures. Confirm repeated output is byte-identical and failure output preserves the previous bytes. Record real-manifest hashes before/after and confirm no `assets/` diff. No real manifest regeneration, browser work, deployment, or dependency installation is part of this plan.

All of these were run. `node --test tests/generate-manifest.test.js` reports 34 passing tests. A dry run against the real collection reproduced `content.json` byte-for-byte, and a hand-edited caption and trip survived a real regeneration.
