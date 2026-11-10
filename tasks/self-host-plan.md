# Plan: self-host the site and its photos on the Linux box

Status: reviewed, 2026-11-10. Nothing here is built yet. The audience decision below is still open.

## Goal

Move the site and its photos off GitHub Pages onto Khalil's new Linux PC, reached over Tailscale, so that:

- new photos reach the site without a commit: put a photo in an album on the phone and it appears on the wall;
- the viewer can show photos at full quality, not just the 800w copy;
- the photos are actually private, which closes R16. Today anyone who guesses a path can download an original from GitHub Pages.

## Where things stand

- 1.2 GB of originals are committed under `assets/`: 526 photos and 20 `.MOV` videos. The 400w/800w WebP copies (47 MB) are committed under `thumbs/`.
- `tools/generate-manifest.js` builds `content.json` from `assets/` and merges, so curated captions, dates and trips survive a rerun. Its CLI already takes the assets folder and output file as arguments.
- `tools/generate-thumbnails.js` writes the copies and records `thumb`, `width` and `height`. Its `generateThumbnails()` takes a `root`, but the CLI always uses the repo root.
- The wall uses the 400w/800w copies. The viewer shows the 800w copy at most (`scripts/app.js`, `show()`).
- Both tools are run by hand and their output is committed.

## Decision needed before building

**Who can open the site?**

- **Tailnet only (recommended).** The box is shared with her Tailscale account, or her devices join the tailnet. Nobody else can reach it, so the photos are private without any auth code. The date gate stays as a reveal.
- **Anyone with the link.** Caddy is exposed with Tailscale Funnel or a Cloudflare Tunnel, and needs real auth in front of it (Caddy basic auth or Cloudflare Access). Check Funnel's current bandwidth limits before using it for full-quality video.

The rest of this plan assumes tailnet only. The public option adds an auth step to slice 5 and changes nothing else.

## Target setup

```
phone ──Immich app auto-backup──▶ Immich (Docker, on the box)
                                      │ album "365Days" and "365Days / <Trip>"
                                      ▼
                     sync job (systemd timer, every 15 min)
                     download → convert HEIC/HEVC → name by capture time
                                      ▼
            /srv/365days/data/  assets/  thumbs/  content.json
                                      ▼
            Caddy over Tailscale HTTPS
              /assets/*, /thumbs/*, /content.json  → data/
              everything else                     → /srv/365days/site (git checkout)
```

- **Code and data are separate.** The site checkout holds only code and is updated with `git pull`. The data folder holds photos, copies and `content.json`, and is written only by the sync job. A pull never conflicts with a sync.
- **URLs stay relative.** The page still fetches `content.json` and `assets/...` from its own origin, so `scripts/` needs no change for serving.
- **Immich is the photo store.** It keeps the whole library and backs up the phone. The site only sees what is in its albums.

## Naming new photos

The manifest generator reads the date and caption from the filename (`2021-09-17_16-52-07.jpeg` gives 17 Sep 2021 and `4:52 PM`). The sync job names each new file by its capture time from Immich, `YYYY-MM-DD_HH-MM-SS.<ext>`, and adds `-2`, `-3` and so on when two share a second. Phone filenames such as `IMG_1234.HEIC` carry no date and would all land on `2021-09-11`.

Trips use the existing folder rule: an album named `365Days / Paris` syncs into `assets/images/Paris/` (and `assets/videos/Paris/` for its videos).

The 546 files already in `assets/` move to the box with their current names and paths, together with the current `content.json`, so every curated caption, date and trip is kept. They are not added to the Immich albums, so they are never downloaded twice.

## Slices

1. **Data root for the thumbnail tool.** Add a `--root <dir>` argument to `tools/generate-thumbnails.js` that reads `<dir>/content.json`, `<dir>/assets/` and writes `<dir>/thumbs/`. Default stays the repo root. One short test. About 10 lines.

2. **Full-quality viewer.** Add a 2048w copy to `WIDTHS` in `tools/generate-thumbnails.js`, at a higher quality than the wall copies. The tool measures the last entry in `WIDTHS`, and `renderImage()` uses `item.width` as the 800w file's `srcset` descriptor, so keep `width` and `height` measured from the 800w copy; otherwise the wall would label an 800-pixel file as 2048w. The wall `srcset` keeps 400w and 800w only. The viewer shows the 800w copy straight away and swaps in the 2048w copy once it has loaded, so opening a photo never waits on the larger file. Add an "Original" link in the viewer that opens `item.src`. A normal run adds the 2048w copy to existing photos, because the tool re-encodes any photo missing one of its widths. About 40 lines.

