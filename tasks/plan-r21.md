# Plan: R21, the Wall redesign

Status: approved and built, 2026-11-10. Results are recorded under R21 in `OPEN_ITEMS.md`.

Decision: Khalil compared three prototypes on 2026-11-10 (A Scrapbook, B Calendar, C Wall) and picked C. The prototype is `prototype-design.html` and `prototype-design/` in this worktree. It stays out of main; see "Prototype" below.

## What the viewer sees

- The sidebar and season chips go. A slim sticky header holds the title, a month bar, the current month, the photo count and the music button. The month bar has one bar per month, its height set by that month's photo count. It highlights the month on screen and jumps to a month on click.
- The three-column card grid becomes a packed wall of every photo, oldest first. Each season opens with a tinted card: "Fall", "2021", "13 days / 19 photos". A trip gets the same kind of card where it starts. A poem becomes a text tile. Dates show on hover instead of under every photo.
- Clicking a photo opens it full screen on black, with previous, next and close buttons, arrow keys and Esc, and a caption giving its number, date and time.
- Colours: off-white `#f4f2ee`, ink `#161514`, a pale tint per season. Type: Instrument Serif for the title and season cards, IBM Plex Mono for labels. Both fonts are self-hosted under `fonts/`, so the site makes no third-party requests.
- The date gate gets the same look. Its logic does not change.

## What stays the same

- `#content` stays the scrolling container, as `AGENTS.md` requires, and the observers keep using it as their root.
- `scripts/content.js` and its tests do not change. Seasons and trips come from `groupBySeason()` as now.
- Images keep the 400w and 800w `srcset` with `width` and `height`. `sizes` comes from the computed column width, which replaces `IMAGE_SIZES`.
- The first screen still loads straight away: the first ten images load immediately (about two rows at the widest layout) and the first four at `fetchpriority="high"`. The rest load lazily.
- Videos stay muted, looping, inline and lazily loaded, and play when they are on screen. They have no known size yet (R20), so each video tile is a fixed 4:5 crop and cannot shift the layout.
- Music still starts on a button click. The easter eggs stay: P, the Konami code, the heart on the title, and a triple click on the wall's background. The title becomes a real button, which closes R13.

## Slices

1. **Packing.** Add `scripts/wall.js` with a pure `pack(ratios, width)` that returns tile positions and the wall height (shortest column first, so order reads roughly row by row). Add a short `tests/wall.test.js`.
2. **Wall.** Rewrite `app.html`, the render half of `scripts/app.js` and `styles/layout.css`. Season, trip and poem tiles, eager first screen, lazy loading through `scripts/media.js`, and relayout on resize.
3. **Month bar.** Bars, the current-month label, scroll tracking and jump on click.
4. **Viewer.** Full-screen view with keyboard support, focus moved in on open and back on close.
5. **Gate and fonts.** Restyle `index.html` through `styles/base.css` and add the two fonts.
6. **Docs.** Update the structure notes in `AGENTS.md`, the timeline claim in `README.md`, and add R21 to `OPEN_ITEMS.md`. Remove the prototype files from the branch.

## Verification

- `node --test tests/*.test.js`, the syntax and JSON checks, and `git diff --check`.
- Headless Chrome over the DevTools protocol at 1440px and on an emulated 390px phone:
  - no sideways scroll and no console errors;
  - the gate with an empty, wrong and correct date;
  - a month jump lands on that month;
  - the viewer's previous, next and Esc;
  - the music toggle and each easter egg;
  - no request for an original photo, only thumbs.
- Safari and real phones cannot be checked here. The PR will say so.

## Size and review

About 350 to 450 changed lines, most of it replacing `scripts/app.js` and `styles/layout.css`. One PR. A subagent that did not write the code reviews it before the PR goes up.

## Decisions (confirmed 2026-11-10)

- **Viewer sharpness.** The viewer uses the 800w copies, which look soft full screen on a large monitor. A sharper view needs a 1600w copy of each photo from `tools/generate-thumbnails.js`. The 800w copies total 35 MB, so 1600w copies would likely add 100 MB or more to the repo. Decided: ship with 800w; sharper copies are a possible follow-up.
- **Prototype.** Following the prototype skill, the three variants are kept as a reference on a throwaway branch, `prototype/design-variants`, and never merged. Done: committed to `prototype/design-variants` (local only).
