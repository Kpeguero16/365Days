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
      for (const item of sec.items) {
        grid.appendChild(renderItem(item));
      }
      
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
          for (const item of trip.items) {
            tripGrid.appendChild(renderItem(item));
          }
          contentEl.appendChild(tripEl);
        });
      }
      
      contentEl.appendChild(secEl);
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
      const div = document.createElement('div');
      div.style.padding = '16px';
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

  function setupScrollSpy() {
    const links = Array.from(timelineEl.querySelectorAll('a'));
    const map = new Map(links.map(a => [a.getAttribute('href')?.slice(1), a]));
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const id = e.target.id;
          links.forEach(a => a.classList.toggle('active', a === map.get(id)));
        }
      }
    }, { root: contentEl, threshold: 0.6 });
    document.querySelectorAll('.section').forEach(sec => io.observe(sec));
  }

  function setupSidebarNavigation() {
    timelineEl.addEventListener('click', (e) => {
      e.preventDefault();
      const href = e.target.getAttribute('href');
      if (!href) return;
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // Render the app immediately
  render().catch(err => {
    console.error('Render failed:', err);
    contentEl.innerHTML = '<div style="padding: 48px; text-align: center;"><h2>Welcome to our journey</h2><p>Content is loading...</p></div>';
  });
})();
