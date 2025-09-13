(function(){
  function setupReveals(root=document) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
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