3. **Album sync job.** `tools/sync-immich.js`, Node with no dependencies, using the built-in `fetch`:
   - read the Immich URL from the environment, and the API key from a file whose path is in the environment (never from the repo);
   - list albums named `365Days` and `365Days / <Trip>`, and the assets in each;
   - download originals that are not yet on disk, keyed by Immich asset ID in a small state file in the data folder, so a rename or rerun never downloads twice;
   - place each asset once, when it is first downloaded: in its trip folder if it is in a `365Days / <Trip>` album (the first by name if it is in several), otherwise in the top folder. Later album moves are not followed, because the generator keeps an entry's `trip` when its file moves. To change a synced photo's trip, edit `trip` in `content.json`;
   - convert HEIC to JPEG with `magick`, and HEVC video to H.264 MP4 with `ffmpeg`; keep JPEG, PNG and H.264 MP4 as they are;
   - delete files whose asset left every album, then run `generate-manifest.js <data>/assets <data>/content.json` and `generate-thumbnails.js --root <data>`. Only when both succeed, delete the copies the thumbnail tool reports as unused and write the state file. A run that fails partway exits non-zero and the next run repeats it. At worst a photo just removed from an album shows as a broken tile until then; Immich still holds the photo, so nothing is lost.
   Check the endpoints against the API docs of the Immich version actually installed; they have changed between releases. Test the pure parts (naming, album-to-folder mapping, the delete set) with stubbed responses, within the repo's test budget. About 200 lines plus tests.

4. **Box config in the repo.** `deploy/Caddyfile`, `deploy/365days-sync.service` and `deploy/365days-sync.timer`, plus a `deploy/README.md` with the install steps: Tailscale, Docker, Immich, Caddy, ImageMagick with HEIC support, ffmpeg, Node 22 or later. About 60 lines. No secrets in any of them.

5. **Cutover.**
   - Copy `assets/`, `thumbs/` and `content.json` to `/srv/365days/data/`, then run the thumbnail tool once with `--root` to add the 2048w copies.
   - Serve the site from the box and check it over Tailscale from both phones.
   - Turn off GitHub Pages and make the GitHub repo private. Every pushed commit still contains the originals, so the photos are not private until the repo is.
   - Stop tracking the photos: `git rm -r --cached assets thumbs content.json`, add them to `.gitignore`, and keep a small fixture for local development. Update `AGENTS.md` and `README.md`.
   - Decide separately whether to rewrite git history to remove the photos already pushed. It is a force push that rewrites every commit hash, so it needs its own approval. A private repo makes it optional.

6. **Backups.** The box becomes the only full copy of the library. Back up Immich's library and database, plus `/srv/365days/data/`, with restic to an external drive and one off-site target. Restore one photo to prove it works. This is box setup, not repo code.

## What stays the same

- `scripts/content.js`, `scripts/wall.js`, the season and trip rules, and their tests.
- The wall's 400w/800w `srcset`, the eager first screen and lazy loading.
- The generators' merge and safety rules. The sync job calls them; it does not reimplement them.
- No build step, no framework, no third-party requests from the page.

## Verification

- `node --test tests/*.test.js`, the syntax and JSON checks, and `git diff --check` for each slice.
- Slice 2 in headless Chrome: the wall requests only 400w/800w copies; opening the viewer requests the 2048w copy and no original; the Original link opens the file.
- Slice 3 against a running Immich on the box: add a HEIC photo and an HEVC video to the album from a phone, wait one timer run, and see both on the wall with the right date; remove one from the album and see it disappear along with its copies. Run the job twice in a row and check nothing is downloaded the second time.
- Slice 5: from a device outside the tailnet, the site and an original photo URL both fail to load, and the GitHub repo returns 404 when logged out.
- What can't be checked from this Mac: anything on the box itself. Each slice that touches the box reports what ran there and what didn't.

## Size

Repo changes come to about 300 lines plus tests, in four PRs: slice 1 with 2, slice 3, slice 4, and the slice 5 docs and `.gitignore` change. Slices 1 and 2 can ship before the box exists.

## Not in scope

- Captions from Immich descriptions. New photos get clock-time captions from their filenames, as now. Pulling the description in is a later change.
- Video sizes and posters (R20). The sync job's ffmpeg could produce them later.
- Hosting other projects on the box.
