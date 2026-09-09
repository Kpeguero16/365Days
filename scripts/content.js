(function(){
  const CONTENT_URL = 'content.json';
  async function loadContent() {
    try {
      const res = await fetch(CONTENT_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to load content');
      return await res.json();
    } catch (e) {
      console.warn('Using fallback sample content:', e);
      return { items: [] };
    }
  }
  const DEFAULT_DATE = '2021-09-11';
  const DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

  // A winter spans two calendar years, so its label carries both: December opens
  // the winter named for the year it starts, and the following January and
  // February close it. `\u2013` is an en dash, escaped so the label cannot depend
  // on how a server labels this file's charset.
  function winterLabel(startYear) {
    return `Winter ${startYear}\u2013${String(startYear + 1).slice(2)}`;
  }

  // Read the calendar components straight out of the string. Constructing a Date
  // here would reintroduce a timezone: local-midnight parsing read back through
  // UTC getters put every first-of-month date in the previous season east of UTC.
  function getSeason(dateStr) {
    let parts = DATE_SHAPE.exec(dateStr);
    if (!parts || Number(parts[2]) < 1 || Number(parts[2]) > 12) {
      parts = DATE_SHAPE.exec(DEFAULT_DATE);
    }
    const y = Number(parts[1]);
    const m = Number(parts[2]);
    if (m === 12) return winterLabel(y);
    if (m <= 2) return winterLabel(y - 1);
    if (m <= 5) return `Spring ${y}`;
    if (m <= 8) return `Summer ${y}`;
    return `Fall ${y}`;
  }
  function groupBySeason(items) {
    const map = new Map();
    for (const it of items) {
      const key = getSeason(it.date || DEFAULT_DATE);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    
    // Sort items within each season by date (oldest first)
    for (const [season, items] of map) {
      items.sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    
    // Sort seasons by the earliest date in each season (oldest first)
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      const aEarliest = Math.min(...a[1].map(item => new Date(item.date)));
      const bEarliest = Math.min(...b[1].map(item => new Date(item.date)));
      return aEarliest - bEarliest;
    });
    
    return entries.map(([season, arr]) => {
      // Group by trip within season
      const tripMap = new Map();
      const noTrip = [];
      for (const item of arr) {
        if (item.trip) {
          if (!tripMap.has(item.trip)) tripMap.set(item.trip, []);
          tripMap.get(item.trip).push(item);
        } else {
          noTrip.push(item);
        }
      }
      const trips = Array.from(tripMap.entries()).map(([trip, items]) => ({ trip, items }));
      return { season, items: noTrip, trips };
    });
  }
  window.ContentAPI = { loadContent, groupBySeason };
})();
