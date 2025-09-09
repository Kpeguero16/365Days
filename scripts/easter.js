(function(){
  const content = document.getElementById('content');
  let clicks = 0; let timer;
  let konamiCode = [];
  const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
  
  // Triple click for cat
  content?.addEventListener('click', () => {
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(() => { clicks = 0; }, 800);
    if (clicks === 3) {
      spawnConfetti('cat'); clicks = 0;
    }
  });
  
  // P key for puppy
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'p') spawnConfetti('puppy');
    
    // Konami code for surprise
    konamiCode.push(e.code);
    if (konamiCode.length > konamiSequence.length) {
      konamiCode.shift();
    }
    if (konamiCode.join(',') === konamiSequence.join(',')) {
      spawnConfetti('surprise');
      konamiCode = [];
    }
  });
  
  // Click on brand for special message
  const brand = document.querySelector('.brand');
  brand?.addEventListener('click', () => {
    spawnConfetti('heart');
  });
  
  function spawnConfetti(kind) {
    const emojis = {
      cat: '🐈‍⬛',
      puppy: '🐶', 
      heart: '❤️',
      surprise: '🎉'
    };
    
    const count = kind === 'surprise' ? 5 : 1;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.textContent = emojis[kind] || '✨';
      el.style.position = 'fixed';
      el.style.left = Math.random()*100 + 'vw';
      el.style.top = '-20px';
      el.style.fontSize = kind === 'surprise' ? '24px' : '28px';
      el.style.transition = 'transform 2.2s ease, opacity 2.2s ease';
      el.style.zIndex = 9999;
      el.style.pointerEvents = 'none';
      document.body.appendChild(el);
      
      requestAnimationFrame(() => {
        el.style.transform = `translateY(110vh) rotate(${360 + Math.random()*360}deg)`;
        el.style.opacity = '0';
      });
      
      setTimeout(() => el.remove(), 2300);
    }
    
    if (kind === 'surprise') {
      // Show special message
      const msg = document.createElement('div');
      msg.textContent = 'You found the secret! 🎊';
      msg.style.position = 'fixed';
      msg.style.top = '50%';
      msg.style.left = '50%';
      msg.style.transform = 'translate(-50%, -50%)';
      msg.style.fontSize = '24px';
      msg.style.color = 'var(--accent)';
      msg.style.fontWeight = 'bold';
      msg.style.zIndex = '10000';
      msg.style.pointerEvents = 'none';
      document.body.appendChild(msg);
      setTimeout(() => msg.remove(), 3000);
    }
  }
})();
