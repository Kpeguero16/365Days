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
  function getSeason(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const m = d.getUTCMonth() + 1; // 1-12
    const y = d.getUTCFullYear();
    if ([12,1,2].includes(m)) return `Winter ${m===12?y:y}`;
    if ([3,4,5].includes(m)) return `Spring ${y}`;
    if ([6,7,8].includes(m)) return `Summer ${y}`;
    return `Fall ${y}`;
  }
  function groupBySeason(items) {
    const map = new Map();
    for (const it of items) {
      const key = getSeason(it.date || '2021-09-11');
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
