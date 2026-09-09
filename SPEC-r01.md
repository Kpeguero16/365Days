# R01: Preserve manifest metadata safely

Status: implemented and verified, 2026-09-09. `tools/generate-manifest.js` and `tests/generate-manifest.test.js` satisfy every acceptance criterion below.
Revision r02, 2026-09-09: revised after an adversarial review of r01 (single-model plus cross-model). The scanner defects that review exposed were fixed first — see [R05](OPEN_ITEMS.md), now closed — so this specification no longer has to work around them.
Tracker: [R01](OPEN_ITEMS.md). Plan: [tasks/plan.md](tasks/plan.md). Checklist: [tasks/todo.md](tasks/todo.md).

## Objective

The site owner can add assets and regenerate `content.json` without losing curated captions, corrected dates, trip assignments, poems, or other existing metadata. Invalid input or a failed write must leave the previous manifest byte-for-byte intact.

Today `tools/generate-manifest.js` retains only poems, rebuilds media records, and writes directly over the manifest. It also continues after a parse failure. R01 replaces that behavior with validation, merging, and safe replacement.

### What this protects, and when

All 546 captions, dates, and IDs in `content.json` are machine-derived, and no item carries a `trip` or `poster`. Captions are readable capture times such as `4:52 PM`.

**The owner has stated they will hand-edit `content.json` when a photo deserves a real caption.** The generator currently overwrites every caption on each run, so that workflow is unsafe until R01 lands. This raises R01 from preventive to blocking: the first hand-written caption is at risk from the next regeneration, and the owner has no other place to put it. Until R01 is implemented, the only protection is to commit before regenerating and to read the diff.

R01 is therefore the prerequisite for captioning the site at all, not a tidiness exercise.

This also sets the priority order deliberately: the scanner was corrected first, while a full regeneration was still free, so that R01 does not freeze machine-generated mistakes into place as though they were authored.

## Prerequisite completed: scanner correctness

R01's merge rules preserve whatever the scanner once wrote. That makes scanner defects permanent, because a preserved field is never regenerated. The following were fixed in `tools/generate-manifest.js` before this specification was finalized:

| Defect | Previous behavior | Now |
| --- | --- | --- |
| Extension handling | Every non-excluded file became `type: "image"` — `.HEIC`, `.AAE`, `.txt`, `.ico` included | Explicit image/video allowlists; unsupported files are skipped and reported |
| Uppercase extensions | `path.basename(name, ext)` was passed a lowercased suffix, so `.JPG`/`.MOV`/`.PNG` stayed in the derived name, producing captions like `"13 01 36.JPG"` and IDs like `2021_11_06_13_01_36_JPG` | The extension as spelled on disk is stripped |
| Filename dates | `\d{4}-\d{2}-\d{2}` is a shape check, so `2024-13-45` was emitted as a date | Calendar-validated; invalid dates fall back to the default and warn |
| Trip derivation | `assets/images/Paris/` produced trip `images` | Produces `Paris`; segments below the media bucket become the trip |
| Poster paths | Emitted one directory too high (`assets/clip_poster.jpg`) and 404'd | Emitted beside the video; several poster extensions are matched |
| Poster files | Also appeared as standalone gallery cards | Excluded from item output |
| Undated items | The `NaN` comparator left *other* dated items unsorted | Total order: undated items first, ties keep input order |
| URL-unsafe names | `day#1.jpg` was emitted and truncated at `day` when fetched | Skipped with a rename warning |

Regenerating with the corrected scanner changes 384 IDs and 384 captions and nothing else — no items added, dropped, re-dated, or resized.

## Proposed behavior

### Identity and merge rules

Match existing image/video entries to scanned assets by exact, case-sensitive `src` string, such as `assets/images/2025-06-01.JPG`. Do not match by generated ID or basename: different directories can contain the same filename. Do not infer renames, lowercase paths, or introduce path aliases.

| Data | Result |
| --- | --- |
| Matched media `src`, `type`, `fileSize` | Use current scan values; reject an existing/scanned type mismatch before writing. |
| Matched media `id`, `date`, `caption`, `trip`, `poster`, and unknown properties | Preserve every existing own property; use generated defaults only for properties absent from the existing object. Empty strings are intentional values, not missing data. |
| New media | Use current scanner output. |
| Poems | Preserve each complete object, including unknown properties; never require a media path. |
| Unknown top-level properties | Preserve alongside the updated `items` array. |
| Previously listed media absent from scan | Try to recover it by unique basename (see below). If that fails, drop the entry and report it. Never abort, and never require a hand edit. |

Keep the existing oldest-first date sorting and two-space JSON formatting. Sorting uses merged dates. Do not add timestamps.

