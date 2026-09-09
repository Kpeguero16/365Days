# R02: Make the layout usable on phones

Status: implemented and verified, 2026-09-09; revised after an independent review found a blank-screen defect. Satisfies every acceptance criterion except video decoding and audible music, which the verification environment could not exercise; both are handed to R18.
Tracker: [R02](OPEN_ITEMS.md). Plan: [tasks/plan-r02.md](tasks/plan-r02.md). Checklist: [tasks/todo-r02.md](tasks/todo-r02.md).
R01's plan and checklist keep their original names (`tasks/plan.md`, `tasks/todo.md`); per-item files are suffixed from R02 onward.

## Objective

The site renders and navigates correctly on a phone. Today it does not: `styles/layout.css` has no `@media` rule at all, so a 375px screen gets the desktop layout at desktop dimensions.

## What is broken at 375px

| Rule | Effect on a phone |
| --- | --- |
| `.app { grid-template-columns: 280px 1fr }` | The sidebar takes 280 of 375 pixels. The gallery gets 95. |
| `.sidebar { height: 100vh; padding: 24px }` | A full-height nav column occupies the screen before any photo does. |
| `.player { position: absolute; bottom: 20px }` | The music button is pinned to the bottom of that column, below the fold of the strip it should sit in. |
| `.section { padding: 48px }` | 96px of the 95px content column is padding. |
| `.grid { repeat(3, minmax(0, 1fr)) }` | Three fixed columns inside that space. |
| `.section { min-height: 100vh }` + `.scroll-snap-y { scroll-snap-type: y mandatory }` | `100vh` is the large viewport on mobile, so a section is taller than what is visible under browser chrome. Seasons hold dozens of photos and run many screens tall, and mandatory snap on a section that size fights the user's scroll. |

## Proposed behavior

### Navigation becomes a sticky top strip

Below the stacking breakpoint, `.app` becomes a single-column grid of two rows. The sidebar is the first row: brand on the left, music button on the right, and the season list beneath them as a horizontally scrolling row of chips. `#content` is the second row and keeps its own scrollbar.

This was scoped as a CSS-only change. One JavaScript line proved unavoidable — see "The reveal threshold" below. `app.html` is untouched and the only edit under `scripts/` is a single observer option, so R02 still does not collide with R06 (trip rendering and nav order), R07 (duplicate observer setup) or R13 (brand keyboard access), which all remain open.

`#content` stays the scrolling container, as `AGENTS.md` requires — the scroll-spy `IntersectionObserver` uses it as its root.

### Two breakpoints

| Breakpoint | Layout |
| --- | --- |
| above 900px | Unchanged. 280px sidebar, 48px section padding, three columns, mandatory snap. |
| `max-width: 900px` | Stacked top strip; section padding 24px; `repeat(auto-fill, minmax(200px, 1fr))` columns; snap off. |
| `max-width: 520px` | Section padding 20px/16px; two columns; smaller card meta. |

Resulting column counts: two at 375px, three at 700px, four at 900px, three above 900px.

The strip switch happens at 900px because the desktop three-column grid wants roughly 560px of content column, and a 280px sidebar plus 96px of section padding means that needs a 936px window. 900 is the conventional breakpoint just below it. The consequence, accepted rather than solved: between 901 and 936px the desktop layout is cramped, with three tracks of about 165px, under the 200px floor the mobile block itself uses.

### Snap is off below 900px

`scroll-snap-type: none` and `scroll-snap-align: none`, and `.section { min-height: 0 }` so sections size to their content.

`scripts/app.js` `setupSidebarNavigation()` writes `contentEl.style.scrollSnapType = 'y mandatory'` as an inline style one second after every navigation click. An inline style beats a media query, so the phone rule carries `!important` — an important author declaration outranks a normal inline one. This is deliberate and stays until that JavaScript is changed. It will be commented as such in the stylesheet.

### Viewport units

`.app` gets `height: 100vh` then `height: 100dvh`, and `min-height: 0` to cancel the desktop `min-height: 100vh`. Without that cancellation `min-height: 100vh` wins whenever the large viewport exceeds the dynamic one, pushing the app taller than the screen and making the body scroll behind the browser chrome. `.content` becomes `height: 100%` and is sized by the `minmax(0, 1fr)` grid row.

### The reveal threshold

`setupReveals()` in `scripts/media.js` observes `.section` at `threshold: 0.1`, and `styles/effects.css` holds every section at `opacity: 0` until the observer adds `.in`. `isIntersecting` is derived from the threshold index, so an element too tall to ever occupy 10% of the viewport never reports as intersecting and never reveals.

