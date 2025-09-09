(function(){
  const audio = document.getElementById('bgAudio');
  const btn = document.getElementById('musicToggle');
  let userInteracted = false;

  // Restore volume from localStorage
  if (audio) {
    const savedVolume = localStorage.getItem('musicVolume');
    if (savedVolume !== null) {
      audio.volume = parseFloat(savedVolume);
    } else {
      audio.volume = 0.3; // Default volume
    }
  }

  function updateBtn() {
    const playing = audio && !audio.paused;
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    btn.textContent = playing ? 'Pause music' : 'Play music';
  }

  function tryPlay() {
    if (!userInteracted) return;
    audio.play().then(updateBtn).catch(()=>{});
  }

  // Music player is always visible on app page
  updateBtn();

  btn?.addEventListener('click', () => {
    userInteracted = true;
    if (audio.paused) tryPlay(); else { audio.pause(); updateBtn(); }
  });

  // Save volume changes
  audio?.addEventListener('volumechange', () => {
    localStorage.setItem('musicVolume', audio.volume.toString());
  });

  audio?.addEventListener('play', updateBtn);
  audio?.addEventListener('pause', updateBtn);
})();