#### Recovering moved assets

The owner must never edit `content.json` by hand to make a regeneration succeed. Reorganising photos is a normal action, not an error.

Match in two passes. The first pass matches an existing entry to a scanned asset by exact, case-sensitive `src`. The second pass takes the entries that did not match and tries their basename against the scanned assets that did not match. This follows a file that **moved** between directories; a file renamed to a different basename cannot be followed without hashing, which stays out of scope. A basename match is accepted **only when it is unambiguous** — exactly one unmatched scanned asset carries that basename. The entry then adopts the new `src` and keeps every other field.

This makes the common workflows work without intervention:

| The owner does this | Result |
| --- | --- |
| Moves `2025-06-01.JPG` into `assets/images/Paris/` to make a trip | The entry follows the file. The caption and date survive. The `trip` field updates. |
| Renames a file to a different name | Not recoverable: the basename is the identity. The entry is dropped and reported, and the file appears as new. |
| Deletes a photo | The entry is dropped and named in the run report. |
| Moves two files with the same basename into different directories | Ambiguous. Both entries are dropped and named in the report. |

A scan that returns no media at all, while the manifest records media, aborts instead: that is a wrong or unmounted directory, not a deliberate mass deletion. Report every recovery and every drop by path. A drop is not silent, and `content.json` is tracked in git, so an unwanted drop is visible in the diff and recoverable with `git checkout`. This replaces backup rotation; do not add one.

### Output stability

The first run against an unchanged collection must reproduce the current file exactly. This is a stronger requirement than idempotence and is easy to violate by accident:

- **Absent values are omitted, never null.** A generated default that does not apply — `trip` for a top-level file, `poster` for a video without one — must leave the key out of the object. Emitting `"trip": null` is valid JSON and would rewrite all 546 items.
- **Key order is fixed**: `id`, `type`, `src`, `date`, `caption`, `trip`, `fileSize`, then `poster`. Merged unknown properties follow, in their existing order.
- **Equal dates keep the existing manifest's relative order.** Scan order decides only where genuinely new items land among their date-peers. Today this is unobservable — filenames are date-prefixed, so lexical and chronological order coincide — but it becomes observable as soon as a trip subdirectory or a non-date-prefixed filename exists.
- **Traversal is sorted by name**, so repeated runs are identical on any filesystem.

### Input validation and errors

- A missing manifest is a supported first run. An existing but unreadable, empty, or malformed file is an error, not a first run.
- The root must be a non-null object with an `items` array. Each item must be a non-null object with `type` equal to `image`, `video`, or `poem`. Unsupported types fail rather than being silently dropped.
- Each media item must have a nonempty string `src`; duplicate media `src` values fail with an actionable diagnostic. A missing ID is allowed because the scanner can supply it. Poems do not need IDs or `src` fields.
- Validate known supplied editorial fields: `id`, `caption`, `trip`, `poster`, `title`, and `text` must be strings when present. An existing `date`, when present, must be a valid `YYYY-MM-DD` calendar date. Missing media dates use scanned defaults; missing poem dates sort first. Unknown properties are retained without interpreting them.
- A scan/read/stat error, type mismatch, or missing previously listed media aborts before replacement.
- CLI failure prints an error to stderr and exits nonzero. The exported function throws for callers. Success is reported only after replacement succeeds.

The scanner can no longer emit a date its own validator would reject, so date validation is defense in depth against hand edits rather than a self-inflicted deadlock. Keep it strict.

### Diagnostics must not quote content

Error messages identify the manifest path, the item index or `src`, and a generic reason. **Never pass a `JSON.parse` message through to output.** V8 embeds a source excerpt for several common malformations, which leaks the personal text the manifest holds:

```
Unexpected token 'h', ..."],"note":the night s"... is not valid JSON
```

Report the byte offset and line/column the parser gives, not its message text. A regression test must place a distinctive marker inside malformed input and assert that the marker never reaches stdout or stderr.

### Safe output

Fully read, validate, scan, merge, sort, and serialize before touching the destination. Write to an exclusively created, uniquely named temporary file in the manifest's directory; close it successfully, then rename it over the destination. On write/close/rename failure, leave the original untouched and attempt to remove only this run's temporary file. If cleanup fails, report its path without masking the original error.

Name temporary files `content.json.tmp-<unique>` and add `content.json.tmp-*` to `.gitignore`, so an orphan left by a signal or crash cannot be committed to the live site.

**A successful rename is the commit point.** The preservation guarantee covers every failure before it; a failure in reporting after it cannot un-replace the file. This protects against ordinary partial-write failures; it does not promise power-loss durability or coordination between simultaneous generators/editors. Run one generator at a time and avoid editing the manifest while it runs. No backup rotation, lock service, or force/prune option is included.

