(function(){
  function setupReveals(root=document) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    // threshold 0, not 0.1: `isIntersecting` is derived from the threshold
    // index, so an element too tall to ever reach 10% of the viewport never
    // reports as intersecting and never reveals. A 130-card season is about
    // 6900px in a 552px phone scroller, a maximum ratio of 0.08.
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
    root.querySelectorAll('.reveal, .section').forEach(el => io.observe(el));
  }
  function lazyLoadMedia(root=document) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const t = e.target;
          const src = t.getAttribute('data-src');
          if (src) {
            t.setAttribute('src', src);
            t.removeAttribute('data-src');
          }
          const poster = t.getAttribute('data-poster');
          if (poster) t.setAttribute('poster', poster);
          if (t.tagName === 'VIDEO') {
            t.muted = true; // Ensure video is muted before playing
            t.load();
            t.play().catch(()=>{});
          }
          io.unobserve(t);
        }
      }
    }, { rootMargin: '200px 0px', threshold: 0 });
    root.querySelectorAll('img[data-src], video[data-src]').forEach(el => io.observe(el));
  }
  window.MediaAPI = { setupReveals, lazyLoadMedia };
})();
