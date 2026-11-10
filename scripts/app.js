(function(){
  const contentEl = document.getElementById('content');
  const wallEl = document.getElementById('wall');
  const monthsEl = document.getElementById('timeline');
  const nowEl = document.getElementById('nowMonth');
  const countEl = document.getElementById('photoCount');
  const viewerEl = document.getElementById('viewer');

  if (!contentEl || !wallEl || !monthsEl || !viewerEl) {
    console.error('The page is missing part of its layout');
    return;
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ANNIVERSARY = '2021-09-11';
  const DATE_SHAPE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

  // Tile shapes, as height / width. Videos have no recorded size yet (R20), so
  // a video tile is a fixed 4:5 crop and nothing moves when it loads.
  const SEASON_RATIO = 0.82;
  const TRIP_RATIO = 0.5;
  const VIDEO_RATIO = 1.25;
  // The first tiles skip the lazy loader, so the first screen starts
  // downloading as soon as it is built. Ten is about two rows at the widest
  // layout; the first four are fetched ahead of everything else.
  const EAGER_IMAGES = 10;
  const HIGH_PRIORITY_IMAGES = 4;
  // A month jump leaves this much of the wall above the month's first tile.
  const JUMP_PAD = 12;

  const tiles = [];       // every tile in wall order: { el, ratio, month, top }
  const mediaTiles = [];  // the photo and video tiles among them
  const viewable = [];    // their items, for the viewer
  const bars = new Map(); // 'YYYY-MM' -> month bar
  let imagesRendered = 0;
  let laidOutWidth = 0;
  let updateSpy = null;   // set once the month bar exists
  let pinned = null;      // the month a jump asked for: { month, scrollTop, reached }

  async function render() {
    const data = await window.ContentAPI.loadContent();
    const groups = window.ContentAPI.groupBySeason(data.items || []);
    if (!groups.length) {
      showMessage('No photos to show. Refresh the page to try again.');
      return;
    }

    const sizes = `${Math.ceil(window.WallLayout.pack([], wallEl.clientWidth).columnWidth)}px`;
    groups.forEach(sec => {
      addSeason(sec.season, sec.items.concat(...sec.trips.map(trip => trip.items)));
      // A season's poems come first, as they always have. Each trip then goes
      // in where it begins and keeps its photos together behind its card, so
      // a photo kept outside a trip but dated during it follows the trip.
      sec.items.filter(isPoem).forEach(addPoem);
      const trips = sec.trips.slice().sort((a, b) => (a.items[0].date < b.items[0].date ? -1 : 1));
      let next = 0;
      for (const item of sec.items.filter(item => !isPoem(item))) {
        while (next < trips.length && trips[next].items[0].date < item.date) addTrip(trips[next++], sizes);
        addMedia(item, sizes);
      }
      while (next < trips.length) addTrip(trips[next++], sizes);
    });
    const fragment = document.createDocumentFragment();
    tiles.forEach(t => fragment.appendChild(t.el));
    wallEl.appendChild(fragment);

    countEl.textContent = countLabel(viewable, ' · ');

    layout();
    // Relayout when the wall's width changes, including when #content gains
    // its scrollbar after the first layout. Deferred a frame, because the
    // relayout changes the wall's height inside the observer's callback.
    new ResizeObserver(() => requestAnimationFrame(layout)).observe(wallEl);
    if (mediaTiles.length) {
      buildMonthBar();
      setupScrollSpy();
      setupViewer();
    }
    window.MediaAPI.setupReveals(contentEl);
    window.MediaAPI.lazyLoadMedia(contentEl);
  }

  function addSeason(label, items) {
    const media = items.filter(item => item.type !== 'poem');
    const [name, ...years] = label.split(' ');
    const el = document.createElement('div');
    el.className = `tile tile-season season-${name.toLowerCase()}`;
    const heading = document.createElement('h2');
    heading.append(span('season-name', name), ' ', span('season-year', years.join(' ')));
    const count = document.createElement('p');
    count.textContent = `${plural(new Set(media.map(item => item.date)).size, 'day')} / ${countLabel(media, ' / ')}`;
    el.append(heading, count);
    tiles.push({ el, ratio: SEASON_RATIO, month: null, top: 0 });
  }

  // A trip's card, its poems, then its photos.
  function addTrip(trip, sizes) {
    const el = document.createElement('div');
    el.className = 'tile tile-trip';
    const heading = document.createElement('h3');
    heading.textContent = trip.trip;
    const count = document.createElement('p');
    count.textContent = countLabel(trip.items.filter(item => !isPoem(item)), ' / ');
    el.append(heading, count);
    // Taller for a longer name, which wraps on a narrow column.
    const ratio = Math.min(1.2, TRIP_RATIO + 0.12 * Math.max(0, Math.ceil(trip.trip.length / 14) - 1));
    tiles.push({ el, ratio, month: null, top: 0 });
    trip.items.filter(isPoem).forEach(addPoem);
    trip.items.filter(item => !isPoem(item)).forEach(item => addMedia(item, sizes));
  }

  function addPoem(item) {
    const el = document.createElement('article');
    el.className = 'tile tile-poem reveal';
    const title = document.createElement('h3');
    title.textContent = item.title || 'Poem';
    const text = document.createElement('p');
    text.textContent = item.text || '';
    el.append(title, text);
    // Taller for longer poems; the tile scrolls if the guess is short.
    const lines = Math.max((item.text || '').split('\n').length, Math.ceil((item.text || '').length / 34));
    tiles.push({ el, ratio: Math.min(2.4, 0.5 + 0.09 * lines), month: null, top: 0 });
  }

  function addMedia(item, sizes) {
    const date = validDate(item.date);
    const isVideo = item.type === 'video';
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tile tile-media reveal';
    el.dataset.index = String(viewable.push(item) - 1);
    el.setAttribute('aria-label', `${isVideo ? 'Video' : 'Photo'}, ${longDate(date)}${item.caption ? `, ${item.caption}` : ''}`);
    el.appendChild(isVideo ? renderVideo(item) : renderImage(item, sizes));
    const label = span('tile-label', `${shortDate(date)}${isVideo ? ' ▶' : ''}`);
    label.setAttribute('aria-hidden', 'true');
    el.appendChild(label);
    const tile = { el, ratio: !isVideo && hasCopies(item) ? item.height / item.width : VIDEO_RATIO, month: date.slice(0, 7), top: 0 };
    tiles.push(tile);
    mediaTiles.push(tile);
  }

  // `thumb`, `width` and `height` come from tools/generate-thumbnails.js. An
  // image without them, such as one added since that last ran, uses its
  // original file and gets the video tile's shape.
  function hasCopies(item) {
    return typeof item.thumb === 'string' && item.width > 0 && item.height > 0;
  }

  function renderImage(item, sizes) {
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    let src = item.src;
    let srcset = '';
    if (hasCopies(item)) {
      img.width = item.width;
      img.height = item.height;
      img.sizes = sizes;
      const small = thumbUrl(item.thumb, 400);
      const large = thumbUrl(item.thumb, 800);
      srcset = item.width > 400 ? `${small} 400w, ${large} ${item.width}w` : `${large} ${item.width}w`;
      src = small;
    }
    const index = imagesRendered++;
    if (index < EAGER_IMAGES) {
      if (index < HIGH_PRIORITY_IMAGES) img.fetchPriority = 'high';
      if (srcset) img.srcset = srcset;
      img.src = src;
    } else {
      img.loading = 'lazy';
      if (srcset) img.setAttribute('data-srcset', srcset);
      img.setAttribute('data-src', src);
    }
    return img;
  }

  function renderVideo(item) {
    const v = document.createElement('video');
    v.setAttribute('muted', '');
    v.setAttribute('loop', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('preload', 'none');
    v.setAttribute('data-src', item.src);
    if (item.poster) v.setAttribute('data-poster', item.poster);
    return v;
  }

  // srcset separates candidates with commas and whitespace, and `#` or `?`
  // would end the path, so each segment of a folder name is percent-encoded.
  function thumbUrl(stem, width) {
    return `${stem}-${width}.webp`.split('/').map(encodeURIComponent).join('/');
  }

  function layout() {
    const width = wallEl.clientWidth;
    if (!width || width === laidOutWidth) return;
    // A relayout, such as a phone turning sideways, keeps the photo at the
    // tracking line where it was on screen; left alone, the old scroll
    // position would land in another month.
    const anchor = laidOutWidth && mediaTiles.length ? tileAtLine() : null;
    const offset = anchor ? (contentEl.scrollTop - wallEl.offsetTop - anchor.top) / anchor.height : 0;
    laidOutWidth = width;
    const { positions, height, columnWidth } = window.WallLayout.pack(tiles.map(t => t.ratio), width);
    tiles.forEach((t, i) => {
      const p = positions[i];
      t.top = p.y;
      t.height = p.height;
      Object.assign(t.el.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.width}px`, height: `${p.height}px` });
    });
    wallEl.style.height = `${height}px`;
    const sizes = `${Math.ceil(columnWidth)}px`;
    wallEl.querySelectorAll('img[sizes]').forEach(img => { img.sizes = sizes; });
    if (anchor) {
      pinned = null;
      contentEl.scrollTop = wallEl.offsetTop + anchor.top + offset * anchor.height;
    }
    if (updateSpy) updateSpy();
  }

  // Month bar: one bar per month from the first photo to the last.
  function buildMonthBar() {
    const counts = new Map();
    mediaTiles.forEach(t => counts.set(t.month, (counts.get(t.month) || 0) + 1));
    const keys = Array.from(counts.keys()).sort();
    const max = Math.max(...counts.values());
    const [firstYear, firstMonth] = keys[0].split('-').map(Number);
    for (let i = 0; ; i++) {
      const y = firstYear + Math.floor((firstMonth - 1 + i) / 12);
      const m = (firstMonth - 1 + i) % 12 + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (key > keys[keys.length - 1]) break;
      const n = counts.get(key) || 0;
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'month';
      bar.dataset.month = key;
      bar.tabIndex = -1;
      bar.disabled = n === 0;
      // Square root, so a quiet month still shows next to a busy one.
      bar.style.setProperty('--h', n ? `${Math.max(12, Math.round(Math.sqrt(n / max) * 100))}%` : '6%');
      bar.setAttribute('aria-label', `${MONTHS[m - 1]} ${y}, ${plural(n, 'photo')}`);
      bar.title = `${MONTHS[m - 1]} ${y}: ${plural(n, 'photo')}`;
      if (m === 1 || key === keys[0]) bar.dataset.year = String(y);
      monthsEl.appendChild(bar);
      bars.set(key, bar);
    }

    // Dragging across the bar, with a finger or a mouse, scrubs through
    // months. The click that ends a drag is ignored, since on a touch screen
    // it lands on the bar the drag started from.
    let drag = null;
    let dragEnded = 0;
    monthsEl.addEventListener('pointerdown', e => {
      drag = e.pointerType === 'mouse' && e.button !== 0 ? null : { x: e.clientX, moved: false };
    });
    monthsEl.addEventListener('pointermove', e => {
      if (!drag || !e.buttons || (!drag.moved && Math.abs(e.clientX - drag.x) < 4)) return;
      if (!drag.moved) {
        drag.moved = true;
        // Captured only once it is a drag, so a mouse can stray off the bar
        // without ending it. Capturing on pointerdown would retarget a plain
        // click to the nav, where no bar would be found.
        monthsEl.setPointerCapture(e.pointerId);
      }
      const bar = barAt(e.clientX);
      if (bar && !bar.disabled) jumpTo(bar.dataset.month, false);
    });
    const endDrag = () => {
      if (drag && drag.moved) dragEnded = performance.now();
      drag = null;
    };
    monthsEl.addEventListener('pointerup', endDrag);
    monthsEl.addEventListener('pointercancel', endDrag);
    monthsEl.addEventListener('click', e => {
      if (performance.now() - dragEnded < 400) return;
      const bar = e.target.closest('.month');
      if (bar && !bar.disabled) jumpTo(bar.dataset.month, true);
    });
    // One tab stop for the whole bar; the arrow keys move between months.
    monthsEl.addEventListener('keydown', e => {
      const enabled = Array.from(bars.values()).filter(b => !b.disabled);
      const i = enabled.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: enabled.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      const bar = enabled[Math.max(0, Math.min(enabled.length - 1, next))];
      bar.focus();
      jumpTo(bar.dataset.month, false);
    });
  }

  function barAt(x) {
    const all = Array.from(bars.values());
    const rect = monthsEl.getBoundingClientRect();
    return all[Math.floor((x - rect.left) / rect.width * all.length)];
  }

  // The tile at the tracking line, a line just below the top of #content: of
  // the tiles that start above the line, the first one in the last row they
  // reach. Tile tops never decrease in wall order (see scripts/wall.js), so
  // the scan stops at the first tile below the line, and a month's first tile
  // is also its highest.
  function tileAtLine() {
    const line = contentEl.scrollTop - wallEl.offsetTop + JUMP_PAD + 1;
    let found = mediaTiles[0];
    for (const t of mediaTiles) {
      if (t.top > line) break;
      if (t.top > found.top) found = t;
    }
    return found;
  }

  function jumpTo(month, smooth) {
    const tile = mediaTiles.find(t => t.month === month);
    if (!tile) return;
    const max = contentEl.scrollHeight - contentEl.clientHeight;
    const top = Math.max(0, Math.min(max, Math.round(wallEl.offsetTop + tile.top - JUMP_PAD)));
    // Once the jump lands, the bar shows the month asked for, even when that
    // month shares its first row with the month before it.
    pinned = { month, scrollTop: top, reached: false };
    contentEl.scrollTo({ top, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
    updateSpy();
  }

  function setupScrollSpy() {
    let current = null;
    updateSpy = () => {
      const top = contentEl.scrollTop;
      let month;
      if (pinned && Math.abs(top - pinned.scrollTop) < 2) {
        pinned.reached = true;
        month = pinned.month;
      } else {
        // A pin lasts until the reader scrolls away from where it landed.
        if (pinned && pinned.reached) pinned = null;
        month = top + contentEl.clientHeight >= contentEl.scrollHeight - 2
          ? mediaTiles[mediaTiles.length - 1].month
          : tileAtLine().month;
      }
      if (month === current) return;
      if (current) {
        const old = bars.get(current);
        old.classList.remove('active');
        old.removeAttribute('aria-current');
        old.tabIndex = -1;
      }
      const bar = bars.get(month);
      bar.classList.add('active');
      bar.setAttribute('aria-current', 'true');
      bar.tabIndex = 0;
      const [y, m] = month.split('-').map(Number);
      nowEl.textContent = `${MONTHS[m - 1]} ${y}`;
      current = month;
    };
    let queued = false;
    contentEl.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; updateSpy(); });
    }, { passive: true });
    updateSpy();
  }

  function setupViewer() {
    const stage = viewerEl.querySelector('.viewer-stage');
    const info = viewerEl.querySelector('.viewer-info');
    let at = -1;
    let openedAt = 0;
    let swipeX = null;
    let swiped = false;
    const vv = window.visualViewport;
    // Zoomed in, a sideways drag pans the photo instead of changing it.
    const zoomed = () => !!vv && vv.scale > 1.01;
    if (vv) vv.addEventListener('resize', () => viewerEl.classList.toggle('zoomed', zoomed()));

    function show(i) {
      at = (i + viewable.length) % viewable.length;
      const item = viewable[at];
      let media;
      if (item.type === 'video') {
        media = document.createElement('video');
        Object.assign(media, { src: item.src, controls: true, autoplay: true, muted: true, loop: true, playsInline: true });
      } else {
        media = document.createElement('img');
        media.alt = item.caption || '';
        if (hasCopies(item)) {
          media.width = item.width;
          media.height = item.height;
          media.src = thumbUrl(item.thumb, 800);
        } else {
          media.src = item.src;
        }
      }
      stage.replaceChildren(media);
      const date = validDate(item.date);
      const [y, m, d] = date.split('-');
      const parts = [`${String(at + 1).padStart(3, '0')} / ${viewable.length}`,
        `${WEEKDAYS[weekday(date)]} ${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`];
      if (item.caption) parts.push(item.caption);
      if (date.slice(5) === ANNIVERSARY.slice(5) && date >= ANNIVERSARY) parts.push(`${anniversary(date)} ♥`);
      info.textContent = parts.join('    ');
    }
    function open(i) {
      openedAt = performance.now();
      show(i);
      viewerEl.hidden = false;
      viewerEl.querySelector('.viewer-close').focus();
    }
    function close() {
      viewerEl.hidden = true;
      stage.replaceChildren();
      // Back to the last photo viewed, which scrolls the wall to it.
      wallEl.querySelector(`.tile-media[data-index="${at}"]`)?.focus();
    }

    wallEl.addEventListener('click', e => {
      const tile = e.target.closest('.tile-media');
      if (tile) open(Number(tile.dataset.index));
    });
    viewerEl.addEventListener('click', e => {
      const step = e.target.closest('[data-step]');
      if (step) show(at + Number(step.dataset.step));
      // A click on the dark backdrop closes, unless it ends a swipe or is the
      // second click of the double click that opened the viewer.
      else if (e.target.closest('.viewer-close') || (e.target === stage && !swiped && performance.now() - openedAt > 400)) close();
      swiped = false;
    });
    stage.addEventListener('pointerdown', e => {
      swipeX = e.clientX;
      swiped = false;
    });
    stage.addEventListener('pointerup', e => {
      if (swipeX === null) return;
      const dx = e.clientX - swipeX;
      swipeX = null;
      if (Math.abs(dx) < 50 || zoomed()) return;
      swiped = true;
      show(at + (dx < 0 ? 1 : -1));
    });
    window.addEventListener('keydown', e => {
      if (viewerEl.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(at - 1);
      else if (e.key === 'ArrowRight') show(at + 1);
      else if (e.key === 'Tab') {
        // Keep focus inside the viewer while it is open.
        const focusable = Array.from(viewerEl.querySelectorAll('button, video[controls]'));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!viewerEl.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function showMessage(text) {
    const p = document.createElement('p');
    p.className = 'wall-message';
    p.textContent = text;
    wallEl.style.height = '';
    wallEl.replaceChildren(p);
  }

  // Dates are read from the string and never through a local Date, so nothing
  // shown depends on the viewer's timezone.
  function validDate(date) { return DATE_SHAPE.test(date || '') ? date : ANNIVERSARY; }
  function weekday(date) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }
  function shortDate(date) {
    const [y, m, d] = date.split('-');
    return `${d} ${MONTHS[m - 1].slice(0, 3).toUpperCase()} ${y}`;
  }
  function longDate(date) {
    const [y, m, d] = date.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  function anniversary(date) {
    const years = Number(date.slice(0, 4)) - Number(ANNIVERSARY.slice(0, 4));
    if (years === 0) return 'day one';
    const teen = years % 100 >= 11 && years % 100 <= 13;
    const suffix = teen ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[years % 10] || 'th';
    return `${years}${suffix} anniversary`;
  }
  function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }
  function isPoem(item) { return item.type === 'poem'; }
  function countLabel(items, separator) {
    const videos = items.filter(item => item.type === 'video').length;
    return plural(items.length - videos, 'photo') + (videos ? `${separator}${plural(videos, 'video')}` : '');
  }
  function span(className, text) {
    const s = document.createElement('span');
    s.className = className;
    s.textContent = text;
    return s;
  }
  function reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // Check if user is authorized
  if (sessionStorage.getItem('unlocked') !== '1') {
    window.location.href = 'index.html';
    return;
  }

  render().catch(err => {
    console.error('Render failed:', err);
    showMessage('The photos did not load. Refresh the page to try again.');
  });
})();
