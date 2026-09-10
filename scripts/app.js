(function(){
  console.log('App.js script loaded');
  const contentEl = document.getElementById('content');
  const timelineEl = document.getElementById('timeline');
  
  if (!contentEl) {
    console.error('Content element not found');
    return;
  }
  if (!timelineEl) {
    console.error('Timeline element not found');
    return;
  }

  async function render() {
    console.log('App render started');
    const data = await window.ContentAPI.loadContent();
    console.log('Content loaded:', data);
    const groups = window.ContentAPI.groupBySeason(data.items || []);
    console.log('Groups created:', groups);

    const sections = groups.length ? groups : [
      {
        season: 'Autumn 2021',
        items: [
          { type: 'image', src: 'assets/images/0E13A9A5-2409-4353-A8D2-81F2F377DF48_1_105_c.jpeg', date: '2021-09-12', caption: 'A day after' },
          { type: 'image', src: 'assets/images/2D636C04-9879-4A3F-BF79-0A0A57D208C6_1_105_c.jpeg', date: '2021-10-01', caption: 'Smiles' }
        ]
      }
    ];

    timelineEl.innerHTML = '';
    sections.forEach(sec => {
      const a = document.createElement('a');
      a.href = `#${cssId(sec.season)}`;
      a.textContent = sec.season;
      timelineEl.appendChild(a);
      
      // Add trip links
      if (sec.trips && sec.trips.length > 0) {
        sec.trips.forEach(trip => {
          const tripLink = document.createElement('a');
          tripLink.href = `#${cssId(sec.season)}-${cssId(trip.trip)}`;
          tripLink.textContent = trip.trip;
          tripLink.className = 'trip';
          timelineEl.appendChild(tripLink);
        });
      }
    });

    contentEl.innerHTML = '';
    sections.forEach(sec => {
      const secEl = document.createElement('section');
      secEl.className = 'section';
      secEl.id = cssId(sec.season);
      secEl.innerHTML = `
        <div class="section-header">
          <h2 class="section-title">${sec.season}</h2>
        </div>
        <div class="grid"></div>
        <div></div>
      `;
      const grid = secEl.querySelector('.grid');
      
      // Separate poems and other items
      const poems = sec.items.filter(item => item.type === 'poem');
      const otherItems = sec.items.filter(item => item.type !== 'poem');
      
      // Add poems first, spanning full width
      poems.forEach(poem => {
        const poemCard = renderItem(poem);
        poemCard.style.gridColumn = '1 / -1'; // Span all columns
        grid.appendChild(poemCard);
      });
      
      // Add other items
      otherItems.forEach(item => {
        grid.appendChild(renderItem(item));
      });
      
      // The season goes in before its trips. Navigation lists the season link
      // first and its trip links after it, so appending the trips first put
      // every season's trips ahead of the season they belong to, immediately
      // after the previous season's content.
      contentEl.appendChild(secEl);

      // Add trip subsections
      if (sec.trips && sec.trips.length > 0) {
        sec.trips.forEach(trip => {
          const tripEl = document.createElement('div');
          tripEl.className = 'trip-section';
          tripEl.id = `${cssId(sec.season)}-${cssId(trip.trip)}`;
          tripEl.innerHTML = `
            <h3 class="trip-title">${escapeHtml(trip.trip)}</h3>
            <div class="grid"></div>
          `;
          const tripGrid = tripEl.querySelector('.grid');
          
          // Separate poems and other items for trips too
          const tripPoems = trip.items.filter(item => item.type === 'poem');
          const tripOtherItems = trip.items.filter(item => item.type !== 'poem');
          
          // Add poems first, spanning full width
          tripPoems.forEach(poem => {
            const poemCard = renderItem(poem);
            poemCard.style.gridColumn = '1 / -1'; // Span all columns
            tripGrid.appendChild(poemCard);
          });
          
          // Add other items
          tripOtherItems.forEach(item => {
            tripGrid.appendChild(renderItem(item));
          });
          contentEl.appendChild(tripEl);
        });
      }
    });

    setupScrollSpy();
    setupSidebarNavigation();
    window.MediaAPI.setupReveals(contentEl);
    window.MediaAPI.lazyLoadMedia(contentEl);
  }

  function renderItem(item) {
    const card = document.createElement('article');
    card.className = 'card reveal';
    if (item.type === 'video') {
      const v = document.createElement('video');
      v.setAttribute('muted', '');
      v.setAttribute('loop', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('preload', 'none');
      v.setAttribute('data-src', item.src);
      if (item.poster) v.setAttribute('data-poster', item.poster);
      card.appendChild(v);
    } else if (item.type === 'poem') {
      card.classList.add('poem');
      const div = document.createElement('div');
      div.style.padding = '20px';
      div.innerHTML = `<h3>${escapeHtml(item.title || 'Poem')}</h3><p>${escapeHtml(item.text || '')}</p>`;
      card.appendChild(div);
    } else {
      const img = document.createElement('img');
      img.alt = item.caption || '';
      img.loading = 'lazy';
      img.setAttribute('data-src', item.src);
      // Only add srcset if @2x version exists (we'll check this in the lazy loader)
      card.appendChild(img);
    }
    const meta = document.createElement('div');
    meta.className = 'meta';
    const dateText = item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    meta.textContent = `${dateText}${item.caption ? ' · ' + item.caption : ''}`;
    card.appendChild(meta);
    return card;
  }

  function cssId(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g,'-'); }

  // Scroll spy. This reads scroll position rather than observing
  // intersections. `intersectionRatio` divides by *target* area, so a short
  // section sitting inside the viewport outscores a tall one filling it —
  // measured mid-page in real content, a 1450px section holding 238px of the
  // activation band beat a 2476px section holding 279px. A section taller
  // than the band divided by the smallest threshold also never reports as
  // intersecting at all, because `isIntersecting` follows the threshold
  // index. Seasons here run from one screen to ten screens tall, so both
  // cases are ordinary rather than edge cases. Comparing positions is
  // independent of how tall a target is.
  function setupScrollSpy() {
    const links = Array.from(timelineEl.querySelectorAll('a'));
    const map = new Map(links.map(a => [a.getAttribute('href')?.slice(1), a]));
    // Seasons and trips together, in document order, so a trip chip can go
    // active too. Trips were previously left out of this entirely.
    const targets = Array.from(contentEl.querySelectorAll('.section, .trip-section'));
    if (!targets.length) return;

    function activeTarget() {
      // At the end of the scroller a short final target may never reach the
      // line, and it is what the reader is looking at regardless.
      if (contentEl.scrollTop + contentEl.clientHeight >= contentEl.scrollHeight - 2) {
        return targets[targets.length - 1];
      }
      // Positions are read each time rather than cached at render: media
      // loads lazily and changes section heights as it arrives.
      const contentTop = contentEl.getBoundingClientRect().top;
      // The activation line sits a quarter of the way down the scrollport, so
      // a section becomes current once it has properly arrived rather than
      // when its first pixel appears.
      const line = contentEl.clientHeight * 0.25;
      let current = targets[0];
      for (const el of targets) {
        if (el.getBoundingClientRect().top - contentTop > line) break;
        current = el;
      }
      return current;
    }

    function update() {
      const active = map.get(activeTarget().id);
      links.forEach(a => a.classList.toggle('active', a === active));
    }

    let queued = false;
    contentEl.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; update(); });
    }, { passive: true });

    update();
  }

  function setupSidebarNavigation() {
    timelineEl.addEventListener('click', (e) => {
      e.preventDefault();
      const href = e.target.getAttribute('href');
      if (!href) return;
      
      const target = document.querySelector(href);
      if (target) {
        // Temporarily disable scroll-snap for smooth navigation
        contentEl.style.scrollSnapType = 'none';
        
        // Use scrollIntoView with smooth behavior for the animation
        target.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
        
        // Re-enable scroll-snap after scroll completes
        setTimeout(() => {
          contentEl.style.scrollSnapType = 'y mandatory';
        }, 1000);
      }
    });
  }

  function escapeHtml(s='') {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt','"':'&quot;','\'':'&#39;'}[c]));
  }

  // Check if user is authorized
  if (sessionStorage.getItem('unlocked') !== '1') {
    window.location.href = 'index.html';
    return;
  }

  // Render the app immediately. Navigation, scroll spy, reveals and lazy
  // loading are registered at the end of render(), where the DOM they observe
  // has just been built; registering them here as well gave every chip two
  // click handlers and every media element two loading observers, and the
  // second observer re-ran load()/play() on videos the first had started.
  render().catch(err => {
    console.error('Render failed:', err);
    contentEl.innerHTML = '<div style="padding: 48px; text-align: center;"><h2>Welcome to our journey</h2><p>Content is loading...</p></div>';
  });
})();
