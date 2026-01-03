// ================================
// KEVIN PAGE — AUDIO & INTERACTIONS
// ================================

// Audio playback management
let currentAudio = null;

function playAudio(audioId) {
  const audio = document.getElementById('audio-' + audioId);
  if (!audio) return;

  // Stop any currently playing audio
  if (currentAudio && currentAudio !== audio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  // If clicking the same audio that's playing, stop it
  if (currentAudio === audio && !audio.paused) {
    audio.pause();
    audio.currentTime = 0;
    currentAudio = null;
    return;
  }

  // Play the new audio
  audio.currentTime = 0;
  audio.play();
  currentAudio = audio;
}

// Wire up clickable elements (click to play)
document.querySelectorAll('.clickable[data-audio]').forEach(el => {
  el.addEventListener('click', (e) => {
    // Don't trigger audio if clicking the CTA button (it uses hover)
    if (el.classList.contains('kevin-btn')) return;
    
    const audioId = el.dataset.audio;
    playAudio(audioId);
  });
});

// CTA button plays audio on hover, links normally on click
const ctaBtn = document.querySelector('.kevin-btn');
if (ctaBtn) {
  ctaBtn.addEventListener('mouseenter', () => {
    const audio = document.getElementById('audio-password-yes');
    if (audio) {
      audio.currentTime = 0;
      audio.play();
      currentAudio = audio;
    }
  });
}

// Easter egg: Click Stefon 5 times quickly for Stefon rain
let stefonClicks = 0;
let stefonClickTimeout = null;
const stefonImg = document.querySelector('.kevin-hero-image');

if (stefonImg) {
  stefonImg.addEventListener('click', () => {
    stefonClicks++;
    
    clearTimeout(stefonClickTimeout);
    stefonClickTimeout = setTimeout(() => {
      stefonClicks = 0;
    }, 2000);
    
    if (stefonClicks >= 5) {
      stefonClicks = 0;
      rainStefons();
    }
  });
}

function rainStefons() {
  for (let i = 0; i < 30; i++) {
    setTimeout(() => {
      const stefon = document.createElement('img');
      stefon.src = 'https://middleton.io/kevin/images/stefon.png';
      stefon.className = 'stefon-rain';
      stefon.style.left = Math.random() * 100 + 'vw';
      stefon.style.width = (40 + Math.random() * 60) + 'px';
      stefon.style.animationDuration = (2 + Math.random() * 3) + 's';
      document.body.appendChild(stefon);
      
      setTimeout(() => stefon.remove(), 5000);
    }, i * 100);
  }
}
