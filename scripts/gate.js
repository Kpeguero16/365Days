(function() {
  const ANNIV = '2021-09-11';

  function init() {
    const input = document.getElementById('anniv');
    const btn = document.getElementById('enterBtn');
    const msg = document.getElementById('gateMsg');

    // Check if already unlocked
    if (sessionStorage.getItem('unlocked') === '1') {
      window.location.href = 'app.html';
      return;
    }

    btn?.addEventListener('click', () => {
      const val = input?.value || '';
      if (!val) {
        msg.textContent = 'Pick a date';
        return;
      }
      if (val === ANNIV) {
        msg.textContent = '';
        sessionStorage.setItem('unlocked', '1');
        window.location.href = 'app.html';
      } else {
        msg.textContent = 'That wasn\'t our day. Try again ❤️';
      }
    });
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