Two phone columns make the largest season, Summer 2024 at 130 cards, about 6930px tall in a 552px scroller. Its maximum achievable ratio is 0.079, so it stayed blank at every scroll position — 130 of 546 items invisible. Three columns would have put it at roughly 0.117 and hidden the problem, which is why this only surfaced once the phone grid landed.

The fix is `threshold: 0` in `setupReveals()`. This is the one place R02 leaves CSS. A CSS-only alternative existed — exempting `.section` from the fade below 900px — but it would have left the same trap above 900px, where the margin is thinner than it looks: at 901px the three tracks are already down to 165px.

Paired probes on the same element at the same instant, which is the evidence for the mechanism:

| `threshold` | `isIntersecting` | `intersectionRatio` |
| --- | --- | --- |
| `0` | true | 0.0733 |
| `0.1` | false | 0.0733 |

### Touch targets

Timeline chips become flex containers with `min-height: 44px`. At the current `padding: 8px 12px` and 14px type they are about 34px tall, below the 44px minimum. The music button drops `width: 100%` and takes the same 44px floor.

`.timeline` carries `padding: 4px 0` so the keyboard focus ring is not clipped by the scrollport. Removing `overflow-y: hidden` would not achieve this: when one overflow axis is not `visible`, the other computes to `auto`, which clips just the same.

The strip's scrollbar is hidden only under `(pointer: coarse)`. The 900px block also covers narrow desktop windows, where a wheel does not scroll horizontally and the scrollbar is the only way to reach later seasons.

Trip chips lose `margin-left: 16px`, which reads as nothing in a horizontal row. They stay smaller and muted, and they sit immediately after their season chip, which is what conveys the relationship.

### Known limitations

- The active chip can sit outside the visible part of the strip. Scrolling it into view needs JavaScript in the scroll-spy, which belongs to R06/R07. The vertical sidebar has the same gap today.
- R02 makes the layout usable, not the page light. 546 items totalling about 1.24GB, 438 files over 1MB, largest video about 99MB — on cellular this is still R08's problem, and R02 does not claim to fix it.
- The date gate at `index.html` is not part of this change. Its card is already fluid to a 440px maximum. It will be checked at 375px and left alone unless it is broken.

## Acceptance criteria

1. At 375x667 and 390x844, `document.documentElement.scrollWidth` does not exceed `window.innerWidth`, and `#content.scrollWidth` does not exceed its `clientWidth`. No unintended horizontal overflow.
2. At those widths the brand, the music button, and at least one season chip are visible without scrolling, and the season strip scrolls horizontally to reach the last season.
3. Every timeline chip has a rendered height of at least 44px below 900px.
4. The music button is visible, hittable, and toggles `aria-pressed` and its label.
5. Gallery columns are 2 at 375px, 3 at 700px, 4 at 900px, and 3 at 901px and above.
6. After clicking a navigation link and waiting more than one second, the computed `scroll-snap-type` on `#content` is `none` below 900px and `y mandatory` above it.
7. At 901px and 1280px, the layout is identical to `main` — sidebar 280px, section padding 48px, three columns, snap on.
8. Images and videos load and play at 375px; a video that scrolls into view starts.
9. Zero console errors or warnings across the resize sweep.
10. A fixture with trips renders trip chips in the strip and trip sections in the gallery at 375px. The real manifest has no trips, so this cannot be shown from real content.

## Commands and verification

- Serve with `python3 -m http.server 8000 --bind 127.0.0.1` and enter the gate.
- Drive Chrome at 375x667, 390x844, 700, 900, 901 and 1280 wide; measure overflow, column counts, chip heights and computed snap from the page; read the console at each step.
- `git diff --check` for whitespace.
- The trip fixture is a temporary copy served from the scratchpad. `content.json` and `assets/` are not modified.

No JavaScript, HTML, generator or content changes are in scope. R06, R07, R08, R13, R14 and R18 stay open.

## Boundaries and decisions

### Decided: CSS only, no drawer

A hamburger drawer would keep the whole season list on screen at once, but it needs a button in `app.html` plus new JavaScript for open/close, close-on-link-click, focus trapping and Escape. That is more surface area, and it lands in the same files as three open items. The strip gives usable navigation for zero JavaScript. Chosen for that reason, with the offscreen-active-chip limitation accepted.

### Decided: snap off rather than `100dvh` snap

Keeping mandatory snap and only correcting the unit would preserve the section-by-section feel, but seasons here are many screens tall, so snap points sit far apart and the browser overrides scrolls mid-section. Turning snap off below 900px removes that. Desktop keeps it exactly as it is.