### Interface

`generateManifest()` keeps its zero-argument CLI behavior and repository-relative defaults resolved from `__dirname`, never the caller's working directory. It accepts optional `assetsDir` and `outputFile` arguments so tests can run against fixtures. A pure `buildManifest(assetsDir, outputFile)` returns the manifest and a report without writing, which is what dry runs and most tests use.

### Known limitations

- Unknown numeric properties round-trip through `JSON.parse`/`JSON.stringify`. Values beyond `Number.MAX_SAFE_INTEGER` lose precision and `1e400` becomes `null`. No such property exists today; this is documented, not defended against.
- `fileSize` is refreshed on every run and is read by no browser code. It is retained because removing it is a schema change, but it is the only field that creates diff churn for untouched items.

## Acceptance criteria

1. Adding a new image/video retains all existing curated media metadata, poem objects, and top-level extensions while refreshing actual media file sizes.
2. Existing empty captions/trips remain empty; absent metadata receives generated defaults. Same basenames in different directories retain independent metadata.
3. Missing manifests generate successfully. Invalid JSON/shape/fields, duplicate manifest `src` values, type mismatches, unreadable input, and scan failures exit nonzero without changing original bytes.
4. A moved or renamed asset keeps its metadata when its basename is unambiguous, and its `src` updates. A deleted asset, or an ambiguous basename, drops the entry and names it in the report. No run requires a manual edit to `content.json`, and no drop is silent.
5. Injected temporary-write and rename failures preserve the destination; success produces complete parseable JSON and leaves no temporary file. First-run failure creates no destination.
6. Two consecutive successful runs with unchanged fixtures produce identical output bytes. The command works from another working directory, retaining its repository-relative defaults.
7. **A first run against a copy of the current real manifest and a fixture mirroring its shape produces a byte-identical file** — absent values omitted rather than nulled, key order preserved, equal-date order preserved.
8. **Malformed input containing a distinctive marker never emits that marker** on stdout or stderr; the diagnostic still identifies the file and location.
9. R01 tests pass without reading or rewriting the real personal media collection. The real `content.json` and `assets/` remain unchanged during implementation verification.

## Implementation context and style

Use the existing CommonJS Node script and built-in modules only. Local Node is v24.5.0; use `node:test` and `node:assert/strict` for regression tests. No package manifest, install step, browser framework, or build tooling is required.

Keep two-space indentation, semicolons, single quotes, and small named helpers, matching the corrected `tools/generate-manifest.js`.

Files: `tools/generate-manifest.js` owns generation; `tests/generate-manifest.test.js` will contain focused tests; `README.md` and `AGENTS.md` will describe the final command and preservation contract. Specs live at the root, plans/checklists in `tasks/`.

## Commands and testing

Test command:

```sh
node --test tests/generate-manifest.test.js
node --check tools/generate-manifest.js
node --check tests/generate-manifest.test.js
git diff --check
```

Generator command stays `node tools/generate-manifest.js`; during tests run it only against an isolated temporary fixture copy. Test full CLI exit codes/output and on-disk results, plus focused failure injection around filesystem operations. Cover every acceptance criterion with behavioral assertions; no arbitrary coverage percentage is required. There is no build/lint pipeline. Browser tests are not the primary evidence for this CLI-only change.

## Boundaries and decisions

- Always: preserve authored data, fail before replacement on ambiguity, isolate test fixtures, review the resulting diff, and record verification before closing R01.
- Discuss a scope change before: introducing dependencies, changing the content schema, automatically deleting unmatched media, or expanding into other review items.
- Never: regenerate production content as an incidental test, silently reset malformed input, or modify/delete original assets.
- Season grouping (R03, R04), browser error handling (R10), image optimization (R08), and a broad test suite (R17) remain separate items.

### Decided: reconciling moves and deletions

Earlier drafts aborted on a missing asset and told the owner to edit `content.json` first. The owner rejected that: hand-editing a 546-item file is not an acceptable step in the workflow. The two-pass recovery above replaces it.

The tool now favours doing the obvious right thing over demanding confirmation. It recovers a move automatically when there is exactly one candidate, and drops an entry when there is none. It reports both. Git provides the undo. Automatic rename detection by content hash stays rejected as disproportionate; basename matching handles the real cases at a fraction of the cost.

The residual risk is accepted deliberately: a delete-plus-add in one run, where the added file happens to reuse a removed file's basename, transfers the old metadata to the new file. This is reported, visible in the diff, and reversible.
