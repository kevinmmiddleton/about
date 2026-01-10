// ===================
// BOOT LOADER
// ===================
window.addEventListener('load', () => {
    const bootLoader = document.getElementById('bootLoader');
    if (!bootLoader) return;

    // Critical assets to preload during boot
    const criticalAssets = [
        // Backgrounds
        'https://middleton.io/images/darkmode-bg.png',
        'https://middleton.io/images/lightmode-bg.png',
        // Profile & photos
        'https://middleton.io/images/profile-picture.jpg',
        'https://middleton.io/images/cat-illustration.png',
        'https://middleton.io/images/cats-photo.jpg',
        'https://middleton.io/images/carne-asada-fries-homemade.jpg',
        // Company logos (visible on initial load)
        'https://middleton.io/images/gridstrong-logo.png',
        'https://middleton.io/images/hvac-com-logo-stacked-white.png',
        'https://middleton.io/images/hurd-ai-logo.png',
        'https://middleton.io/images/lever-logo.webp',
        'https://middleton.io/images/sendoso-logo.png',
        'https://middleton.io/images/rocket-lawyer-logo.png',
        'https://middleton.io/images/oracle-logo.png',
    ];

    // Preload all critical images
    const preloadPromises = criticalAssets.map(src => {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve; // Don't block on failed loads
            img.src = src;
        });
    });

    // Wait for both: minimum boot animation time AND assets loaded
    const minBootTime = new Promise(resolve => setTimeout(resolve, 1500));

    Promise.all([minBootTime, ...preloadPromises]).then(() => {
        bootLoader.classList.add('hidden');
    });
});

let zIndex = 500;
let currentlyDraggingWindow = null; // Track window being dragged for snap detection
const windows = document.querySelectorAll('.window');
const icons = document.querySelectorAll('.desktop-icon[data-window]');
const dockItems = document.querySelectorAll('.dock-item[data-window]');
const allNavItems = document.querySelectorAll('.desktop-icon[data-window], .dock-item[data-window]');


function openWindow(id) {
    const win = document.querySelector(`.window[data-window="${id}"]`);
    if (!win) return;
    zIndex++;
    win.style.zIndex = zIndex;

    win.classList.add('window-open');
    win.classList.remove('window-minimized');
    // Mark this window's dock/icon as active (don't remove others)
    allNavItems.forEach(i => {
        if (i.dataset.window === id) {
            i.classList.add('active');
        }
    });
    // Set focus on the opened window
    if (typeof setWindowFocus === 'function') {
        setWindowFocus(win);
    }
}

function closeWindow(id) {
    const win = document.querySelector(`.window[data-window="${id}"]`);
    if (!win) return;
    win.classList.remove('window-open');

    // Also clean up mobile state if this was a mobile-active game
    if (win.classList.contains('mobile-active-game')) {
        win.classList.remove('mobile-active-game');
        win.style.display = '';

        // Show games folder again
        const gamesWin = document.getElementById('games');
        if (gamesWin) {
            gamesWin.classList.remove('mobile-hidden');
        }
    }

    // Clean up mobile recipes state if closing recipes on mobile
    if (id === 'recipesdb' && window.innerWidth <= 768) {
        const windowsArea = document.querySelector('.windows-area');
        if (windowsArea && windowsArea.classList.contains('mobile-recipes-open')) {
            windowsArea.style.removeProperty('display');
            windowsArea.style.removeProperty('position');
            windowsArea.style.removeProperty('inset');
            windowsArea.style.removeProperty('z-index');
            windowsArea.style.removeProperty('background');
            windowsArea.classList.remove('mobile-recipes-open');
            // Restore other windows' display
            windowsArea.querySelectorAll('.window').forEach(w => {
                w.style.removeProperty('display');
            });
            win.style.removeProperty('position');
            win.style.removeProperty('inset');
            win.style.removeProperty('width');
            win.style.removeProperty('height');
            win.style.removeProperty('max-height');
            win.style.removeProperty('border-radius');
            win.style.removeProperty('z-index');
        }
    }

    // Clear mobileActiveGame if it matches
    if (typeof mobileActiveGame !== 'undefined' && mobileActiveGame === id) {
        mobileActiveGame = null;
    }

    allNavItems.forEach(i => {
        if (i.dataset.window === id) i.classList.remove('active');
    });
}

function minimizeWindow(id) {
    const win = document.querySelector(`.window[data-window="${id}"]`);
    if (!win) return;
    win.classList.add('window-minimized');
    allNavItems.forEach(i => {
        if (i.dataset.window === id) i.classList.remove('active');
    });
}

// Click handlers for both icons and dock items
allNavItems.forEach(item => item.addEventListener('click', () => openWindow(item.dataset.window)));

// Focus management for windows
function setWindowFocus(focusedWin) {
    windows.forEach(w => {
        if (w === focusedWin) {
            w.classList.add('window-focused');
            w.classList.remove('window-inactive');
        } else if (w.classList.contains('window-open')) {
            w.classList.remove('window-focused');
            w.classList.add('window-inactive');
        }
    });
}

windows.forEach(win => {
    win.addEventListener('mousedown', () => {
        zIndex = Math.min(zIndex + 1, 549);
        win.style.setProperty('z-index', zIndex, 'important');

        // Always push recycle/notepad to back when any window is clicked
        const recycleWin = document.getElementById('recycleWindow');
        const notepadWin = document.getElementById('notepadWindow');
        if (recycleWin) recycleWin.style.setProperty('z-index', '1', 'important');
        if (notepadWin) notepadWin.style.setProperty('z-index', '1', 'important');

        // Only add active class to this window's nav items (don't remove from others - they stay active while open)
        allNavItems.forEach(i => {
            if (i.dataset.window === win.dataset.window) i.classList.add('active');
        });
        setWindowFocus(win);
    });
    win.querySelectorAll('.window-dot').forEach(dot => {
        dot.addEventListener('click', e => {
            e.stopPropagation();
            if (dot.dataset.action === 'close') closeWindow(win.dataset.window);
            if (dot.dataset.action === 'minimize') minimizeWindow(win.dataset.window);
            if (dot.dataset.action === 'maximize') {
                // Toggle between maximized and normal size
                if (win.classList.contains('snapped-top')) {
                    win.classList.remove('snapped-top');
                    win.style.top = '';
                    win.style.left = '';
                    win.style.width = '';
                    win.style.height = '';
                } else {
                    win.classList.remove('snapped-left', 'snapped-right');
                    win.classList.add('snapped-top');
                    // Set initial position for maximized window
                    win.style.top = '28px';
                    win.style.left = '0px';
                }
            }
        });
    });

    // Dragging
    const header = win.querySelector('.window-header');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    header.addEventListener('mousedown', e => {
        if (e.target.classList.contains('window-dot')) return;
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = win.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        win.style.transition = 'none';
        // Track this window for snap detection
        currentlyDraggingWindow = win;
    });

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        win.style.left = (startLeft + dx) + 'px';
        win.style.top = (startTop + dy) + 'px';
        win.style.transform = 'none';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            win.style.transition = '';
        }
    });
});

// ===================
// DOCK MAGNIFICATION
// ===================
const dock = document.getElementById('dock');
const dockItemsAll = dock.querySelectorAll('.dock-item');

dock.addEventListener('mousemove', (e) => {
    const dockRect = dock.getBoundingClientRect();
    const mouseX = e.clientX;
    
    dockItemsAll.forEach(item => {
        const itemRect = item.getBoundingClientRect();
        const itemCenterX = itemRect.left + itemRect.width / 2;
        const distance = Math.abs(mouseX - itemCenterX);
        const maxDistance = 100;
        
        if (distance < maxDistance) {
            const scale = 1 + (1 - distance / maxDistance) * 0.5; // Max 1.5x scale
            const translateY = (1 - distance / maxDistance) * -12; // Max -12px lift
            item.style.transform = `scale(${scale}) translateY(${translateY}px)`;
        } else {
            item.style.transform = '';
        }
    });
});

dock.addEventListener('mouseleave', () => {
    dockItemsAll.forEach(item => {
        item.style.transform = '';
    });
});

// Dock bounce animation on click
dockItemsAll.forEach(item => {
    item.addEventListener('click', () => {
        item.classList.add('bouncing');
        setTimeout(() => item.classList.remove('bouncing'), 500);
    });
});

// ===================
// DESKTOP ICON SELECTION
// ===================
let selectedIcon = null;

icons.forEach(icon => {
    // Single click to select
    icon.addEventListener('click', (e) => {
        // Remove selection from all icons
        icons.forEach(i => i.classList.remove('selected'));
        // Select this icon
        icon.classList.add('selected');
        selectedIcon = icon;
    });

    // Double click to open (in addition to existing behavior)
    icon.addEventListener('dblclick', () => {
        if (icon.dataset.window) {
            openWindow(icon.dataset.window);
        }
    });
});

// Click on desktop to deselect icons
document.querySelector('.desktop').addEventListener('click', (e) => {
    if (e.target.classList.contains('desktop') || e.target.closest('.windows-area')) {
        icons.forEach(i => i.classList.remove('selected'));
        selectedIcon = null;
    }
});

// Handle data-open buttons - open window on desktop, open overlay on mobile
document.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const windowId = btn.dataset.open;
        if (isMobile()) {
            // On mobile, open the overlay
            openMobileOverlay(windowId);
        } else {
            // On desktop, open the window
            openWindow(windowId);
        }
    });
});

// ===================
// MUSIC PLAYER
// ===================
const playlist = [
    { file: 'Abracadabra - Lady Gaga.mp3', title: 'Abracadabra', artist: 'Lady Gaga' },
    { file: 'Toxic - Britney Spears.mp3', title: 'Toxic', artist: 'Britney Spears' },
    { file: 'Telephone - Lady Gaga + Beyonce.mp3', title: 'Telephone', artist: 'Lady Gaga + Beyoncé' },
    { file: 'Baby One More Time - Britney Spears.mp3', title: 'Baby One More Time', artist: 'Britney Spears' },
    { file: 'Paparazzi - Lady Gaga.mp3', title: 'Paparazzi', artist: 'Lady Gaga' },
    { file: 'Shadow of a Man - Lady Gaga.mp3', title: 'Shadow of a Man', artist: 'Lady Gaga' },
    { file: 'Venus - Lady Gaga.mp3', title: 'Venus', artist: 'Lady Gaga' }
];

const musicBase = 'https://middleton.io/music/';
let currentTrack = 0;
let isPlaying = false;
const audio = new Audio();

const playerTitle = document.querySelector('.player-title');
const playerArtist = document.querySelector('.player-artist');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const progressBar = document.getElementById('progressBar');
const currentTime = document.querySelector('.player-time.current');
const remainingTime = document.querySelector('.player-time.remaining');

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
}

function loadTrack(index) {
    const track = playlist[index];
    playerTitle.textContent = track.title;
    playerArtist.textContent = track.artist;
    audio.src = musicBase + encodeURIComponent(track.file);
    progressBar.style.width = '0%';
    currentTime.textContent = '0:00';
    remainingTime.textContent = '-0:00';
}

function togglePlay() {
    if (isPlaying) {
        audio.pause();
        playBtn.textContent = '▶';
    } else {
        audio.play();
        playBtn.textContent = '⏸';
    }
    isPlaying = !isPlaying;
}

function nextTrack() {
    currentTrack = (currentTrack + 1) % playlist.length;
    loadTrack(currentTrack);
    if (isPlaying) audio.play();
}

function prevTrack() {
    currentTrack = (currentTrack - 1 + playlist.length) % playlist.length;
    loadTrack(currentTrack);
    if (isPlaying) audio.play();
}

playBtn.addEventListener('click', togglePlay);
nextBtn.addEventListener('click', nextTrack);
prevBtn.addEventListener('click', prevTrack);

audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
        progressBar.style.width = (audio.currentTime / audio.duration * 100) + '%';
        currentTime.textContent = formatTime(audio.currentTime);
        remainingTime.textContent = '-' + formatTime(audio.duration - audio.currentTime);
    }
});

audio.addEventListener('ended', nextTrack);

// Load first track
loadTrack(0);

// Debug: log what we're trying to load
audio.addEventListener('error', (e) => {
    console.error('Audio error:', audio.error);
    console.log('Attempted URL:', audio.src);
});

audio.addEventListener('canplay', () => {
    console.log('Audio ready to play:', audio.src);
});

// Player dragging
const musicPlayer = document.getElementById('musicPlayer');
const playerHeader = document.querySelector('.player-header');
let playerDragging = false;
let playerStartX, playerStartY, playerStartLeft, playerStartTop;

playerHeader.addEventListener('mousedown', e => {
    playerDragging = true;
    playerStartX = e.clientX;
    playerStartY = e.clientY;
    const rect = musicPlayer.getBoundingClientRect();
    playerStartLeft = rect.left;
    playerStartTop = rect.top;
    musicPlayer.style.transition = 'none';
});

document.addEventListener('mousemove', e => {
    if (!playerDragging) return;
    const dx = e.clientX - playerStartX;
    const dy = e.clientY - playerStartY;
    musicPlayer.style.right = 'auto';
    musicPlayer.style.bottom = 'auto';
    musicPlayer.style.left = (playerStartLeft + dx) + 'px';
    musicPlayer.style.top = (playerStartTop + dy) + 'px';
});

document.addEventListener('mouseup', () => {
    if (playerDragging) {
        playerDragging = false;
        musicPlayer.style.transition = '';
    }
});

// Close player button (desktop)
document.getElementById('closePlayer').addEventListener('click', (e) => {
    e.stopPropagation();
    musicPlayer.style.display = 'none';
    audio.pause();
    isPlaying = false;
    playBtn.textContent = '▶';
    document.getElementById('musicIcon').classList.remove('active');
});

// Minimize player button (desktop) - also closes
document.getElementById('minimizePlayer').addEventListener('click', (e) => {
    e.stopPropagation();
    musicPlayer.style.display = 'none';
    audio.pause();
    isPlaying = false;
    playBtn.textContent = '▶';
    document.getElementById('musicIcon').classList.remove('active');
});

// Mobile dismiss button
const mobileClosePlayer = document.getElementById('mobileClosePlayer');
if (mobileClosePlayer) {
    mobileClosePlayer.addEventListener('click', (e) => {
        e.stopPropagation();
        musicPlayer.style.display = 'none';
        audio.pause();
        isPlaying = false;
        playBtn.textContent = '▶';
    });
}

// Music icon toggle
document.getElementById('musicIcon').addEventListener('click', () => {
    const player = document.getElementById('musicPlayer');
    const icon = document.getElementById('musicIcon');
    if (player.style.display === 'none') {
        player.style.display = 'block';
        icon.classList.add('active');
    } else {
        player.style.display = 'none';
        audio.pause();
        isPlaying = false;
        playBtn.textContent = '▶';
        icon.classList.remove('active');
    }
});

// ===================
// RECYCLE BIN
// ===================
const recycleWindow = document.getElementById('recycleWindow');
const notepadWindow = document.getElementById('notepadWindow');
const recycleNote = document.getElementById('recycleNote');

// Helper to get next z-index (capped below mission control/launchpad at 550)
function getNextZIndex() {
    zIndex = Math.min(zIndex + 1, 549);
    return zIndex;
}

// Bring a window to front (works for any window element)
function bringToFront(winElement) {
    winElement.style.zIndex = getNextZIndex();
}

document.getElementById('recycleBin').addEventListener('click', () => {
    const virusOverlay = document.getElementById('virusOverlay');
    if (virusOverlay.classList.contains('active')) {
        virusOverlay.classList.remove('active');
        virusOverlay.innerHTML = `
            <div class="virus-screen">
                <div class="virus-text">
                    <div class="glitch" data-text="SYSTEM CORRUPTED">SYSTEM CORRUPTED</div>
                    <p>☠️ FATAL ERROR: do_not_click.exe has corrupted your system ☠️</p>
                </div>
            </div>
        `;
        document.body.style.filter = '';
        alert('🗑️ System restored! Files recovered from Recycle Bin. 🎉');
    } else {
        recycleWindow.style.zIndex = getNextZIndex();
        recycleWindow.style.display = 'block';
    }
});

if (recycleNote) {
    recycleNote.addEventListener('click', () => {
        notepadWindow.style.zIndex = getNextZIndex();
        notepadWindow.style.display = 'block';
    });
}

document.getElementById('closeRecycle').addEventListener('click', () => {
    recycleWindow.style.display = 'none';
});

document.getElementById('closeNotepad').addEventListener('click', () => {
    notepadWindow.style.display = 'none';
});

const recycleHeader = document.querySelector('.recycle-header');
let recycleDragging = false;
let recycleStartX, recycleStartY, recycleStartLeft, recycleStartTop;

recycleHeader.addEventListener('mousedown', e => {
    if (e.target.classList.contains('window-dot')) return;
    e.preventDefault();
    recycleWindow.style.zIndex = getNextZIndex();
    recycleDragging = true;
    recycleStartX = e.clientX;
    recycleStartY = e.clientY;
    const rect = recycleWindow.getBoundingClientRect();
    recycleStartLeft = rect.left;
    recycleStartTop = rect.top;
    recycleWindow.style.transition = 'none';
});

document.addEventListener('mousemove', e => {
    if (!recycleDragging) return;
    recycleWindow.style.left = (recycleStartLeft + e.clientX - recycleStartX) + 'px';
    recycleWindow.style.top = (recycleStartTop + e.clientY - recycleStartY) + 'px';
});

document.addEventListener('mouseup', () => {
    if (recycleDragging) {
        recycleDragging = false;
        recycleWindow.style.transition = '';
    }
});

const notepadHeader = document.querySelector('.notepad-header');
let notepadDragging = false;
let notepadStartX, notepadStartY, notepadStartLeft, notepadStartTop;

notepadHeader.addEventListener('mousedown', e => {
    if (e.target.classList.contains('window-dot')) return;
    e.preventDefault();
    notepadWindow.style.zIndex = getNextZIndex();
    notepadDragging = true;
    notepadStartX = e.clientX;
    notepadStartY = e.clientY;
    const rect = notepadWindow.getBoundingClientRect();
    notepadStartLeft = rect.left;
    notepadStartTop = rect.top;
    notepadWindow.style.transition = 'none';
});

document.addEventListener('mousemove', e => {
    if (!notepadDragging) return;
    notepadWindow.style.left = (notepadStartLeft + e.clientX - notepadStartX) + 'px';
    notepadWindow.style.top = (notepadStartTop + e.clientY - notepadStartY) + 'px';
});

document.addEventListener('mouseup', () => {
    if (notepadDragging) {
        notepadDragging = false;
        notepadWindow.style.transition = '';
    }
});


// ===================
// VIRUS EASTER EGG
// ===================
document.getElementById('virusBtn').addEventListener('click', () => {
    const overlay = document.getElementById('virusOverlay');
    overlay.classList.add('active');

    let countdown = 5;
    const countdownEl = document.getElementById('virusCountdown');

    const interval = setInterval(() => {
        countdown--;
        if (countdownEl) countdownEl.textContent = countdown;

        // Glitch effect intensifies
        document.body.style.filter = `hue-rotate(${Math.random() * 360}deg)`;

        if (countdown <= 0) {
            clearInterval(interval);
            // "Delete" effect - screen goes crazy then shows recovery
            setTimeout(() => {
                document.body.style.filter = 'invert(1)';
                setTimeout(() => {
                    document.body.style.filter = '';  // Clear all filters
                    setTimeout(() => {
                        // Show recovery options
                        const recoveryDiv = document.createElement('div');
                        recoveryDiv.className = 'recovery-hint';
                        recoveryDiv.innerHTML = `
                            <div class="recovery-title">👾 uh oh.</div>
                            <div class="recovery-subtitle">Unusual activity detected.</div>
                            <div class="recovery-buttons">
                                <button class="recovery-btn" id="wipeBtn">💾 Wipe</button>
                                <button class="recovery-btn" id="antivirusBtn">🛡️ Antivirus</button>
                                <button class="recovery-btn" id="ignoreBtn">🙈 Ignore</button>
                            </div>
                        `;
                        overlay.appendChild(recoveryDiv);

                        // Wipe - full page reload
                        document.getElementById('wipeBtn').addEventListener('click', () => {
                            location.reload();
                        });

                        // Antivirus - clean recovery
                        document.getElementById('antivirusBtn').addEventListener('click', () => {
                            overlay.classList.remove('active');
                            overlay.innerHTML = `
                                <div class="virus-screen">
                                    <div class="virus-text">
                                        <div class="glitch" data-text="SYSTEM CORRUPTED">SYSTEM CORRUPTED</div>
                                        <p>☠️ FATAL ERROR: do_not_click.exe has corrupted your system ☠️</p>
                                    </div>
                                </div>
                            `;
                            document.body.style.filter = '';
                            recoveryDiv.remove();
                        });

                        // Ignore - make it worse, then auto-recover
                        document.getElementById('ignoreBtn').addEventListener('click', () => {
                            recoveryDiv.remove();
                            let chaos = 0;
                            const chaosInterval = setInterval(() => {
                                chaos++;
                                document.body.style.filter = `hue-rotate(${Math.random() * 360}deg) blur(${Math.random() * 3}px)`;
                                document.body.style.transform = `rotate(${(Math.random() - 0.5) * 10}deg) scale(${1 + Math.random() * 0.1})`;
                                if (chaos > 15) {
                                    clearInterval(chaosInterval);
                                    document.body.style.filter = '';
                                    document.body.style.transform = '';
                                    overlay.classList.remove('active');
                                    overlay.innerHTML = `
                                        <div class="virus-screen">
                                            <div class="virus-text">
                                                <div class="glitch" data-text="SYSTEM CORRUPTED">SYSTEM CORRUPTED</div>
                                                <p>☠️ FATAL ERROR: do_not_click.exe has corrupted your system ☠️</p>
                                               <p class="virus-warning"><span id="virusCountdown">5</span>...</p>
                                            </div>
                                        </div>
                                    `;
                                }
                            }, 100);
                        });
                    }, 500);
                }, 300);
            }, 500);
        }
    }, 1000);
});

// ===================
// PARTY MODE
// ===================
let partyMode = false;
document.getElementById('partyBtn').addEventListener('click', () => {
    const overlay = document.getElementById('partyOverlay');
    const container = document.getElementById('confettiContainer');

    if (partyMode) {
        overlay.classList.remove('active');
        container.innerHTML = '';
        document.body.classList.remove('party-mode');
        partyMode = false;
        return;
    }

    partyMode = true;
    overlay.classList.add('active');
    document.body.classList.add('party-mode');

    // Create confetti
    const colors = ['#ff6eb4', '#5c8aff', '#4ae0a0', '#ffc048', '#a078ff', '#ff9f6a'];

    function createConfetti() {
        if (!partyMode) return;

        for (let i = 0; i < 5; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 98 + '%';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            container.appendChild(confetti);

            setTimeout(() => confetti.remove(), 4000);
        }

        setTimeout(createConfetti, 200);
    }

    createConfetti();

    // Auto-stop after 10 seconds
    setTimeout(() => {
        if (partyMode) {
            overlay.classList.remove('active');
            container.innerHTML = '';
            document.body.classList.remove('party-mode');
            partyMode = false;
        }
    }, 10000);
});

// ===================
// PHOTO VIEWER
// ===================
let photoZIndex = 100;

document.querySelectorAll('[data-photo]').forEach(img => {
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => {
        const src = img.dataset.photoSrc;
        const title = img.dataset.photoTitle;
        const id = 'photo-' + img.dataset.photo;

        // Check if already open
        if (document.getElementById(id)) {
            const existing = document.getElementById(id);
            photoZIndex++;
            existing.style.zIndex = photoZIndex;
            return;
        }

        // Create photo window
        const photoWin = document.createElement('div');
        photoWin.className = 'photo-window';
        photoWin.id = id;
        photoZIndex++;
        photoWin.style.zIndex = photoZIndex;

        photoWin.innerHTML = `
            <div class="photo-header">
                <div class="window-dots">
                    <button class="window-dot red photo-close"></button>
                    <span class="window-dot yellow"></span>
                    <span class="window-dot green"></span>
                </div>
                <span class="photo-title">${title}</span>
            </div>
            <div class="photo-body">
                <img src="${src}" alt="${title}">
            </div>
        `;

        document.getElementById('photoWindows').appendChild(photoWin);

        // Position randomly but visible
        const maxX = window.innerWidth - 350;
        const maxY = window.innerHeight - 350;
        photoWin.style.left = (100 + Math.random() * Math.max(0, maxX - 200)) + 'px';
        photoWin.style.top = (80 + Math.random() * Math.max(0, maxY - 200)) + 'px';

        // Close button
        photoWin.querySelector('.photo-close').addEventListener('click', () => {
            photoWin.remove();
        });

        // Bring to front on click
        photoWin.addEventListener('mousedown', () => {
            photoZIndex++;
            photoWin.style.zIndex = photoZIndex;
        });

        // Dragging
        const header = photoWin.querySelector('.photo-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', e => {
            if (e.target.classList.contains('photo-close')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = photoWin.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
        });

        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            photoWin.style.left = (startLeft + e.clientX - startX) + 'px';
            photoWin.style.top = (startTop + e.clientY - startY) + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    });
});

// ===================
// EXPERIENCE IMAGE LIGHTBOX
// ===================
function openLightbox(src, alt) {
    const overlay = document.getElementById('lightboxOverlay');
    const img = document.getElementById('lightboxImage');
    const title = document.getElementById('lightboxTitle');

    img.src = src;
    img.alt = alt;
    title.textContent = alt;
    overlay.classList.add('active');

    // Close on escape key
    document.addEventListener('keydown', closeLightboxOnEscape);
}

function closeLightbox() {
    const overlay = document.getElementById('lightboxOverlay');
    overlay.classList.remove('active');
    document.removeEventListener('keydown', closeLightboxOnEscape);
}

function closeLightboxOnEscape(e) {
    if (e.key === 'Escape') closeLightbox();
}

// ===================
// THEME TOGGLE
// ===================
const root = document.documentElement;

// Check system preference
function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// Apply theme
function applyTheme(theme) {
    root.dataset.theme = theme;
    const icon = theme === 'light' ? '🌙' : '☀️';
    // Update mobile theme icon
    const mobileThemeIcon = document.getElementById('mobileThemeIcon');
    if (mobileThemeIcon) {
        mobileThemeIcon.textContent = icon;
    }
    // Update menubar theme icon
    const menubarThemeToggle = document.getElementById('menubarThemeToggle');
    if (menubarThemeToggle) {
        menubarThemeToggle.textContent = icon;
    }
}

// On load: always start with system preference
applyTheme(getSystemTheme());

// Listen for system preference changes - always follow system
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    applyTheme(e.matches ? 'light' : 'dark');
});

// Mobile theme toggle
const mobileThemeToggle = document.getElementById('mobileThemeToggle');
if (mobileThemeToggle) {
    mobileThemeToggle.addEventListener('click', () => {
        const current = root.dataset.theme;
        applyTheme(current === 'light' ? 'dark' : 'light');
    });
}

// Menubar theme toggle
const menubarThemeToggle = document.getElementById('menubarThemeToggle');
if (menubarThemeToggle) {
    menubarThemeToggle.addEventListener('click', () => {
        const current = root.dataset.theme;
        applyTheme(current === 'light' ? 'dark' : 'light');
    });
}

// Mobile party button
const mobilePartyBtn = document.getElementById('mobilePartyBtn');
if (mobilePartyBtn) {
    mobilePartyBtn.addEventListener('click', () => {
        // Trigger the same party mode as desktop
        document.getElementById('partyBtn').click();
        // Close the folder after triggering party
        closeMobileSecretFolder();
    });
}

// Mobile secret folder toggle
const mobileSecretBtn = document.getElementById('mobileSecretBtn');
const mobileHiddenFolder = document.getElementById('mobileHiddenFolder');
const mobileHiddenBackdrop = document.getElementById('mobileHiddenBackdrop');

function openMobileSecretFolder() {
    if (mobileHiddenFolder && mobileHiddenBackdrop) {
        mobileHiddenBackdrop.classList.add('active');
        mobileHiddenFolder.classList.add('open');
    }
}

function closeMobileSecretFolder() {
    if (mobileHiddenFolder && mobileHiddenBackdrop) {
        mobileHiddenBackdrop.classList.remove('active');
        mobileHiddenFolder.classList.remove('open');
    }
}

if (mobileSecretBtn) {
    mobileSecretBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (mobileHiddenFolder && mobileHiddenFolder.classList.contains('open')) {
            closeMobileSecretFolder();
        } else {
            openMobileSecretFolder();
        }
    });
}

if (mobileHiddenBackdrop) {
    mobileHiddenBackdrop.addEventListener('click', closeMobileSecretFolder);
}

// Close folder after theme toggle too
if (mobileThemeToggle) {
    mobileThemeToggle.addEventListener('click', () => {
        closeMobileSecretFolder();
    });
}

// Mobile Apps folder (iPhone-style popup)
const dockAppsFolder = document.getElementById('dockAppsFolder');
const mobileAppsFolder = document.getElementById('mobileAppsFolder');
const mobileAppsBackdrop = document.getElementById('mobileAppsBackdrop');

// Mobile Games sub-folder
const mobileGamesBtn = document.getElementById('mobileGamesBtn');
const mobileMusicBtn = document.getElementById('mobileMusicBtn');
const mobileGamesFolder = document.getElementById('mobileGamesFolder');
const mobileGamesBackdrop = document.getElementById('mobileGamesBackdrop');

function openMobileAppsFolder() {
    if (mobileAppsFolder && mobileAppsBackdrop) {
        mobileAppsBackdrop.classList.add('active');
        mobileAppsFolder.classList.add('open');
    }
}

function closeMobileAppsFolder() {
    if (mobileAppsFolder && mobileAppsBackdrop) {
        mobileAppsBackdrop.classList.remove('active');
        mobileAppsFolder.classList.remove('open');
    }
}

function openMobileGamesFolder() {
    // Close apps folder first
    closeMobileAppsFolder();
    if (mobileGamesFolder && mobileGamesBackdrop) {
        setTimeout(() => {
            mobileGamesBackdrop.classList.add('active');
            mobileGamesFolder.classList.add('open');
        }, 100);
    }
}

function closeMobileGamesFolder() {
    if (mobileGamesFolder && mobileGamesBackdrop) {
        mobileGamesBackdrop.classList.remove('active');
        mobileGamesFolder.classList.remove('open');
    }
}

// Dock Apps folder trigger (desktop dock - unused on mobile)
if (dockAppsFolder) {
    dockAppsFolder.addEventListener('click', (e) => {
        e.preventDefault();
        openMobileAppsFolder();
    });
}

// Mobile contact bar Apps folder trigger
const mobileAppsFolderBtn = document.getElementById('mobileAppsFolderBtn');
if (mobileAppsFolderBtn) {
    mobileAppsFolderBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openMobileAppsFolder();
    });
}

// Springboard Apps folder trigger
const springboardAppsFolder = document.getElementById('springboardAppsFolder');
if (springboardAppsFolder) {
    springboardAppsFolder.addEventListener('click', (e) => {
        e.preventDefault();
        openMobileAppsFolder();
    });
}

// Apps folder backdrop closes it
if (mobileAppsBackdrop) {
    mobileAppsBackdrop.addEventListener('click', closeMobileAppsFolder);
}

// Games button opens games sub-folder
if (mobileGamesBtn) {
    mobileGamesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openMobileGamesFolder();
    });
}

// Music button opens music player
if (mobileMusicBtn) {
    mobileMusicBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeMobileAppsFolder();
        setTimeout(() => {
            if (musicPlayer) {
                musicPlayer.style.display = 'block';
            }
        }, 100);
    });
}

// Games folder backdrop closes it
if (mobileGamesBackdrop) {
    mobileGamesBackdrop.addEventListener('click', closeMobileGamesFolder);
}

// Open recipes on mobile with proper fullscreen handling
function openMobileRecipes() {
    const recipesWindow = document.getElementById('recipesdb');
    const windowsArea = document.querySelector('.windows-area');

    if (window.innerWidth <= 768) {
        // First, prepare everything while hidden
        if (recipesWindow) {
            // Add class for mobile state before showing
            recipesWindow.classList.add('mobile-fullscreen-ready');
            recipesWindow.style.setProperty('opacity', '0', 'important');
        }

        if (windowsArea) {
            windowsArea.style.setProperty('display', 'block', 'important');
            windowsArea.style.setProperty('position', 'fixed', 'important');
            windowsArea.style.setProperty('inset', '0', 'important');
            windowsArea.style.setProperty('z-index', '1000', 'important');
            windowsArea.style.setProperty('background', 'var(--bg)', 'important');
            windowsArea.classList.add('mobile-recipes-open');

            // Hide all other windows
            windowsArea.querySelectorAll('.window').forEach(win => {
                if (win.id !== 'recipesdb') {
                    win.style.setProperty('display', 'none', 'important');
                }
            });
        }

        if (recipesWindow) {
            recipesWindow.style.setProperty('display', 'flex', 'important');
            recipesWindow.style.setProperty('position', 'fixed', 'important');
            recipesWindow.style.setProperty('inset', '0', 'important');
            recipesWindow.style.setProperty('width', '100%', 'important');
            recipesWindow.style.setProperty('height', '100%', 'important');
            recipesWindow.style.setProperty('max-height', '100%', 'important');
            recipesWindow.style.setProperty('border-radius', '0', 'important');
            recipesWindow.style.setProperty('z-index', '1001', 'important');
            recipesWindow.classList.add('window-open');

            // Now reveal after everything is set up
            requestAnimationFrame(() => {
                recipesWindow.style.setProperty('opacity', '1', 'important');
                recipesWindow.classList.remove('mobile-fullscreen-ready');
            });
        }
    } else {
        openWindow('recipesdb');
    }
}

// Handle Recipes click in Apps folder
document.querySelectorAll('#mobileAppsFolder .mobile-folder-item[data-window="recipesdb"]').forEach(item => {
    item.addEventListener('click', () => {
        closeMobileAppsFolder();
        setTimeout(() => openMobileRecipes(), 100);
    });
});

// Handle game item clicks in the folder
document.querySelectorAll('.mobile-folder-item[data-game]').forEach(item => {
    item.addEventListener('click', () => {
        const gameId = item.dataset.game;
        closeMobileGamesFolder();
        // Small delay for folder close animation, then open game
        setTimeout(() => openGameOverlay(gameId), 150);
    });
});

function updateTime() {
    const now = new Date();
    // Menu bar time - uses system locale for 12/24 hour format
    const menubarTime = document.getElementById('menubarTime');
    if (menubarTime) {
        menubarTime.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
}
updateTime();
setInterval(updateTime, 60000);

// ===================
// FOLDER ITEM CLICKS
// ===================

// Mobile game embedding state
let mobileActiveGame = null;
const gamesFolderGrid = document.getElementById('gamesFolderGrid');
const gamesEmbed = document.getElementById('gamesEmbed');
const gamesWindow = document.getElementById('games');

// Game info for header updates
const gameInfo = {
    invaders: { icon: '👾', title: 'SCOPE CREEP' },
    tetris: { icon: '🧱', title: 'BACKLOG TETRIS' },
    bugsquash: { icon: '🐛', title: 'BUG SQUASH' },
    runner: { icon: '🏃', title: 'ROADMAP RUNNER' },
    snake: { icon: '🐍', title: 'STAKEHOLDER SNAKE' },
    standup: { icon: '⌨️', title: 'STANDUP SPEEDRUN' }
};

function showMobileGame(gameId) {
    const gameWindow = document.getElementById(gameId);
    if (!gameWindow || !gamesWindow) return;
    
    // Hide games folder
    gamesWindow.classList.add('mobile-hidden');
    
    // Show the game window (override the mobile display:none)
    gameWindow.style.display = 'block';
    gameWindow.classList.add('mobile-active-game');
    
    mobileActiveGame = gameId;
    
    // Scroll to the game
    gameWindow.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function returnToGamesFolder() {
    if (!mobileActiveGame) return;
    
    const gameWindow = document.getElementById(mobileActiveGame);
    if (gameWindow) {
        gameWindow.style.display = '';
        gameWindow.classList.remove('mobile-active-game');
    }
    
    // Show games folder
    if (gamesWindow) {
        gamesWindow.classList.remove('mobile-hidden');
        gamesWindow.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    mobileActiveGame = null;
}

document.querySelectorAll('.folder-item[data-window]').forEach(item => {
    item.addEventListener('click', () => {
        const targetWindow = item.dataset.window;
        
        // On mobile, show game window directly if it's a game
        if (isMobile() && gameInfo[targetWindow]) {
            showMobileGame(targetWindow);
        } else {
            openWindow(targetWindow);
        }
    });
});

// See All Games click handler
document.querySelectorAll('.see-all-games').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isMobile()) {
            // Close the current game and return to games folder popup
            const gameWindow = btn.closest('.game-window');
            if (gameWindow) {
                closeGameOverlay(gameWindow.id);
            }
        } else {
            // On desktop, close current game and open games folder
            const gameWindow = btn.closest('.game-window');
            if (gameWindow) {
                closeWindow(gameWindow.id);
            }
            openWindow('games');
        }
    });
});

// ===================
// URL PARAMETER HANDLING
// ===================
const urlParams = new URLSearchParams(window.location.search);
const gameParam = urlParams.get('game');
const openParam = urlParams.get('open');

const validGames = ['invaders', 'tetris', 'bugsquash', 'runner', 'snake', 'standup'];

if (gameParam && validGames.includes(gameParam)) {
    // Close README and open game instead
    closeWindow('readme');
    isFirstLoad = false;
    
    if (isMobile()) {
        // On mobile, use the mobile game display
        showMobileGame(gameParam);
    } else {
        // On desktop, open and center the game window
        openWindow(gameParam);
        const gameWin = document.getElementById(gameParam);
        if (gameWin) {
            gameWin.style.top = '60px';
            gameWin.style.left = '50%';
            gameWin.style.transform = 'translateX(-50%)';
        }
    }
} else if (openParam === 'games') {
    // Open games folder
    closeWindow('readme');
    isFirstLoad = false;
    
    if (isMobile()) {
        // On mobile, scroll to games folder
        const gamesFolder = document.getElementById('games');
        if (gamesFolder) {
            setTimeout(() => {
                gamesFolder.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    } else {
        // On desktop, open and center the games folder
        openWindow('games');
        const gamesWin = document.getElementById('games');
        if (gamesWin) {
            gamesWin.style.top = '60px';
            gamesWin.style.left = '50%';
            gamesWin.style.transform = 'translateX(-50%)';
        }
    }
}

// ===================
// SCOPE CREEP GAME
// ===================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('gameContainer');
const gameStart = document.getElementById('gameStart');
const gameOver = document.getElementById('gameOver');
const gameHud = document.getElementById('gameHud');
const startGameBtn = document.getElementById('startGameBtn');
const playAgainBtn = document.getElementById('playAgainBtn');
const whoAmIBtn = document.getElementById('whoAmIBtn');

// Game state
let gameRunning = false;
let score = 0;
let wave = 1;
let lives = 3;
let player, enemies, bullets, enemyBullets, explosions, powerups;
let enemyDirection = 1;
let enemyMoveTimer = 0;
let enemyMoveInterval = 60;
let enemyDropAmount = 20;
let playerInvincible = 0;
let rapidFireTimer = 0;
let shieldActive = false;
let lastShotTime = 0;
let powerupSpawned = false;

const PLAYER_SPEED = 6;
const BULLET_SPEED = 8;
const ENEMY_BULLET_SPEED = 4;
const SHOT_COOLDOWN = 250;
const RAPID_FIRE_COOLDOWN = 100;

// Wave formations
const FORMATIONS = {
    grid: (wave) => {
        const enemies = [];
        const rows = 3;
        const cols = 5;
        const enemyTypes = ['👾', '👽', '👻'];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const hasShield = wave > 2 && Math.random() < 0.2 + (wave * 0.05);
                enemies.push({
                    x: 60 + col * 70,
                    y: 40 + row * 50,
                    width: 36,
                    height: 36,
                    emoji: enemyTypes[row % 3],
                    alive: true,
                    hp: hasShield ? 2 : 1,
                    maxHp: hasShield ? 2 : 1
                });
            }
        }
        return enemies;
    },
    vShape: (wave) => {
        const enemies = [];
        const enemyTypes = ['👾', '👽', '👻'];
        const positions = [
            [2], 
            [1, 3], 
            [0, 4], 
            [0, 4],
            [1, 3]
        ];
        positions.forEach((cols, row) => {
            cols.forEach(col => {
                const hasShield = wave > 2 && Math.random() < 0.2 + (wave * 0.05);
                enemies.push({
                    x: 100 + col * 70,
                    y: 30 + row * 45,
                    width: 36,
                    height: 36,
                    emoji: enemyTypes[row % 3],
                    alive: true,
                    hp: hasShield ? 2 : 1,
                    maxHp: hasShield ? 2 : 1
                });
            });
        });
        return enemies;
    },
    diamond: (wave) => {
        const enemies = [];
        const enemyTypes = ['👾', '👽', '👻'];
        const positions = [
            [2],
            [1, 2, 3],
            [0, 1, 2, 3, 4],
            [1, 2, 3],
            [2]
        ];
        positions.forEach((cols, row) => {
            cols.forEach(col => {
                const hasShield = wave > 2 && Math.random() < 0.2 + (wave * 0.05);
                enemies.push({
                    x: 80 + col * 65,
                    y: 25 + row * 42,
                    width: 36,
                    height: 36,
                    emoji: enemyTypes[row % 3],
                    alive: true,
                    hp: hasShield ? 2 : 1,
                    maxHp: hasShield ? 2 : 1
                });
            });
        });
        return enemies;
    },
    scattered: (wave) => {
        const enemies = [];
        const enemyTypes = ['👾', '👽', '👻'];
        const count = 10 + Math.floor(wave / 2);
        for (let i = 0; i < count; i++) {
            const hasShield = wave > 2 && Math.random() < 0.2 + (wave * 0.05);
            enemies.push({
                x: 40 + Math.random() * (canvas.width - 120),
                y: 30 + Math.random() * 150,
                width: 36,
                height: 36,
                emoji: enemyTypes[Math.floor(Math.random() * 3)],
                alive: true,
                hp: hasShield ? 2 : 1,
                maxHp: hasShield ? 2 : 1
            });
        }
        return enemies;
    },
    boss: (wave) => {
        const bossHp = 10 + (Math.floor(wave / 5) * 5);
        return [{
            x: canvas.width / 2 - 40,
            y: 60,
            width: 80,
            height: 80,
            emoji: '👾',
            alive: true,
            hp: bossHp,
            maxHp: bossHp,
            isBoss: true
        }];
    }
};

function initGame() {
    score = 0;
    wave = 1;
    lives = 3;
    shieldActive = false;
    rapidFireTimer = 0;
    updateHud();
    initWave();
}

function initWave() {
    player = {
        x: canvas.width / 2 - 20,
        y: canvas.height - 50,
        width: 40,
        height: 30
    };
    
    bullets = [];
    enemyBullets = [];
    explosions = [];
    powerups = [];
    enemyDirection = 1;
    enemyMoveTimer = 0;
    enemyMoveInterval = Math.max(15, 60 - (wave - 1) * 5);
    powerupSpawned = false;

    // Choose formation based on wave
    if (wave % 5 === 0) {
        // Boss wave
        enemies = FORMATIONS.boss(wave);
    } else {
        const formations = ['grid', 'vShape', 'diamond', 'scattered'];
        const formationType = formations[(wave - 1) % 4];
        enemies = FORMATIONS[formationType](wave);
    }
}

function updateHud() {
    document.getElementById('gameScore').textContent = score;
    document.getElementById('gameWave').textContent = wave;
    let livesDisplay = '🚀'.repeat(Math.max(0, lives));
    if (shieldActive) livesDisplay += '🛡️';
    if (rapidFireTimer > 0) livesDisplay += '⚡';
    document.getElementById('gameLives').textContent = livesDisplay;
}

function shoot() {
    const now = Date.now();
    const cooldown = rapidFireTimer > 0 ? RAPID_FIRE_COOLDOWN : SHOT_COOLDOWN;
    if (now - lastShotTime < cooldown) return;
    lastShotTime = now;
    
    bullets.push({
        x: player.x + player.width / 2 - 3,
        y: player.y,
        width: 6,
        height: 15
    });
}

function enemyShoot() {
    const aliveEnemies = enemies.filter(e => e.alive && !e.isBoss);
    const boss = enemies.find(e => e.alive && e.isBoss);
    
    // Regular enemies shoot
    if (aliveEnemies.length > 0 && Math.random() < 0.02 + wave * 0.005) {
        const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        enemyBullets.push({
            x: shooter.x + shooter.width / 2 - 3,
            y: shooter.y + shooter.height,
            width: 6,
            height: 15
        });
    }
    
    // Boss shoots more frequently and multiple bullets
    if (boss && Math.random() < 0.08) {
        for (let i = -1; i <= 1; i++) {
            enemyBullets.push({
                x: boss.x + boss.width / 2 - 3 + (i * 30),
                y: boss.y + boss.height,
                width: 8,
                height: 18
            });
        }
    }
}

function spawnExplosion(x, y, size = 1) {
    explosions.push({
        x: x,
        y: y,
        frame: 0,
        maxFrames: 15,
        size: size
    });
}

function spawnPowerup(x, y) {
    if (powerupSpawned) return;
    if (Math.random() > 0.15) return; // 15% chance
    
    powerupSpawned = true;
    const types = ['rapidfire', 'shield', 'life'];
    const type = types[Math.floor(Math.random() * types.length)];
    const emojis = { rapidfire: '⚡', shield: '🛡️', life: '❤️' };
    
    powerups.push({
        x: x,
        y: y,
        width: 24,
        height: 24,
        type: type,
        emoji: emojis[type]
    });
}

function collectPowerup(powerup) {
    switch (powerup.type) {
        case 'rapidfire':
            rapidFireTimer = 600; // 10 seconds at 60fps
            break;
        case 'shield':
            shieldActive = true;
            break;
        case 'life':
            lives = Math.min(lives + 1, 5);
            break;
    }
    spawnExplosion(powerup.x + 12, powerup.y + 12, 0.5);
    updateHud();
}

function update() {
    if (!gameRunning) return;

    // Update timers
    if (playerInvincible > 0) playerInvincible--;
    if (rapidFireTimer > 0) rapidFireTimer--;

    // Move bullets
    bullets.forEach(b => b.y -= BULLET_SPEED);
    bullets = bullets.filter(b => b.y > -20);

    // Move enemy bullets
    enemyBullets.forEach(b => b.y += ENEMY_BULLET_SPEED);
    enemyBullets = enemyBullets.filter(b => b.y < canvas.height + 20);

    // Move powerups
    powerups.forEach(p => p.y += 2);
    powerups = powerups.filter(p => p.y < canvas.height + 20);

    // Update explosions
    explosions.forEach(e => e.frame++);
    explosions = explosions.filter(e => e.frame < e.maxFrames);

    // Move enemies
    enemyMoveTimer++;
    if (enemyMoveTimer >= enemyMoveInterval) {
        enemyMoveTimer = 0;
        
        let hitEdge = false;
        enemies.forEach(e => {
            if (e.alive) {
                if ((e.x + e.width > canvas.width - 20 && enemyDirection > 0) ||
                    (e.x < 20 && enemyDirection < 0)) {
                    hitEdge = true;
                }
            }
        });

        if (hitEdge) {
            enemyDirection *= -1;
            enemies.forEach(e => {
                if (e.alive && !e.isBoss) e.y += enemyDropAmount;
            });
        } else {
            const moveAmount = enemies.some(e => e.isBoss) ? 20 : 15;
            enemies.forEach(e => {
                if (e.alive) e.x += enemyDirection * moveAmount;
            });
        }
    }

    // Enemy shooting
    enemyShoot();

    // Collision detection - bullets hitting enemies
    bullets.forEach(bullet => {
        enemies.forEach(enemy => {
            if (enemy.alive && 
                bullet.x < enemy.x + enemy.width &&
                bullet.x + bullet.width > enemy.x &&
                bullet.y < enemy.y + enemy.height &&
                bullet.y + bullet.height > enemy.y) {
                bullet.y = -100; // Remove bullet
                enemy.hp--;
                
                if (enemy.hp <= 0) {
                    enemy.alive = false;
                    const points = enemy.isBoss ? 100 * wave : 10 * wave;
                    score += points;
                    spawnExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.isBoss ? 2 : 1);
                    spawnPowerup(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
                }
                updateHud();
            }
        });
    });

    // Collision detection - player collecting powerups
    powerups.forEach((powerup, index) => {
        if (powerup.x < player.x + player.width &&
            powerup.x + powerup.width > player.x &&
            powerup.y < player.y + player.height &&
            powerup.y + powerup.height > player.y) {
            collectPowerup(powerup);
            powerups.splice(index, 1);
        }
    });

    // Collision detection - enemy bullets hitting player
    if (playerInvincible <= 0) {
        enemyBullets.forEach(bullet => {
            if (bullet.x < player.x + player.width &&
                bullet.x + bullet.width > player.x &&
                bullet.y < player.y + player.height &&
                bullet.y + bullet.height > player.y) {
                bullet.y = canvas.height + 100;
                
                if (shieldActive) {
                    shieldActive = false;
                    spawnExplosion(player.x + player.width / 2, player.y, 0.5);
                } else {
                    lives--;
                    playerInvincible = 120; // 2 seconds invincibility
                    spawnExplosion(player.x + player.width / 2, player.y + player.height / 2, 0.8);
                }
                updateHud();
                if (lives <= 0) {
                    endGame();
                }
            }
        });
    }

    // Check if enemies reached bottom
    enemies.forEach(e => {
        if (e.alive && !e.isBoss && e.y + e.height > player.y) {
            endGame();
        }
    });

    // Check if wave cleared
    if (enemies.every(e => !e.alive)) {
        wave++;
        updateHud();
        initWave();
    }
}

function draw() {
    // Clear canvas
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw stars background
    ctx.fillStyle = '#333';
    for (let i = 0; i < 50; i++) {
        const x = (i * 97) % canvas.width;
        const y = (i * 53) % canvas.height;
        ctx.fillRect(x, y, 2, 2);
    }

    // Draw explosions
    explosions.forEach(exp => {
        const progress = exp.frame / exp.maxFrames;
        const alpha = 1 - progress;
        const size = 20 + progress * 30 * exp.size;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `${Math.floor(size)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💥', exp.x, exp.y);
        ctx.restore();
    });

    // Draw powerups
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    powerups.forEach(p => {
        ctx.fillText(p.emoji, p.x + p.width / 2, p.y + p.height);
    });

    // Draw player (rotated rocket pointing up)
    ctx.save();
    ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
    ctx.rotate(-Math.PI / 4); // Rotate 45 degrees counter-clockwise
    
    // Flash when invincible
    if (playerInvincible > 0 && Math.floor(playerInvincible / 8) % 2 === 0) {
        ctx.globalAlpha = 0.3;
    }
    
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚀', 0, 0);
    
    // Draw shield if active
    if (shieldActive) {
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, 25, 0, Math.PI * 2);
        ctx.strokeStyle = '#5c8aff';
        ctx.lineWidth = 3;
        ctx.stroke();
    }
    
    ctx.restore();

    // Draw enemies
    enemies.forEach(e => {
        if (e.alive) {
            const fontSize = e.isBoss ? 64 : 32;
            ctx.font = `${fontSize}px Arial`;
            ctx.textAlign = 'center';
            
            // Draw shield glow for enemies with hp > 1
            if (e.hp > 1 && e.maxHp > 1) {
                ctx.save();
                ctx.shadowColor = '#5c8aff';
                ctx.shadowBlur = 15;
                ctx.fillText(e.emoji, e.x + e.width / 2, e.y + e.height);
                ctx.restore();
                
                // Draw shield indicator
                ctx.save();
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.arc(e.x + e.width / 2, e.y + e.height / 2 + 5, e.isBoss ? 50 : 22, 0, Math.PI * 2);
                ctx.strokeStyle = '#5c8aff';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
            } else {
                ctx.fillText(e.emoji, e.x + e.width / 2, e.y + e.height);
            }
            
            // Draw boss health bar
            if (e.isBoss) {
                const barWidth = 70;
                const barHeight = 6;
                const barX = e.x + e.width / 2 - barWidth / 2;
                const barY = e.y - 10;
                const healthPercent = e.hp / e.maxHp;
                
                ctx.fillStyle = '#333';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                ctx.fillStyle = healthPercent > 0.3 ? '#4ae0a0' : '#ff6eb4';
                ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
            }
        }
    });

    // Draw bullets
    ctx.fillStyle = '#4ae0a0';
    bullets.forEach(b => {
        ctx.fillRect(b.x, b.y, b.width, b.height);
    });

    // Draw enemy bullets
    ctx.fillStyle = '#ff6eb4';
    enemyBullets.forEach(b => {
        ctx.fillRect(b.x, b.y, b.width, b.height);
    });
}

function gameLoop() {
    if (gameRunning) {
        update();
        draw();
        requestAnimationFrame(gameLoop);
    }
}

function isMobile() {
    return window.innerWidth <= 768;
}

function startGame() {
    gameStart.style.display = 'none';
    gameOver.style.display = 'none';
    canvas.style.display = 'block';
    gameHud.style.display = 'flex';
    
    // Show touch controls on mobile
    const touchControls = document.getElementById('touchControls');
    if (isMobile() && touchControls) {
        touchControls.classList.add('visible');
    }
    
    gameRunning = true;
    initGame();
    gameLoop();
    
    // Start autofire on mobile
    if (isMobile()) {
        startAutofire();
    }
}

// Autofire for mobile
let autofireInterval = null;

function startAutofire() {
    if (autofireInterval) clearInterval(autofireInterval);
    autofireInterval = setInterval(() => {
        if (gameRunning && isMobile()) {
            shoot();
        }
    }, rapidFireTimer > 0 ? RAPID_FIRE_COOLDOWN : SHOT_COOLDOWN);
}

function stopAutofire() {
    if (autofireInterval) {
        clearInterval(autofireInterval);
        autofireInterval = null;
    }
}

function getGameOverMessage(score, wave) {
    // Check if died on a boss wave
    const diedOnBoss = wave % 5 === 0;
    
    if (diedOnBoss && wave >= 5) {
        return "Even the exec's pet feature couldn't stop you... wait, it did.";
    }
    
    if (wave >= 10 || score >= 2000) {
        return "Senior PM energy. The scope fears you.";
    }
    
    if (wave >= 5 || score >= 800) {
        return "You held the line... briefly.";
    }
    
    if (wave >= 3 || score >= 300) {
        return "The scope crept. It always does.";
    }
    
    return "The backlog won this round.";
}

function endGame() {
    gameRunning = false;
    canvas.style.display = 'none';
    gameHud.style.display = 'none';
    
    // Hide touch controls
    const touchControls = document.getElementById('touchControls');
    if (touchControls) {
        touchControls.classList.remove('visible');
    }
    
    stopAutofire();
    
    gameOver.style.display = 'flex';
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalWave').textContent = wave;
    document.getElementById('gameMessage').textContent = getGameOverMessage(score, wave);
}

// Game controls
const keysPressed = {};

document.addEventListener('keydown', (e) => {
    keysPressed[e.key] = true;
    
    // Only handle game controls if game window is active
    const invadersWindow = document.getElementById('invaders');
    if (!invadersWindow.classList.contains('window-open') && !invadersWindow.classList.contains('mobile-active-game')) return;
    
    if (e.key === ' ' && gameRunning) {
        e.preventDefault();
        shoot();
    }
});

document.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
});

// Continuous movement
setInterval(() => {
    if (!gameRunning) return;
    if ((keysPressed['ArrowLeft'] || touchLeft) && player.x > 10) {
        player.x -= PLAYER_SPEED;
    }
    if ((keysPressed['ArrowRight'] || touchRight) && player.x < canvas.width - player.width - 10) {
        player.x += PLAYER_SPEED;
    }
}, 16);

// Button handlers
startGameBtn.addEventListener('click', startGame);
playAgainBtn.addEventListener('click', startGame);
whoAmIBtn.addEventListener('click', () => {
    openWindow('readme');
});

// Touch controls
let touchLeft = false;
let touchRight = false;

const touchLeftBtn = document.getElementById('touchLeft');
const touchRightBtn = document.getElementById('touchRight');

if (touchLeftBtn) {
    touchLeftBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchLeft = true;
    });
    touchLeftBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        touchLeft = false;
    });
    touchLeftBtn.addEventListener('mousedown', () => touchLeft = true);
    touchLeftBtn.addEventListener('mouseup', () => touchLeft = false);
    touchLeftBtn.addEventListener('mouseleave', () => touchLeft = false);
}

if (touchRightBtn) {
    touchRightBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchRight = true;
    });
    touchRightBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        touchRight = false;
    });
    touchRightBtn.addEventListener('mousedown', () => touchRight = true);
    touchRightBtn.addEventListener('mouseup', () => touchRight = false);
    touchRightBtn.addEventListener('mouseleave', () => touchRight = false);
}

// ===================
// BACKLOG TETRIS GAME
// ===================
const tetrisCanvas = document.getElementById('tetrisCanvas');
const tetrisCtx = tetrisCanvas ? tetrisCanvas.getContext('2d') : null;
const tetrisStart = document.getElementById('tetrisStart');
const tetrisOver = document.getElementById('tetrisOver');
const tetrisHud = document.getElementById('tetrisHud');
const startTetrisBtn = document.getElementById('startTetrisBtn');
const tetrisPlayAgainBtn = document.getElementById('tetrisPlayAgainBtn');
const tetrisWhoAmIBtn = document.getElementById('tetrisWhoAmIBtn');

// Tetris constants
const TETRIS_COLS = 10;
const TETRIS_ROWS = 20;
const TETRIS_BLOCK_SIZE = 24;
const TETRIS_COLORS = [
    null,
    '#4ae0a0', // I - mint
    '#5c8aff', // O - blue
    '#ff6eb4', // T - pink
    '#ffd93d', // S - yellow
    '#ff8c42', // Z - orange
    '#a855f7', // J - purple
    '#06b6d4', // L - cyan
];

// Story size labels for pieces
const STORY_SIZES = [null, 'XL', 'M', 'L', 'S', 'S', 'M', 'M'];

// Tetris pieces (tetrominos)
const TETRIS_PIECES = [
    null,
    [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]], // I
    [[2,2], [2,2]], // O
    [[0,3,0], [3,3,3], [0,0,0]], // T
    [[0,4,4], [4,4,0], [0,0,0]], // S
    [[5,5,0], [0,5,5], [0,0,0]], // Z
    [[6,0,0], [6,6,6], [0,0,0]], // J
    [[0,0,7], [7,7,7], [0,0,0]], // L
];

// Tetris game state
let tetrisRunning = false;
let tetrisBoard = [];
let tetrisScore = 0;
let tetrisSprint = 1;
let tetrisRowsCleared = 0;
let tetrisCurrentPiece = null;
let tetrisCurrentX = 0;
let tetrisCurrentY = 0;
let tetrisDropCounter = 0;
let tetrisDropInterval = 1000;
let tetrisLastTime = 0;

function createTetrisBoard() {
    return Array.from({ length: TETRIS_ROWS }, () => Array(TETRIS_COLS).fill(0));
}

function getRandomPiece() {
    const pieceIndex = Math.floor(Math.random() * 7) + 1;
    return {
        shape: TETRIS_PIECES[pieceIndex].map(row => [...row]),
        color: pieceIndex
    };
}

function rotatePiece(piece) {
    const rotated = piece.shape[0].map((_, i) => 
        piece.shape.map(row => row[i]).reverse()
    );
    return { ...piece, shape: rotated };
}

function collides(board, piece, offsetX, offsetY) {
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x] !== 0) {
                const newX = x + offsetX;
                const newY = y + offsetY;
                if (newX < 0 || newX >= TETRIS_COLS || newY >= TETRIS_ROWS) {
                    return true;
                }
                if (newY >= 0 && board[newY][newX] !== 0) {
                    return true;
                }
            }
        }
    }
    return false;
}

function mergePiece(board, piece, offsetX, offsetY) {
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x] !== 0) {
                const boardY = y + offsetY;
                const boardX = x + offsetX;
                if (boardY >= 0) {
                    board[boardY][boardX] = piece.color;
                }
            }
        }
    }
}

function clearRows(board) {
    let rowsCleared = 0;
    for (let y = TETRIS_ROWS - 1; y >= 0; y--) {
        if (board[y].every(cell => cell !== 0)) {
            board.splice(y, 1);
            board.unshift(Array(TETRIS_COLS).fill(0));
            rowsCleared++;
            y++; // Check the same row again
        }
    }
    return rowsCleared;
}

function spawnPiece() {
    tetrisCurrentPiece = getRandomPiece();
    tetrisCurrentX = Math.floor((TETRIS_COLS - tetrisCurrentPiece.shape[0].length) / 2);
    tetrisCurrentY = -1;
    
    // Game over if piece collides immediately
    if (collides(tetrisBoard, tetrisCurrentPiece, tetrisCurrentX, tetrisCurrentY + 1)) {
        endTetris();
    }
}

function dropPiece() {
    tetrisCurrentY++;
    if (collides(tetrisBoard, tetrisCurrentPiece, tetrisCurrentX, tetrisCurrentY)) {
        tetrisCurrentY--;
        mergePiece(tetrisBoard, tetrisCurrentPiece, tetrisCurrentX, tetrisCurrentY);
        
        const cleared = clearRows(tetrisBoard);
        if (cleared > 0) {
            tetrisRowsCleared += cleared;
            // Scoring: 100, 300, 500, 800 for 1, 2, 3, 4 rows
            const points = [0, 100, 300, 500, 800][cleared] * tetrisSprint;
            tetrisScore += points;
            
            // Speed up every 10 rows (new sprint)
            const newSprint = Math.floor(tetrisRowsCleared / 10) + 1;
            if (newSprint > tetrisSprint) {
                tetrisSprint = newSprint;
                tetrisDropInterval = Math.max(100, 1000 - (tetrisSprint - 1) * 100);
            }
            
            updateTetrisHud();
        }
        
        spawnPiece();
    }
    tetrisDropCounter = 0;
}

function hardDrop() {
    while (!collides(tetrisBoard, tetrisCurrentPiece, tetrisCurrentX, tetrisCurrentY + 1)) {
        tetrisCurrentY++;
        tetrisScore += 2;
    }
    dropPiece();
    updateTetrisHud();
}

function movePiece(dir) {
    tetrisCurrentX += dir;
    if (collides(tetrisBoard, tetrisCurrentPiece, tetrisCurrentX, tetrisCurrentY)) {
        tetrisCurrentX -= dir;
    }
}

function rotateCurrent() {
    const rotated = rotatePiece(tetrisCurrentPiece);
    const oldX = tetrisCurrentX;
    
    // Wall kick: try to fit the rotated piece
    let offset = 0;
    if (collides(tetrisBoard, rotated, tetrisCurrentX, tetrisCurrentY)) {
        offset = tetrisCurrentX > TETRIS_COLS / 2 ? -1 : 1;
        if (collides(tetrisBoard, rotated, tetrisCurrentX + offset, tetrisCurrentY)) {
            offset *= 2;
            if (collides(tetrisBoard, rotated, tetrisCurrentX + offset, tetrisCurrentY)) {
                return; // Can't rotate
            }
        }
    }
    
    tetrisCurrentPiece = rotated;
    tetrisCurrentX += offset;
}

function updateTetrisHud() {
    const scoreEl = document.getElementById('tetrisScore');
    const sprintEl = document.getElementById('tetrisSprint');
    const rowsEl = document.getElementById('tetrisRows');
    if (scoreEl) scoreEl.textContent = tetrisScore;
    if (sprintEl) sprintEl.textContent = tetrisSprint;
    if (rowsEl) rowsEl.textContent = tetrisRowsCleared;
}

function drawTetrisBlock(x, y, colorIndex, ghost = false) {
    const color = TETRIS_COLORS[colorIndex];
    const blockX = x * TETRIS_BLOCK_SIZE;
    const blockY = y * TETRIS_BLOCK_SIZE;
    
    if (ghost) {
        tetrisCtx.strokeStyle = color;
        tetrisCtx.lineWidth = 2;
        tetrisCtx.strokeRect(blockX + 2, blockY + 2, TETRIS_BLOCK_SIZE - 4, TETRIS_BLOCK_SIZE - 4);
    } else {
        // Block background
        tetrisCtx.fillStyle = color;
        tetrisCtx.fillRect(blockX, blockY, TETRIS_BLOCK_SIZE, TETRIS_BLOCK_SIZE);
        
        // Highlight (top-left)
        tetrisCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        tetrisCtx.fillRect(blockX, blockY, TETRIS_BLOCK_SIZE, 3);
        tetrisCtx.fillRect(blockX, blockY, 3, TETRIS_BLOCK_SIZE);
        
        // Shadow (bottom-right)
        tetrisCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        tetrisCtx.fillRect(blockX, blockY + TETRIS_BLOCK_SIZE - 3, TETRIS_BLOCK_SIZE, 3);
        tetrisCtx.fillRect(blockX + TETRIS_BLOCK_SIZE - 3, blockY, 3, TETRIS_BLOCK_SIZE);
        
        // Border
        tetrisCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        tetrisCtx.lineWidth = 1;
        tetrisCtx.strokeRect(blockX, blockY, TETRIS_BLOCK_SIZE, TETRIS_BLOCK_SIZE);
    }
}

function drawTetris() {
    if (!tetrisCtx) return;
    
    // Clear canvas
    tetrisCtx.fillStyle = '#0a0a0f';
    tetrisCtx.fillRect(0, 0, tetrisCanvas.width, tetrisCanvas.height);
    
    // Draw grid lines
    tetrisCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    tetrisCtx.lineWidth = 1;
    for (let x = 0; x <= TETRIS_COLS; x++) {
        tetrisCtx.beginPath();
        tetrisCtx.moveTo(x * TETRIS_BLOCK_SIZE, 0);
        tetrisCtx.lineTo(x * TETRIS_BLOCK_SIZE, tetrisCanvas.height);
        tetrisCtx.stroke();
    }
    for (let y = 0; y <= TETRIS_ROWS; y++) {
        tetrisCtx.beginPath();
        tetrisCtx.moveTo(0, y * TETRIS_BLOCK_SIZE);
        tetrisCtx.lineTo(tetrisCanvas.width, y * TETRIS_BLOCK_SIZE);
        tetrisCtx.stroke();
    }
    
    // Draw board
    for (let y = 0; y < TETRIS_ROWS; y++) {
        for (let x = 0; x < TETRIS_COLS; x++) {
            if (tetrisBoard[y][x] !== 0) {
                drawTetrisBlock(x, y, tetrisBoard[y][x]);
            }
        }
    }
    
    // Draw ghost piece
    if (tetrisCurrentPiece) {
        let ghostY = tetrisCurrentY;
        while (!collides(tetrisBoard, tetrisCurrentPiece, tetrisCurrentX, ghostY + 1)) {
            ghostY++;
        }
        for (let y = 0; y < tetrisCurrentPiece.shape.length; y++) {
            for (let x = 0; x < tetrisCurrentPiece.shape[y].length; x++) {
                if (tetrisCurrentPiece.shape[y][x] !== 0 && ghostY + y >= 0) {
                    drawTetrisBlock(tetrisCurrentX + x, ghostY + y, tetrisCurrentPiece.color, true);
                }
            }
        }
    }
    
    // Draw current piece
    if (tetrisCurrentPiece) {
        for (let y = 0; y < tetrisCurrentPiece.shape.length; y++) {
            for (let x = 0; x < tetrisCurrentPiece.shape[y].length; x++) {
                if (tetrisCurrentPiece.shape[y][x] !== 0 && tetrisCurrentY + y >= 0) {
                    drawTetrisBlock(tetrisCurrentX + x, tetrisCurrentY + y, tetrisCurrentPiece.color);
                }
            }
        }
    }
}

function tetrisGameLoop(time = 0) {
    if (!tetrisRunning) return;
    
    const deltaTime = time - tetrisLastTime;
    tetrisLastTime = time;
    
    tetrisDropCounter += deltaTime;
    if (tetrisDropCounter > tetrisDropInterval) {
        dropPiece();
    }
    
    drawTetris();
    requestAnimationFrame(tetrisGameLoop);
}

function initTetris() {
    tetrisBoard = createTetrisBoard();
    tetrisScore = 0;
    tetrisSprint = 1;
    tetrisRowsCleared = 0;
    tetrisDropInterval = 1000;
    tetrisDropCounter = 0;
    tetrisLastTime = 0;
    updateTetrisHud();
    spawnPiece();
}

function startTetris() {
    if (tetrisStart) tetrisStart.style.display = 'none';
    if (tetrisOver) tetrisOver.style.display = 'none';
    if (tetrisCanvas) tetrisCanvas.style.display = 'block';
    if (tetrisHud) tetrisHud.style.display = 'flex';
    
    // Show touch controls on mobile
    const touchControls = document.getElementById('tetrisTouchControls');
    if (isMobile() && touchControls) {
        touchControls.classList.add('visible');
    }
    
    tetrisRunning = true;
    initTetris();
    tetrisGameLoop();
}

function getTetrisMessage(score, rows) {
    if (rows >= 40) return "Principal PM energy. The backlog trembles.";
    if (rows >= 20) return "Senior shipping skills. Impressive velocity.";
    if (rows >= 10) return "You cleared a few sprints. Not bad.";
    if (rows >= 5) return "The backlog won. It always does.";
    return "Sprint planning needed.";
}

function endTetris() {
    tetrisRunning = false;
    if (tetrisCanvas) tetrisCanvas.style.display = 'none';
    if (tetrisHud) tetrisHud.style.display = 'none';
    if (tetrisOver) tetrisOver.style.display = 'flex';
    
    // Hide touch controls
    const touchControls = document.getElementById('tetrisTouchControls');
    if (touchControls) touchControls.classList.remove('visible');
    
    const finalScore = document.getElementById('tetrisFinalScore');
    const finalRows = document.getElementById('tetrisFinalRows');
    const message = document.getElementById('tetrisMessage');
    
    if (finalScore) finalScore.textContent = tetrisScore;
    if (finalRows) finalRows.textContent = tetrisRowsCleared;
    if (message) message.textContent = getTetrisMessage(tetrisScore, tetrisRowsCleared);
}

// Tetris keyboard controls
document.addEventListener('keydown', (e) => {
    const tetrisWindow = document.getElementById('tetris');
    if (!tetrisWindow || (!tetrisWindow.classList.contains('window-open') && !tetrisWindow.classList.contains('mobile-active-game'))) return;
    if (!tetrisRunning) return;
    
    switch (e.key) {
        case 'ArrowLeft':
            e.preventDefault();
            movePiece(-1);
            break;
        case 'ArrowRight':
            e.preventDefault();
            movePiece(1);
            break;
        case 'ArrowUp':
            e.preventDefault();
            rotateCurrent();
            break;
        case 'ArrowDown':
            e.preventDefault();
            dropPiece();
            tetrisScore += 1;
            updateTetrisHud();
            break;
        case ' ':
            e.preventDefault();
            hardDrop();
            break;
    }
});

// Tetris button handlers
if (startTetrisBtn) startTetrisBtn.addEventListener('click', startTetris);
if (tetrisPlayAgainBtn) tetrisPlayAgainBtn.addEventListener('click', startTetris);
if (tetrisWhoAmIBtn) tetrisWhoAmIBtn.addEventListener('click', () => openWindow('readme'));

// Tetris touch controls
const tetrisTouchLeft = document.getElementById('tetrisTouchLeft');
const tetrisTouchRight = document.getElementById('tetrisTouchRight');
const tetrisTouchRotate = document.getElementById('tetrisTouchRotate');
const tetrisTouchDrop = document.getElementById('tetrisTouchDrop');

let tetrisTouchLeftInterval = null;
let tetrisTouchRightInterval = null;

if (tetrisTouchLeft) {
    tetrisTouchLeft.addEventListener('touchstart', (e) => {
        e.preventDefault();
        movePiece(-1);
        tetrisTouchLeftInterval = setInterval(() => movePiece(-1), 100);
    });
    tetrisTouchLeft.addEventListener('touchend', () => clearInterval(tetrisTouchLeftInterval));
    tetrisTouchLeft.addEventListener('click', () => movePiece(-1));
}

if (tetrisTouchRight) {
    tetrisTouchRight.addEventListener('touchstart', (e) => {
        e.preventDefault();
        movePiece(1);
        tetrisTouchRightInterval = setInterval(() => movePiece(1), 100);
    });
    tetrisTouchRight.addEventListener('touchend', () => clearInterval(tetrisTouchRightInterval));
    tetrisTouchRight.addEventListener('click', () => movePiece(1));
}

if (tetrisTouchRotate) {
    tetrisTouchRotate.addEventListener('touchstart', (e) => {
        e.preventDefault();
        rotateCurrent();
    });
    tetrisTouchRotate.addEventListener('click', rotateCurrent);
}

if (tetrisTouchDrop) {
    tetrisTouchDrop.addEventListener('touchstart', (e) => {
        e.preventDefault();
        hardDrop();
    });
    tetrisTouchDrop.addEventListener('click', hardDrop);
}

// ===================
// BUG SQUASH GAME
// ===================
const bugGrid = document.getElementById('bugGrid');
const bugSquashStart = document.getElementById('bugSquashStart');
const bugSquashOver = document.getElementById('bugSquashOver');
const bugSquashHud = document.getElementById('bugSquashHud');
const startBugSquashBtn = document.getElementById('startBugSquashBtn');
const bugPlayAgainBtn = document.getElementById('bugPlayAgainBtn');
const bugWhoAmIBtn = document.getElementById('bugWhoAmIBtn');

// Bug Squash state
let bugSquashRunning = false;
let bugsSquashed = 0;
let bugsEscaped = 0;
let activeBugs = [];
let bugSpawnInterval = null;
let bugSpawnRate = 1500;
let slowModeTimer = 0;
let slowModeInterval = null;

const BUG_EMOJIS = ['🐛', '🐜', '🐞', '🦗', '🕷️'];
const FEATURE_EMOJIS = ['✨', '🚀', '⭐', '📦', '🎯'];
const MAX_ESCAPED = 10;

function getRandomBugEmoji() {
    return BUG_EMOJIS[Math.floor(Math.random() * BUG_EMOJIS.length)];
}

function getRandomFeatureEmoji() {
    return FEATURE_EMOJIS[Math.floor(Math.random() * FEATURE_EMOJIS.length)];
}

function updateBugHud() {
    const scoreEl = document.getElementById('bugScore');
    const escapedEl = document.getElementById('bugEscaped');
    const activeEl = document.getElementById('bugActive');
    if (scoreEl) scoreEl.textContent = bugsSquashed;
    if (escapedEl) escapedEl.textContent = bugsEscaped;
    if (activeEl) activeEl.textContent = activeBugs.length;
}

function getEmptySpots() {
    const spots = document.querySelectorAll('.bug-spot');
    const empty = [];
    spots.forEach((spot, index) => {
        if (!spot.classList.contains('has-bug') && !spot.classList.contains('has-powerup') && !spot.classList.contains('has-feature')) {
            empty.push(index);
        }
    });
    return empty;
}

function spawnBug(count = 1) {
    if (!bugSquashRunning) return;
    
    for (let i = 0; i < count; i++) {
        const emptySpots = getEmptySpots();
        if (emptySpots.length === 0) continue;
        
        const spotIndex = emptySpots[Math.floor(Math.random() * emptySpots.length)];
        const spot = document.querySelector(`.bug-spot[data-spot="${spotIndex}"]`);
        if (!spot) continue;
        
        // Determine what to spawn: 70% bug, 20% feature, 10% powerup
        const roll = Math.random();
        
        if (roll < 0.10) {
            // Spawn powerup
            const powerupType = Math.random() < 0.5 ? 'hotfix' : 'coverage';
            spot.classList.add('has-powerup');
            spot.dataset.powerup = powerupType;
            spot.innerHTML = `<span class="bug-emoji">${powerupType === 'hotfix' ? '🔥' : '🧪'}</span>`;
            
            // Powerups disappear after 3 seconds
            setTimeout(() => {
                if (spot.classList.contains('has-powerup')) {
                    spot.classList.remove('has-powerup');
                    spot.innerHTML = '';
                    delete spot.dataset.powerup;
                }
            }, 3000);
        } else if (roll < 0.30) {
            // Spawn feature (don't click!)
            const featureEmoji = getRandomFeatureEmoji();
            spot.classList.add('has-feature');
            spot.innerHTML = `<span class="bug-emoji">${featureEmoji}</span>`;
            
            // Features disappear after 2.5 seconds (no penalty)
            setTimeout(() => {
                if (spot.classList.contains('has-feature')) {
                    spot.classList.remove('has-feature');
                    spot.innerHTML = '';
                }
            }, 2500);
        } else {
            // Spawn bug
            const bugId = Date.now() + Math.random();
            const bugEmoji = getRandomBugEmoji();
            
            spot.classList.add('has-bug');
            spot.dataset.bugId = bugId;
            spot.innerHTML = `<span class="bug-emoji">${bugEmoji}</span>`;
            
            // Bug escapes after 2-4 seconds based on difficulty
            const escapeTime = Math.max(1500, 3000 - (bugsSquashed * 20));
            const bugTimeout = setTimeout(() => {
                if (spot.dataset.bugId == bugId && spot.classList.contains('has-bug')) {
                    escapeBug(spot);
                }
            }, escapeTime);
            
            activeBugs.push({ id: bugId, spot: spotIndex, timeout: bugTimeout });
        }
    }
    updateBugHud();
}

function escapeBug(spot) {
    if (!bugSquashRunning) return;
    
    const bugId = spot.dataset.bugId;
    spot.classList.remove('has-bug');
    spot.innerHTML = '';
    delete spot.dataset.bugId;
    
    // Remove from active bugs
    activeBugs = activeBugs.filter(b => b.id != bugId);
    
    bugsEscaped++;
    updateBugHud();
    
    // Spawn 2 more bugs when one escapes
    setTimeout(() => spawnBug(2), 300);
    
    // Check game over
    if (bugsEscaped >= MAX_ESCAPED) {
        endBugSquash();
    }
}

function squashBug(spot) {
    if (!bugSquashRunning) return;
    
    // Clicked a FEATURE - penalty!
    if (spot.classList.contains('has-feature')) {
        spot.classList.remove('has-feature');
        spot.classList.add('squashed');
        spot.innerHTML = '❌';
        
        setTimeout(() => {
            spot.classList.remove('squashed');
            spot.innerHTML = '';
        }, 300);
        
        // Penalty: spawn 2 bugs
        setTimeout(() => spawnBug(2), 300);
        return;
    }
    
    // Clicked a powerup
    if (spot.classList.contains('has-powerup')) {
        const powerupType = spot.dataset.powerup;
        spot.classList.remove('has-powerup');
        spot.innerHTML = '';
        delete spot.dataset.powerup;
        
        if (powerupType === 'hotfix') {
            // Clear all bugs
            document.querySelectorAll('.bug-spot.has-bug').forEach(bugSpot => {
                const bugId = bugSpot.dataset.bugId;
                activeBugs = activeBugs.filter(b => {
                    if (b.id == bugId) {
                        clearTimeout(b.timeout);
                        return false;
                    }
                    return true;
                });
                bugSpot.classList.remove('has-bug');
                bugSpot.classList.add('squashed');
                setTimeout(() => bugSpot.classList.remove('squashed'), 200);
                bugSpot.innerHTML = '💥';
                setTimeout(() => { bugSpot.innerHTML = ''; }, 200);
                bugsSquashed++;
            });
        } else if (powerupType === 'coverage') {
            // Slow spawn rate for 5 seconds
            slowModeTimer = 5000;
            if (slowModeInterval) clearInterval(slowModeInterval);
            clearInterval(bugSpawnInterval);
            bugSpawnInterval = setInterval(() => spawnBug(1), bugSpawnRate * 2);
            slowModeInterval = setTimeout(() => {
                clearInterval(bugSpawnInterval);
                bugSpawnInterval = setInterval(() => spawnBug(1), bugSpawnRate);
            }, 5000);
        }
        updateBugHud();
        return;
    }
    
    if (!spot.classList.contains('has-bug')) return;
    
    const bugId = spot.dataset.bugId;
    
    // Clear the escape timeout
    activeBugs = activeBugs.filter(b => {
        if (b.id == bugId) {
            clearTimeout(b.timeout);
            return false;
        }
        return true;
    });
    
    spot.classList.remove('has-bug');
    spot.classList.add('squashed');
    spot.innerHTML = '💥';
    
    setTimeout(() => {
        spot.classList.remove('squashed');
        spot.innerHTML = '';
    }, 200);
    
    delete spot.dataset.bugId;
    bugsSquashed++;
    
    // Speed up spawns as game progresses
    if (bugsSquashed % 5 === 0 && bugSpawnRate > 500) {
        bugSpawnRate -= 100;
        clearInterval(bugSpawnInterval);
        bugSpawnInterval = setInterval(() => spawnBug(1), bugSpawnRate);
    }
    
    updateBugHud();
}

function initBugSquash() {
    bugsSquashed = 0;
    bugsEscaped = 0;
    activeBugs = [];
    bugSpawnRate = 1500;
    
    // Clear all spots
    document.querySelectorAll('.bug-spot').forEach(spot => {
        spot.classList.remove('has-bug', 'has-powerup', 'has-feature', 'squashed');
        spot.innerHTML = '';
        delete spot.dataset.bugId;
        delete spot.dataset.powerup;
    });
    
    updateBugHud();
}

function startBugSquash() {
    if (bugSquashStart) bugSquashStart.style.display = 'none';
    if (bugSquashOver) bugSquashOver.style.display = 'none';
    if (bugGrid) bugGrid.style.display = 'grid';
    if (bugSquashHud) bugSquashHud.style.display = 'flex';
    
    bugSquashRunning = true;
    initBugSquash();
    
    // Start spawning bugs
    spawnBug(1);
    bugSpawnInterval = setInterval(() => spawnBug(1), bugSpawnRate);
}

function getBugMessage(squashed) {
    if (squashed >= 50) return "Senior debugger energy. The codebase fears you.";
    if (squashed >= 30) return "Solid QA skills. Ship it!";
    if (squashed >= 15) return "You squashed a few. Could be worse.";
    if (squashed >= 5) return "Too many bugs escaped. QA is not happy.";
    return "Did you even try? The bugs won.";
}

function endBugSquash() {
    bugSquashRunning = false;
    
    // Clear intervals
    if (bugSpawnInterval) clearInterval(bugSpawnInterval);
    if (slowModeInterval) clearTimeout(slowModeInterval);
    
    // Clear all bug timeouts
    activeBugs.forEach(b => clearTimeout(b.timeout));
    activeBugs = [];
    
    if (bugGrid) bugGrid.style.display = 'none';
    if (bugSquashHud) bugSquashHud.style.display = 'none';
    if (bugSquashOver) bugSquashOver.style.display = 'flex';
    
    const finalScore = document.getElementById('bugFinalScore');
    const message = document.getElementById('bugMessage');
    
    if (finalScore) finalScore.textContent = bugsSquashed;
    if (message) message.textContent = getBugMessage(bugsSquashed);
}

// Bug spot click handlers
document.querySelectorAll('.bug-spot').forEach(spot => {
    spot.addEventListener('click', () => squashBug(spot));
    spot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        squashBug(spot);
    });
});

// Button handlers
if (startBugSquashBtn) startBugSquashBtn.addEventListener('click', startBugSquash);
if (bugPlayAgainBtn) bugPlayAgainBtn.addEventListener('click', startBugSquash);
if (bugWhoAmIBtn) bugWhoAmIBtn.addEventListener('click', () => openWindow('readme'));

// ===================
// ROADMAP RUNNER GAME
// ===================
const runnerCanvas = document.getElementById('runnerCanvas');
const runnerCtx = runnerCanvas ? runnerCanvas.getContext('2d') : null;
const runnerStart = document.getElementById('runnerStart');
const runnerOver = document.getElementById('runnerOver');
const runnerHud = document.getElementById('runnerHud');
const startRunnerBtn = document.getElementById('startRunnerBtn');
const runnerPlayAgainBtn = document.getElementById('runnerPlayAgainBtn');
const runnerWhoAmIBtn = document.getElementById('runnerWhoAmIBtn');

// Runner constants
const RUNNER_GROUND = 160;
const RUNNER_GRAVITY = 0.8;
const RUNNER_JUMP_FORCE = -14;
const RUNNER_SLIDE_HEIGHT = 20;
const RUNNER_NORMAL_HEIGHT = 40;

// Runner state
let runnerRunning = false;
let runnerScore = 0;
let runnerDistance = 0;
let runnerSpeed = 5;
let runnerPlayer = null;
let runnerObstacles = [];
let runnerCollectibles = [];
let runnerLastTime = 0;
let runnerSpawnTimer = 0;

// Obstacle types
const OBSTACLES = [
    { emoji: '🚧', width: 30, height: 35, type: 'jump' },      // Blocker - jump over
    { emoji: '📋', width: 25, height: 40, type: 'jump' },      // Scope creep - jump over
    { emoji: '🔴', width: 40, height: 20, type: 'slide', y: RUNNER_GROUND - 70 }, // Red tape - slide under (higher up)
    { emoji: '💀', width: 30, height: 35, type: 'jump' },      // Tech debt - jump over
];

// Collectible types
const COLLECTIBLES = [
    { emoji: '✅', points: 10 },   // Shipped feature
    { emoji: '⭐', points: 25 },   // Customer love
];

function initRunner() {
    runnerScore = 0;
    runnerDistance = 0;
    runnerSpeed = 5;
    runnerObstacles = [];
    runnerCollectibles = [];
    runnerSpawnTimer = 0;
    
    runnerPlayer = {
        x: 60,
        y: RUNNER_GROUND - RUNNER_NORMAL_HEIGHT,
        width: 30,
        height: RUNNER_NORMAL_HEIGHT,
        vy: 0,
        isJumping: false,
        isSliding: false,
        slideTimer: 0
    };
    
    updateRunnerHud();
}

function updateRunnerHud() {
    const scoreEl = document.getElementById('runnerScore');
    const distEl = document.getElementById('runnerDistance');
    if (scoreEl) scoreEl.textContent = runnerScore;
    if (distEl) distEl.textContent = Math.floor(runnerDistance);
}

function runnerJump() {
    if (!runnerPlayer.isJumping && !runnerPlayer.isSliding) {
        runnerPlayer.vy = RUNNER_JUMP_FORCE;
        runnerPlayer.isJumping = true;
    }
}

function runnerSlide() {
    if (!runnerPlayer.isJumping && !runnerPlayer.isSliding) {
        runnerPlayer.isSliding = true;
        runnerPlayer.slideTimer = 30; // Slide for 30 frames
        runnerPlayer.height = RUNNER_SLIDE_HEIGHT;
        runnerPlayer.y = RUNNER_GROUND - RUNNER_SLIDE_HEIGHT;
    }
}

function spawnObstacle() {
    // 70% obstacle, 30% collectible
    if (Math.random() < 0.7) {
        const obs = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
        runnerObstacles.push({
            x: runnerCanvas.width + 50,
            y: obs.y !== undefined ? obs.y : RUNNER_GROUND - obs.height,
            width: obs.width,
            height: obs.height,
            emoji: obs.emoji,
            type: obs.type
        });
    } else {
        const col = COLLECTIBLES[Math.floor(Math.random() * COLLECTIBLES.length)];
        const yPos = Math.random() < 0.5 ? RUNNER_GROUND - 30 : RUNNER_GROUND - 70;
        runnerCollectibles.push({
            x: runnerCanvas.width + 50,
            y: yPos,
            width: 25,
            height: 25,
            emoji: col.emoji,
            points: col.points
        });
    }
}

function updateRunner(deltaTime) {
    if (!runnerRunning) return;
    
    // Update distance and speed
    runnerDistance += runnerSpeed * 0.1;
    runnerSpeed = 5 + Math.floor(runnerDistance / 100) * 0.5;
    runnerSpeed = Math.min(runnerSpeed, 15); // Max speed
    
    // Update player
    if (runnerPlayer.isJumping) {
        runnerPlayer.vy += RUNNER_GRAVITY;
        runnerPlayer.y += runnerPlayer.vy;
        
        if (runnerPlayer.y >= RUNNER_GROUND - runnerPlayer.height) {
            runnerPlayer.y = RUNNER_GROUND - runnerPlayer.height;
            runnerPlayer.isJumping = false;
            runnerPlayer.vy = 0;
        }
    }
    
    // Update slide
    if (runnerPlayer.isSliding) {
        runnerPlayer.slideTimer--;
        if (runnerPlayer.slideTimer <= 0) {
            runnerPlayer.isSliding = false;
            runnerPlayer.height = RUNNER_NORMAL_HEIGHT;
            runnerPlayer.y = RUNNER_GROUND - RUNNER_NORMAL_HEIGHT;
        }
    }
    
    // Spawn obstacles
    runnerSpawnTimer++;
    const spawnInterval = Math.max(40, 80 - Math.floor(runnerDistance / 50));
    if (runnerSpawnTimer >= spawnInterval) {
        runnerSpawnTimer = 0;
        spawnObstacle();
    }
    
    // Update obstacles
    runnerObstacles.forEach(obs => {
        obs.x -= runnerSpeed;
    });
    runnerObstacles = runnerObstacles.filter(obs => obs.x > -50);
    
    // Update collectibles
    runnerCollectibles.forEach(col => {
        col.x -= runnerSpeed;
    });
    runnerCollectibles = runnerCollectibles.filter(col => col.x > -50);
    
    // Collision with obstacles
    for (const obs of runnerObstacles) {
        // Skip slide obstacles entirely when player is sliding
        if (obs.type === 'slide' && runnerPlayer.isSliding) {
            continue;
        }
        
        if (checkCollision(runnerPlayer, obs)) {
            // Check if player correctly avoided by jumping
            if (obs.type === 'jump' && runnerPlayer.isJumping && runnerPlayer.y + runnerPlayer.height < obs.y + 10) {
                continue; // Jumping over obstacle
            }
            endRunner();
            return;
        }
    }
    
    // Collision with collectibles
    runnerCollectibles = runnerCollectibles.filter(col => {
        if (checkCollision(runnerPlayer, col)) {
            runnerScore += col.points;
            return false;
        }
        return true;
    });
    
    updateRunnerHud();
}

function checkCollision(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

function drawRunner() {
    if (!runnerCtx) return;
    
    // Draw gradient sky (darker at top, lighter toward horizon)
    const skyGradient = runnerCtx.createLinearGradient(0, 0, 0, RUNNER_GROUND);
    skyGradient.addColorStop(0, '#0a0a12');    // Dark at top
    skyGradient.addColorStop(0.6, '#12121f');  // Mid
    skyGradient.addColorStop(1, '#1a1a2e');    // Lighter at horizon
    runnerCtx.fillStyle = skyGradient;
    runnerCtx.fillRect(0, 0, runnerCanvas.width, RUNNER_GROUND);
    
    // Draw road (gray asphalt)
    runnerCtx.fillStyle = '#2a2a35';
    runnerCtx.fillRect(0, RUNNER_GROUND, runnerCanvas.width, 40);
    
    // Draw road top edge (darker border)
    runnerCtx.fillStyle = '#1a1a22';
    runnerCtx.fillRect(0, RUNNER_GROUND, runnerCanvas.width, 3);
    
    // Draw road bottom edge (darker border)
    runnerCtx.fillStyle = '#1a1a22';
    runnerCtx.fillRect(0, RUNNER_GROUND + 37, runnerCanvas.width, 3);
    
    // Draw teal accent line on road surface
    runnerCtx.strokeStyle = '#4ae0a0';
    runnerCtx.lineWidth = 2;
    runnerCtx.beginPath();
    runnerCtx.moveTo(0, RUNNER_GROUND + 2);
    runnerCtx.lineTo(runnerCanvas.width, RUNNER_GROUND + 2);
    runnerCtx.stroke();
    
    // Draw moving road dashes (center line)
    runnerCtx.fillStyle = '#4a4a55';
    const markerOffset = (runnerDistance * 5) % 40;
    for (let x = -markerOffset; x < runnerCanvas.width; x += 40) {
        runnerCtx.fillRect(x, RUNNER_GROUND + 18, 20, 4);
    }
    
    // Draw obstacles
    runnerCtx.font = '28px Arial';
    runnerCtx.textAlign = 'center';
    runnerCtx.textBaseline = 'bottom';
    runnerObstacles.forEach(obs => {
        runnerCtx.fillText(obs.emoji, obs.x + obs.width / 2, obs.y + obs.height);
    });
    
    // Draw collectibles
    runnerCtx.font = '22px Arial';
    runnerCollectibles.forEach(col => {
        runnerCtx.fillText(col.emoji, col.x + col.width / 2, col.y + col.height);
    });
    
    // Draw player
    runnerCtx.font = runnerPlayer.isSliding ? '24px Arial' : '32px Arial';
    const playerEmoji = '🏃';
    runnerCtx.save();
    runnerCtx.translate(runnerPlayer.x + runnerPlayer.width / 2, runnerPlayer.y + runnerPlayer.height / 2);
    runnerCtx.scale(-1, 1); // Flip horizontally to face right
    if (runnerPlayer.isSliding) {
        runnerCtx.rotate(-Math.PI / 4);
        runnerCtx.fillText(playerEmoji, 0, 10);
    } else {
        runnerCtx.fillText(playerEmoji, 0, runnerPlayer.height / 2);
    }
    runnerCtx.restore();
}

function runnerGameLoop(time = 0) {
    if (!runnerRunning) return;
    
    const deltaTime = time - runnerLastTime;
    runnerLastTime = time;
    
    updateRunner(deltaTime);
    drawRunner();
    
    requestAnimationFrame(runnerGameLoop);
}

function startRunner() {
    if (runnerStart) runnerStart.style.display = 'none';
    if (runnerOver) runnerOver.style.display = 'none';
    if (runnerCanvas) runnerCanvas.style.display = 'block';
    if (runnerHud) runnerHud.style.display = 'flex';
    
    // Show touch controls on mobile
    const touchControls = document.getElementById('runnerTouchControls');
    if (isMobile() && touchControls) {
        touchControls.classList.add('visible');
    }
    
    runnerRunning = true;
    initRunner();
    runnerGameLoop();
}

function getRunnerMessage(distance, score) {
    if (distance >= 1000) return "Principal PM energy. Nothing stops you.";
    if (distance >= 500) return "Solid roadmap execution. Ship it!";
    if (distance >= 200) return "You stayed on track for a while.";
    if (distance >= 100) return "The roadmap had other plans.";
    return "Blockers won this sprint.";
}

function endRunner() {
    runnerRunning = false;
    
    if (runnerCanvas) runnerCanvas.style.display = 'none';
    if (runnerHud) runnerHud.style.display = 'none';
    if (runnerOver) runnerOver.style.display = 'flex';
    
    // Hide touch controls
    const touchControls = document.getElementById('runnerTouchControls');
    if (touchControls) touchControls.classList.remove('visible');
    
    const finalScore = document.getElementById('runnerFinalScore');
    const finalDist = document.getElementById('runnerFinalDistance');
    const message = document.getElementById('runnerMessage');
    
    if (finalScore) finalScore.textContent = runnerScore;
    if (finalDist) finalDist.textContent = Math.floor(runnerDistance);
    if (message) message.textContent = getRunnerMessage(runnerDistance, runnerScore);
}

// Runner keyboard controls
document.addEventListener('keydown', (e) => {
    const runnerWindow = document.getElementById('runner');
    if (!runnerWindow || (!runnerWindow.classList.contains('window-open') && !runnerWindow.classList.contains('mobile-active-game'))) return;
    if (!runnerRunning) return;
    
    if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        runnerJump();
    }
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        runnerSlide();
    }
});

// Button handlers
if (startRunnerBtn) startRunnerBtn.addEventListener('click', startRunner);
if (runnerPlayAgainBtn) runnerPlayAgainBtn.addEventListener('click', startRunner);
if (runnerWhoAmIBtn) runnerWhoAmIBtn.addEventListener('click', () => openWindow('readme'));

// Runner touch controls
const runnerTouchJump = document.getElementById('runnerTouchJump');
const runnerTouchSlide = document.getElementById('runnerTouchSlide');

if (runnerTouchJump) {
    runnerTouchJump.addEventListener('touchstart', (e) => {
        e.preventDefault();
        runnerJump();
    });
    runnerTouchJump.addEventListener('click', runnerJump);
}

if (runnerTouchSlide) {
    runnerTouchSlide.addEventListener('touchstart', (e) => {
        e.preventDefault();
        runnerSlide();
    });
    runnerTouchSlide.addEventListener('click', runnerSlide);
}

// ===================
// STAKEHOLDER SNAKE GAME
// ===================
const snakeCanvas = document.getElementById('snakeCanvas');
const snakeCtx = snakeCanvas ? snakeCanvas.getContext('2d') : null;
const snakeStart = document.getElementById('snakeStart');
const snakeOver = document.getElementById('snakeOver');
const snakeHud = document.getElementById('snakeHud');
const startSnakeBtn = document.getElementById('startSnakeBtn');
const snakePlayAgainBtn = document.getElementById('snakePlayAgainBtn');
const snakeWhoAmIBtn = document.getElementById('snakeWhoAmIBtn');

// Snake constants
const SNAKE_GRID_SIZE = 20;
const SNAKE_TILE_COUNT = 16;

// Snake state
let snakeRunning = false;
let snakeScore = 0;
let snake = [];
let snakeDirection = { x: 1, y: 0 };
let snakeNextDirection = { x: 1, y: 0 };
let snakeFood = null;
let snakeGameInterval = null;
let snakeSpeed = 200;

const FOOD_EMOJIS = ['💡', '🎯', '⭐', '📧', '📊'];

function getRandomFoodEmoji() {
    return FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
}

function initSnake() {
    snakeScore = 0;
    snakeSpeed = 200;
    snakeDirection = { x: 1, y: 0 };
    snakeNextDirection = { x: 1, y: 0 };
    
    // Start with 3 segments in the middle
    snake = [
        { x: 8, y: 8 },
        { x: 7, y: 8 },
        { x: 6, y: 8 }
    ];
    
    spawnSnakeFood();
    updateSnakeHud();
}

function spawnSnakeFood() {
    let valid = false;
    while (!valid) {
        snakeFood = {
            x: Math.floor(Math.random() * SNAKE_TILE_COUNT),
            y: Math.floor(Math.random() * SNAKE_TILE_COUNT),
            emoji: getRandomFoodEmoji()
        };
        // Make sure food doesn't spawn on snake
        valid = !snake.some(seg => seg.x === snakeFood.x && seg.y === snakeFood.y);
    }
}

function updateSnakeHud() {
    const scoreEl = document.getElementById('snakeScore');
    const lengthEl = document.getElementById('snakeLength');
    if (scoreEl) scoreEl.textContent = snakeScore;
    if (lengthEl) lengthEl.textContent = snake.length;
}

function moveSnake() {
    if (!snakeRunning) return;
    
    // Apply the queued direction
    snakeDirection = { ...snakeNextDirection };
    
    // Calculate new head position
    const head = { 
        x: snake[0].x + snakeDirection.x, 
        y: snake[0].y + snakeDirection.y 
    };
    
    // Check wall collision
    if (head.x < 0 || head.x >= SNAKE_TILE_COUNT || head.y < 0 || head.y >= SNAKE_TILE_COUNT) {
        endSnake();
        return;
    }
    
    // Check self collision
    if (snake.some(seg => seg.x === head.x && seg.y === head.y)) {
        endSnake();
        return;
    }
    
    // Add new head
    snake.unshift(head);
    
    // Check food collision
    if (head.x === snakeFood.x && head.y === snakeFood.y) {
        snakeScore += 10;
        spawnSnakeFood();
        
        // Speed up every 5 foods
        if (snake.length % 5 === 0 && snakeSpeed > 120) {
            snakeSpeed -= 10;
            clearInterval(snakeGameInterval);
            snakeGameInterval = setInterval(moveSnake, snakeSpeed);
        }
    } else {
        // Remove tail if no food eaten
        snake.pop();
    }
    
    updateSnakeHud();
    drawSnake();
}

function drawSnake() {
    if (!snakeCtx) return;
    
    // Clear canvas
    snakeCtx.fillStyle = '#0a0a0f';
    snakeCtx.fillRect(0, 0, snakeCanvas.width, snakeCanvas.height);
    
    // Draw grid
    snakeCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    snakeCtx.lineWidth = 1;
    for (let i = 0; i <= SNAKE_TILE_COUNT; i++) {
        snakeCtx.beginPath();
        snakeCtx.moveTo(i * SNAKE_GRID_SIZE, 0);
        snakeCtx.lineTo(i * SNAKE_GRID_SIZE, snakeCanvas.height);
        snakeCtx.stroke();
        snakeCtx.beginPath();
        snakeCtx.moveTo(0, i * SNAKE_GRID_SIZE);
        snakeCtx.lineTo(snakeCanvas.width, i * SNAKE_GRID_SIZE);
        snakeCtx.stroke();
    }
    
    // Draw snake body
    snakeCtx.font = '16px Arial';
    snakeCtx.textAlign = 'center';
    snakeCtx.textBaseline = 'middle';
    
    snake.forEach((seg, index) => {
        const centerX = seg.x * SNAKE_GRID_SIZE + SNAKE_GRID_SIZE / 2;
        const centerY = seg.y * SNAKE_GRID_SIZE + SNAKE_GRID_SIZE / 2;
        
        if (index === 0) {
            // Head - PM/developer
            snakeCtx.font = '18px Arial';
            snakeCtx.fillText('👨🏻‍💻', centerX, centerY);
        } else {
            // Body - requirements
            snakeCtx.font = '14px Arial';
            snakeCtx.fillText('📝', centerX, centerY);
        }
    });
    
    // Draw food
    if (snakeFood) {
        const foodX = snakeFood.x * SNAKE_GRID_SIZE + SNAKE_GRID_SIZE / 2;
        const foodY = snakeFood.y * SNAKE_GRID_SIZE + SNAKE_GRID_SIZE / 2;
        snakeCtx.font = '16px Arial';
        snakeCtx.fillText(snakeFood.emoji, foodX, foodY);
    }
}

function setSnakeDirection(x, y) {
    // Prevent reversing direction
    if (snakeDirection.x === -x && snakeDirection.y === -y) return;
    if (x !== 0 && snakeDirection.x !== 0) return;
    if (y !== 0 && snakeDirection.y !== 0) return;
    
    snakeNextDirection = { x, y };
}

function startSnake() {
    if (snakeStart) snakeStart.style.display = 'none';
    if (snakeOver) snakeOver.style.display = 'none';
    if (snakeCanvas) snakeCanvas.style.display = 'block';
    if (snakeHud) snakeHud.style.display = 'flex';
    
    // Show touch controls on mobile
    const touchControls = document.getElementById('snakeTouchControls');
    if (isMobile() && touchControls) {
        touchControls.classList.add('visible');
    }
    
    snakeRunning = true;
    initSnake();
    drawSnake();
    
    snakeGameInterval = setInterval(moveSnake, snakeSpeed);
}

function getSnakeMessage(score, length) {
    if (length >= 30) return "Principal PM energy. Scope management master.";
    if (length >= 20) return "Senior backlog wrangler. Impressive.";
    if (length >= 15) return "You managed the chaos for a while.";
    if (length >= 10) return "The backlog consumed itself.";
    return "Scope collapse. It happens.";
}

function endSnake() {
    snakeRunning = false;
    
    if (snakeGameInterval) {
        clearInterval(snakeGameInterval);
        snakeGameInterval = null;
    }
    
    if (snakeCanvas) snakeCanvas.style.display = 'none';
    if (snakeHud) snakeHud.style.display = 'none';
    if (snakeOver) snakeOver.style.display = 'flex';
    
    // Hide touch controls
    const touchControls = document.getElementById('snakeTouchControls');
    if (touchControls) touchControls.classList.remove('visible');
    
    const finalScore = document.getElementById('snakeFinalScore');
    const finalLength = document.getElementById('snakeFinalLength');
    const message = document.getElementById('snakeMessage');
    
    if (finalScore) finalScore.textContent = snakeScore;
    if (finalLength) finalLength.textContent = snake.length;
    if (message) message.textContent = getSnakeMessage(snakeScore, snake.length);
}

// Snake keyboard controls
document.addEventListener('keydown', (e) => {
    const snakeWindow = document.getElementById('snake');
    if (!snakeWindow || (!snakeWindow.classList.contains('window-open') && !snakeWindow.classList.contains('mobile-active-game'))) return;
    if (!snakeRunning) return;
    
    switch (e.key) {
        case 'ArrowUp':
            e.preventDefault();
            setSnakeDirection(0, -1);
            break;
        case 'ArrowDown':
            e.preventDefault();
            setSnakeDirection(0, 1);
            break;
        case 'ArrowLeft':
            e.preventDefault();
            setSnakeDirection(-1, 0);
            break;
        case 'ArrowRight':
            e.preventDefault();
            setSnakeDirection(1, 0);
            break;
    }
});

// Button handlers
if (startSnakeBtn) startSnakeBtn.addEventListener('click', startSnake);
if (snakePlayAgainBtn) snakePlayAgainBtn.addEventListener('click', startSnake);
if (snakeWhoAmIBtn) snakeWhoAmIBtn.addEventListener('click', () => openWindow('readme'));

// Snake touch controls
const snakeTouchUp = document.getElementById('snakeTouchUp');
const snakeTouchDown = document.getElementById('snakeTouchDown');
const snakeTouchLeft = document.getElementById('snakeTouchLeft');
const snakeTouchRight = document.getElementById('snakeTouchRight');

if (snakeTouchUp) {
    snakeTouchUp.addEventListener('touchstart', (e) => { e.preventDefault(); setSnakeDirection(0, -1); });
    snakeTouchUp.addEventListener('click', () => setSnakeDirection(0, -1));
}
if (snakeTouchDown) {
    snakeTouchDown.addEventListener('touchstart', (e) => { e.preventDefault(); setSnakeDirection(0, 1); });
    snakeTouchDown.addEventListener('click', () => setSnakeDirection(0, 1));
}
if (snakeTouchLeft) {
    snakeTouchLeft.addEventListener('touchstart', (e) => { e.preventDefault(); setSnakeDirection(-1, 0); });
    snakeTouchLeft.addEventListener('click', () => setSnakeDirection(-1, 0));
}
if (snakeTouchRight) {
    snakeTouchRight.addEventListener('touchstart', (e) => { e.preventDefault(); setSnakeDirection(1, 0); });
    snakeTouchRight.addEventListener('click', () => setSnakeDirection(1, 0));
}

// Snake swipe controls for mobile
let snakeTouchStartX = 0;
let snakeTouchStartY = 0;

if (snakeCanvas) {
    snakeCanvas.addEventListener('touchstart', (e) => {
        snakeTouchStartX = e.touches[0].clientX;
        snakeTouchStartY = e.touches[0].clientY;
    });
    
    snakeCanvas.addEventListener('touchend', (e) => {
        if (!snakeRunning) return;
        
        const deltaX = e.changedTouches[0].clientX - snakeTouchStartX;
        const deltaY = e.changedTouches[0].clientY - snakeTouchStartY;
        
        const minSwipe = 30;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > minSwipe) setSnakeDirection(1, 0);
            else if (deltaX < -minSwipe) setSnakeDirection(-1, 0);
        } else {
            if (deltaY > minSwipe) setSnakeDirection(0, 1);
            else if (deltaY < -minSwipe) setSnakeDirection(0, -1);
        }
    });
}

// ===================
// STANDUP SPEEDRUN GAME
// ===================
const standupStart = document.getElementById('standupStart');
const standupGame = document.getElementById('standupGame');
const standupOver = document.getElementById('standupOver');
const standupInput = document.getElementById('standupInput');
const standupPrompt = document.getElementById('standupPrompt');
const standupTimer = document.getElementById('standupTimer');
const startStandupBtn = document.getElementById('startStandupBtn');
const standupPlayAgainBtn = document.getElementById('standupPlayAgainBtn');
const standupWhoAmIBtn = document.getElementById('standupWhoAmIBtn');

// Standup prompts - real PM/dev status updates
const STANDUP_PROMPTS = [
    // Yesterday updates
    "Shipped the login fix",
    "Reviewed the PRD",
    "Fixed the payment bug",
    "Pushed to staging",
    "Merged the feature branch",
    "Updated the docs",
    "Closed 5 tickets",
    "Deployed to prod",
    "Finished code review",
    "Synced with design",
    "Wrote unit tests",
    "Refactored the API",
    "Fixed the flaky test",
    "Updated dependencies",
    "Cleared the backlog",
    
    // Today updates
    "Starting sprint planning",
    "Working on the dashboard",
    "Writing the spec",
    "Pairing with Sarah",
    "Investigating the bug",
    "Setting up CI/CD",
    "Building the prototype",
    "Reviewing pull requests",
    "Updating the roadmap",
    "Finishing the migration",
    
    // Blockers
    "Blocked by legal review",
    "Waiting on API docs",
    "Need design approval",
    "Blocked by DevOps",
    "Waiting for QA signoff",
    "Need stakeholder input",
    "Blocked by infra team",
    "Waiting on vendor",
    
    // Fun ones
    "Surviving meetings",
    "Drinking more coffee",
    "Fighting scope creep",
    "Herding cats as usual",
    "Same as yesterday lol",
    "Putting out fires",
    "Moving tickets around",
    "Updating Jira forever"
];

// Standup state
let standupRunning = false;
let standupScore = 0;
let standupStreak = 0;
let standupCount = 0;
let standupLives = 3;
let standupTimeLeft = 0;
let standupTimerInterval = null;
let currentPrompt = '';
let usedPrompts = [];

// Word scramble state (mobile)
let scrambleWords = [];
let scrambleBuilt = [];
let scrambleTargetWords = [];

function getRandomPrompt() {
    // Reset if we've used most prompts
    if (usedPrompts.length >= STANDUP_PROMPTS.length - 5) {
        usedPrompts = [];
    }
    
    let prompt;
    do {
        prompt = STANDUP_PROMPTS[Math.floor(Math.random() * STANDUP_PROMPTS.length)];
    } while (usedPrompts.includes(prompt));
    
    usedPrompts.push(prompt);
    return prompt;
}

function updateStandupHud() {
    const scoreEl = document.getElementById('standupScore');
    const streakEl = document.getElementById('standupStreak');
    const countEl = document.getElementById('standupCount');
    const livesEl = document.getElementById('standupLives');
    if (scoreEl) scoreEl.textContent = standupScore;
    if (streakEl) streakEl.textContent = standupStreak;
    if (countEl) countEl.textContent = standupCount;
    if (livesEl) livesEl.textContent = '❤️'.repeat(standupLives) + '🖤'.repeat(3 - standupLives);
}

function setNewPrompt() {
    currentPrompt = getRandomPrompt();
    if (standupPrompt) standupPrompt.textContent = currentPrompt;
    if (standupInput) {
        standupInput.value = '';
        standupInput.classList.remove('correct', 'incorrect');
    }
    
    // Set up word scramble for mobile
    if (isMobile()) {
        setupScramble(currentPrompt);
    }
    
    // Time decreases as you progress
    // Mobile: starts at 8s, min 3s (tapping is easier)
    // Desktop: starts at 15s, min 5s (typing is harder)
    if (isMobile()) {
        standupTimeLeft = Math.max(3, 8 - Math.floor(standupCount / 3));
    } else {
        standupTimeLeft = Math.max(5, 15 - Math.floor(standupCount / 3));
    }
    updateTimerDisplay();
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function setupScramble(prompt) {
    scrambleTargetWords = prompt.split(' ');
    scrambleWords = shuffleArray(scrambleTargetWords);
    scrambleBuilt = [];
    
    renderScramble();
}

function renderScramble() {
    const wordsContainer = document.getElementById('scrambleWords');
    const builtContainer = document.getElementById('scrambleBuilt');
    
    if (wordsContainer) {
        wordsContainer.innerHTML = scrambleWords.map((word, index) => {
            const isUsed = scrambleBuilt.includes(index);
            return `<button class="scramble-word ${isUsed ? 'used' : ''}" data-index="${index}" ${isUsed ? 'disabled' : ''}>${word}</button>`;
        }).join('');
        
        // Add click handlers
        wordsContainer.querySelectorAll('.scramble-word:not(.used)').forEach(btn => {
            btn.addEventListener('click', () => handleWordTap(parseInt(btn.dataset.index)));
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handleWordTap(parseInt(btn.dataset.index));
            });
        });
    }
    
    if (builtContainer) {
        builtContainer.innerHTML = scrambleBuilt.map(index => 
            `<span class="built-word">${scrambleWords[index]}</span>`
        ).join('');
    }
}

function handleWordTap(wordIndex) {
    if (!standupRunning) return;
    
    const tappedWord = scrambleWords[wordIndex];
    const expectedWord = scrambleTargetWords[scrambleBuilt.length];
    
    if (tappedWord === expectedWord) {
        // Correct word!
        scrambleBuilt.push(wordIndex);
        
        const btn = document.querySelector(`.scramble-word[data-index="${wordIndex}"]`);
        if (btn) {
            btn.classList.add('correct');
            setTimeout(() => {
                renderScramble();
                
                // Check if complete
                if (scrambleBuilt.length === scrambleTargetWords.length) {
                    handlePromptComplete();
                }
            }, 150);
        }
    } else {
        // Wrong word!
        const btn = document.querySelector(`.scramble-word[data-index="${wordIndex}"]`);
        if (btn) {
            btn.classList.add('wrong');
            setTimeout(() => btn.classList.remove('wrong'), 300);
        }
    }
}

function handlePromptComplete() {
    const timeBonus = Math.floor(standupTimeLeft * 10);
    const streakBonus = standupStreak * 5;
    const points = 100 + timeBonus + streakBonus;
    
    standupScore += points;
    standupStreak++;
    standupCount++;
    
    addSlackMessage(currentPrompt, true, true);
    addSlackMessage(`+${points} points! ${standupStreak > 1 ? '🔥 ' + standupStreak + ' streak!' : ''}`, false, true);
    
    updateStandupHud();
    setNewPrompt();
}

function updateTimerDisplay() {
    if (standupTimer) {
        standupTimer.textContent = standupTimeLeft.toFixed(1) + 's';
        standupTimer.classList.toggle('urgent', standupTimeLeft <= 3);
    }
}

function addSlackMessage(text, isUser = false, isSuccess = null) {
    const messagesEl = document.getElementById('slackMessages');
    if (!messagesEl) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'slack-message';
    
    let textClass = 'slack-text';
    if (isUser) textClass += ' user-message';
    if (isSuccess === true) textClass += ' success';
    if (isSuccess === false) textClass += ' error';
    
    messageDiv.innerHTML = `
        <span class="slack-avatar">${isUser ? '👨🏻‍💻' : '🤖'}</span>
        <div class="slack-content">
            <span class="slack-username">${isUser ? 'Kevin' : 'StandupBot'}</span>
            <span class="${textClass}">${text}</span>
        </div>
    `;
    
    messagesEl.appendChild(messageDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function checkInput() {
    if (!standupInput || !standupRunning || isMobile()) return;
    
    const typed = standupInput.value;
    const target = currentPrompt;
    
    // Check if matches so far
    if (target.toLowerCase().startsWith(typed.toLowerCase())) {
        standupInput.classList.remove('incorrect');
        standupInput.classList.toggle('correct', typed.length > 0);
        
        // Complete match!
        if (typed.toLowerCase() === target.toLowerCase()) {
            handlePromptComplete();
        }
    } else {
        standupInput.classList.add('incorrect');
        standupInput.classList.remove('correct');
    }
}

function standupTick() {
    standupTimeLeft -= 0.1;
    updateTimerDisplay();
    
    if (standupTimeLeft <= 0) {
        // Time's up - lose a life
        standupLives--;
        standupStreak = 0;
        addSlackMessage(currentPrompt, true, false);
        
        if (standupLives <= 0) {
            addSlackMessage("You've been muted. Meeting over. 🔇", false, false);
            setTimeout(endStandup, 1000);
            return;
        }
        
        addSlackMessage(`Too slow! ${standupLives} ${standupLives === 1 ? 'chance' : 'chances'} left. ⏰`, false, false);
        updateStandupHud();
        setNewPrompt();
    }
}

function initStandup() {
    standupScore = 0;
    standupStreak = 0;
    standupCount = 0;
    standupLives = 3;
    usedPrompts = [];
    
    // Clear messages except the first bot message
    const messagesEl = document.getElementById('slackMessages');
    if (messagesEl) {
        messagesEl.innerHTML = `
            <div class="slack-message">
                <span class="slack-avatar">🤖</span>
                <div class="slack-content">
                    <span class="slack-username">StandupBot</span>
                    <span class="slack-text">What's your status update?</span>
                </div>
            </div>
        `;
    }
    
    updateStandupHud();
    setNewPrompt();
}

function startStandup() {
    if (standupStart) standupStart.style.display = 'none';
    if (standupOver) standupOver.style.display = 'none';
    if (standupGame) standupGame.style.display = 'flex';
    
    standupRunning = true;
    initStandup();
    
    // Focus input only on desktop
    if (!isMobile() && standupInput) {
        standupInput.focus();
    }
    
    standupTimerInterval = setInterval(standupTick, 100);
}

function getStandupMessage(score, count) {
    if (count >= 20) return "Principal communicator. Meetings bow to you.";
    if (count >= 15) return "Senior standup energy. Fast fingers.";
    if (count >= 10) return "Solid update velocity.";
    if (count >= 5) return "Meeting adjourned. Not bad.";
    return "Need more coffee next time.";
}

function endStandup() {
    standupRunning = false;
    
    if (standupTimerInterval) {
        clearInterval(standupTimerInterval);
        standupTimerInterval = null;
    }
    
    if (standupGame) standupGame.style.display = 'none';
    if (standupOver) standupOver.style.display = 'flex';
    
    const finalScore = document.getElementById('standupFinalScore');
    const finalCount = document.getElementById('standupFinalCount');
    const message = document.getElementById('standupMessage');
    
    if (finalScore) finalScore.textContent = standupScore;
    if (finalCount) finalCount.textContent = standupCount;
    if (message) message.textContent = getStandupMessage(standupScore, standupCount);
}

// Standup input handler
if (standupInput) {
    standupInput.addEventListener('input', checkInput);
    
    // Prevent form submission on enter
    standupInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
        // ESC to quit
        if (e.key === 'Escape' && standupRunning) {
            endStandup();
        }
    });
}

// Button handlers
if (startStandupBtn) startStandupBtn.addEventListener('click', startStandup);
if (standupPlayAgainBtn) standupPlayAgainBtn.addEventListener('click', startStandup);
if (standupWhoAmIBtn) standupWhoAmIBtn.addEventListener('click', () => openWindow('readme'));

/* ==========================================
   RECIPES - Shared Data & Parsing
   ========================================== */

const RECIPES_MD_URL = 'https://middleton.io/recipes/recipes.md';
let kevinRecipes = [];

async function loadKevinRecipes() {
    try {
        const response = await fetch(RECIPES_MD_URL);
        const md = await response.text();
        kevinRecipes = parseKevinRecipes(md);
        
        // Initialize DB view
        renderDbView();
    } catch (error) {
        console.error('Failed to load recipes:', error);
        const dbRows = document.getElementById('dbRecipeRows');
        if (dbRows) dbRows.innerHTML = '<tr><td colspan="5" class="db-loading">Failed to load recipes</td></tr>';
    }
}

function parseKevinRecipes(md) {
    const blocks = md.split(/^# /m).filter(b => b.trim());
    return blocks.map((block, index) => {
        const lines = block.split('\n');
        const title = lines[0].trim();

        const fmStart = lines.findIndex(l => l.trim() === '---');
        const fmEnd = lines.findIndex((l, i) => i > fmStart && l.trim() === '---');

        let tags = [];
        let servings = '';
        let source = '';
        let photo = '';
        let notes = '';

        if (fmStart !== -1 && fmEnd !== -1) {
            const fm = lines.slice(fmStart + 1, fmEnd);
            fm.forEach(line => {
                const [key, ...rest] = line.split(':');
                const val = rest.join(':').trim();
                if (key.trim() === 'tags') {
                    tags = val.replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean);
                } else if (key.trim() === 'servings') {
                    servings = val;
                } else if (key.trim() === 'source') {
                    source = val;
                } else if (key.trim() === 'photo') {
                    photo = val;
                } else if (key.trim() === 'notes') {
                    notes = val;
                }
            });
        }

        const contentStart = fmEnd !== -1 ? fmEnd + 1 : 1;
        const content = lines.slice(contentStart).join('\n').trim();

        const firstHeading = content.search(/^## /m);
        const intro = firstHeading > 0 ? content.slice(0, firstHeading).trim() : '';

        const ingredientsMatch = content.match(/## Ingredients\n([\s\S]*?)(?=\n## |$)/);
        const ingredientsRaw = ingredientsMatch ? ingredientsMatch[1].trim() : '';

        const instructionsMatch = content.match(/## Instructions\n([\s\S]*?)(?=\n## |$)/);
        const instructionsRaw = instructionsMatch ? instructionsMatch[1].trim() : '';

        return {
            id: index + 1,
            title,
            tags,
            servings,
            source,
            photo,
            notes,
            intro,
            ingredientsRaw,
            instructionsRaw
        };
    });
}

function parseRecipeIngredients(raw) {
    const lines = raw.split('\n');
    let html = '';
    let inList = false;

    lines.forEach(line => {
        if (line.startsWith('### ')) {
            if (inList) html += '</ul>';
            html += `<h4>${line.slice(4)}</h4>`;
            inList = false;
        } else if (line.startsWith('- ')) {
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            html += `<li>${line.slice(2)}</li>`;
        }
    });

    if (inList) html += '</ul>';
    return html;
}

function parseRecipeInstructions(raw) {
    const lines = raw.split('\n').filter(l => l.match(/^\d+\./));
    return '<ol>' + lines.map(l => `<li>${l.replace(/^\d+\.\s*/, '')}</li>`).join('') + '</ol>';
}


/* ==========================================
   RECIPES.DB - Database View
   ========================================== */

function renderDbView() {
    const tbody = document.getElementById('dbRecipeRows');
    const countEl = document.getElementById('dbRecipeCount');
    const photoGrid = document.getElementById('recipesPhotoGrid');

    if (!tbody) return;

    // Sort by title ASC
    const sortedRecipes = [...kevinRecipes].sort((a, b) => a.title.localeCompare(b.title));

    countEl.textContent = `${sortedRecipes.length} rows`;

    // Desktop table view
    tbody.innerHTML = sortedRecipes.map((recipe, index) => `
        <tr data-recipe-id="${recipe.id}">
            <td class="db-col-id">${recipe.id}</td>
            <td class="db-col-title">${recipe.title}</td>
            <td class="db-col-tags">${recipe.tags.map(t => `<span class="db-tag">${t}</span>`).join('')}</td>
            <td class="db-col-servings">${recipe.servings || '—'}</td>
            <td class="db-col-action"><span class="db-view-btn">→</span></td>
        </tr>
    `).join('');

    // Add click handlers for table
    tbody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', () => {
            const id = parseInt(row.dataset.recipeId);
            showDbDetail(id);
        });
    });

    // Mobile photo grid view - Pinterest style
    if (photoGrid) {
        photoGrid.innerHTML = sortedRecipes.map(recipe => `
            <div class="recipe-photo-item" data-recipe-id="${recipe.id}">
                ${recipe.photo
                    ? `<img src="${recipe.photo}" alt="${recipe.title}" loading="lazy">`
                    : `<div class="recipe-photo-placeholder">🍽️</div>`
                }
                <div class="recipe-photo-title">${recipe.title}</div>
            </div>
        `).join('');

        // Add click handlers for photo grid
        photoGrid.querySelectorAll('.recipe-photo-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.recipeId);
                showDbDetail(id);
            });
        });
    }
}

function showDbDetail(id) {
    const recipe = kevinRecipes.find(r => r.id === id);
    if (!recipe) return;

    const tableWrapper = document.querySelector('#recipesdb .db-table-wrapper');
    const toolbar = document.querySelector('#recipesdb .db-toolbar');
    const photoGrid = document.getElementById('recipesPhotoGrid');
    const mobileHeader = document.querySelector('#recipesdb .recipes-mobile-header');
    const detail = document.getElementById('dbRecipeDetail');
    const detailId = document.getElementById('dbDetailId');
    const content = document.getElementById('dbDetailContent');

    // Hide table/grid, show detail
    tableWrapper.style.display = 'none';
    toolbar.style.display = 'none';
    if (photoGrid) photoGrid.style.display = 'none';
    if (mobileHeader) mobileHeader.style.display = 'none';
    detail.style.display = 'block';
    detailId.textContent = id;
    
    const ingredientsHtml = parseRecipeIngredients(recipe.ingredientsRaw);
    const instructionsHtml = parseRecipeInstructions(recipe.instructionsRaw);
    
    // Build meta line only if there's content
    const metaParts = [];
    if (recipe.servings) metaParts.push(`Serves ${recipe.servings}`);
    if (recipe.source) metaParts.push(`<a href="${recipe.source}" target="_blank">Source</a>`);
    const metaHtml = metaParts.length ? `<div class="db-detail-meta">${metaParts.join(' · ')}</div>` : '';

    content.innerHTML = `
        <div class="db-detail-header-row">
            ${recipe.photo ? `<img class="db-detail-img" src="${recipe.photo}" alt="${recipe.title}">` : ''}
            <div class="db-detail-header-info">
                <h2 class="db-detail-title">${recipe.title}</h2>
                ${metaHtml}
            </div>
        </div>
        ${recipe.intro ? `<p class="db-detail-intro">${recipe.intro}</p>` : ''}
        <h3>Ingredients</h3>
        ${ingredientsHtml}
        <h3>Instructions</h3>
        ${instructionsHtml}
        ${recipe.notes ? `<div class="db-detail-notes"><strong>Notes</strong>${recipe.notes}</div>` : ''}
    `;
}

// DB Back button handler
const dbBackBtn = document.getElementById('dbBackBtn');
if (dbBackBtn) {
    dbBackBtn.addEventListener('click', () => {
        const tableWrapper = document.querySelector('#recipesdb .db-table-wrapper');
        const toolbar = document.querySelector('#recipesdb .db-toolbar');
        const photoGrid = document.getElementById('recipesPhotoGrid');
        const mobileHeader = document.querySelector('#recipesdb .recipes-mobile-header');
        const detail = document.getElementById('dbRecipeDetail');

        // Show table (desktop) or photo grid (mobile)
        tableWrapper.style.display = '';
        toolbar.style.display = '';
        if (photoGrid) photoGrid.style.display = '';
        if (mobileHeader) mobileHeader.style.display = '';
        detail.style.display = 'none';
    });
}


// Load recipes on page load
loadKevinRecipes();

// Handle URL parameters to open specific windows/games
(function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const windowToOpen = params.get('open');

    // Handle recipes
    if (windowToOpen === 'recipes' || windowToOpen === 'recipesdb') {
        setTimeout(() => openMobileRecipes(), 100);
        return;
    }

    // Handle games - open the games folder or specific game
    const validGames = ['invaders', 'tetris', 'bugsquash', 'runner', 'snake', 'standup'];
    if (windowToOpen === 'games') {
        // On mobile, open the games folder popup
        if (window.innerWidth <= 768) {
            setTimeout(() => openMobileGamesFolder(), 100);
        } else {
            setTimeout(() => openWindow('games'), 100);
        }
        return;
    }

    // Handle specific game by name
    if (validGames.includes(windowToOpen)) {
        if (window.innerWidth <= 768) {
            setTimeout(() => openGameOverlay(windowToOpen), 100);
        } else {
            setTimeout(() => {
                openWindow('games');
                // Also load the specific game
                const gameBtn = document.querySelector(`[data-game="${windowToOpen}"]`);
                if (gameBtn) gameBtn.click();
            }, 100);
        }
        return;
    }

    // Handle other windows normally
    if (windowToOpen) {
        setTimeout(() => openWindow(windowToOpen), 100);
        return;
    }

    // No URL param - open default windows on desktop
    if (window.innerWidth > 768) {
        setTimeout(() => {
            // Set positions for cascading layout
            const aboutWin = document.querySelector('[data-window="about"]');
            const valuesWin = document.querySelector('[data-window="values"]');
            const expWin = document.querySelector('[data-window="experience"]');

            // Profile (about) - left side, below widget, full width
            if (aboutWin) {
                aboutWin.style.left = '30px';
                aboutWin.style.top = '190px';
                aboutWin.style.width = '680px';
            }

            // Experience - middle
            if (expWin) {
                expWin.style.left = '690px';
                expWin.style.top = '40px';
                expWin.style.width = '420px';
            }

            // Values - right side, stacked layout for initial load
            if (valuesWin) {
                valuesWin.style.left = '1120px';
                valuesWin.style.top = '90px';
                valuesWin.style.width = '300px';
                // Add stacked class for 1-column layout on initial load
                const valuesGrid = valuesWin.querySelector('.values-grid');
                if (valuesGrid) valuesGrid.classList.add('stacked');
            }

            // Mark these windows as having initial load positioning
            if (expWin) expWin.dataset.initialLoad = 'true';
            if (valuesWin) valuesWin.dataset.initialLoad = 'true';

            // Open windows in order (last one gets focus)
            openWindow('about');
            openWindow('values');
            openWindow('experience');
        }, 150);
    }
})();

// Reset experience and values windows when reopened after close
(function() {
    // Watch for experience window being reopened
    const expWin = document.querySelector('[data-window="experience"]');
    const valuesWin = document.querySelector('[data-window="values"]');

    if (expWin) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const isOpen = expWin.classList.contains('window-open');
                    // If reopening after initial load was cleared
                    if (isOpen && expWin.dataset.initialLoad === 'false') {
                        // Reset to default width
                        expWin.style.width = '';
                    }
                    // Mark initial load as done when closed
                    if (!isOpen && expWin.dataset.initialLoad === 'true') {
                        expWin.dataset.initialLoad = 'false';
                    }
                }
            });
        });
        observer.observe(expWin, { attributes: true });
    }

    if (valuesWin) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const isOpen = valuesWin.classList.contains('window-open');
                    // If reopening after initial load was cleared
                    if (isOpen && valuesWin.dataset.initialLoad === 'false') {
                        // Reset to default width and remove stacked class
                        valuesWin.style.width = '';
                        const valuesGrid = valuesWin.querySelector('.values-grid');
                        if (valuesGrid) valuesGrid.classList.remove('stacked');
                    }
                    // Mark initial load as done when closed
                    if (!isOpen && valuesWin.dataset.initialLoad === 'true') {
                        valuesWin.dataset.initialLoad = 'false';
                    }
                }
            });
        });
        observer.observe(valuesWin, { attributes: true });
    }
})();

// Clear recipes inline style when resizing to desktop (so close button works)
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        const recipesWindow = document.getElementById('recipesdb');
        const windowsArea = document.querySelector('.windows-area');
        if (recipesWindow) {
            recipesWindow.style.removeProperty('display');
            recipesWindow.style.removeProperty('position');
            recipesWindow.style.removeProperty('inset');
            recipesWindow.style.removeProperty('width');
            recipesWindow.style.removeProperty('height');
            recipesWindow.style.removeProperty('max-height');
            recipesWindow.style.removeProperty('border-radius');
            recipesWindow.style.removeProperty('z-index');
        }
        if (windowsArea) {
            windowsArea.style.removeProperty('display');
            windowsArea.style.removeProperty('position');
            windowsArea.style.removeProperty('inset');
            windowsArea.style.removeProperty('z-index');
            windowsArea.style.removeProperty('background');
            windowsArea.classList.remove('mobile-recipes-open');
            // Restore other windows
            windowsArea.querySelectorAll('.window').forEach(win => {
                win.style.removeProperty('display');
            });
        }
    }
});

// ===================
// MOBILE ICON GRID OVERLAY SYSTEM
// ===================

// Window title configuration for mobile overlays (iOS-style clean titles)
const mobileWindowConfig = {
    readme: { title: 'README' },
    seeking: { title: 'Seeking' },
    about: { title: 'Profile' },
    values: { title: 'Values' },
    experience: { title: 'Experience' },
    projects: { title: 'Projects' },
    skills: { title: 'Skills' },
    recommendations: { title: 'Reviews' },
    games: { title: 'Games' }
};

let activeMobileOverlay = null;

function createMobileOverlay(windowId) {
    const sourceWindow = document.getElementById(windowId);
    if (!sourceWindow) return null;

    const config = mobileWindowConfig[windowId] || { title: windowId };

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'mobile-window-overlay';
    overlay.id = `mobile-overlay-${windowId}`;

    // Create header
    const header = document.createElement('div');
    header.className = 'mobile-overlay-header';

    const title = document.createElement('div');
    title.className = 'mobile-overlay-title';
    title.textContent = config.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'mobile-close-btn';
    closeBtn.textContent = 'Done';
    closeBtn.addEventListener('click', closeMobileOverlay);

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Create content container
    const contentContainer = document.createElement('div');
    contentContainer.className = 'mobile-overlay-content';

    // Clone the window content
    const windowContent = sourceWindow.querySelector('.window-content');
    if (windowContent) {
        const clonedContent = windowContent.cloneNode(true);
        contentContainer.appendChild(clonedContent);
    }

    overlay.appendChild(header);
    overlay.appendChild(contentContainer);

    return overlay;
}

function openMobileOverlay(windowId) {
    // Special handling for games - open as overlay with the games folder content
    if (windowId === 'games') {
        openGamesOverlay();
        return;
    }

    // Close any existing overlay
    if (activeMobileOverlay) {
        closeMobileOverlay();
    }

    // Check if overlay already exists
    let overlay = document.getElementById(`mobile-overlay-${windowId}`);

    if (!overlay) {
        overlay = createMobileOverlay(windowId);
        if (!overlay) return;
        document.body.appendChild(overlay);
        setupSwipeToDismiss(overlay);
    }

    // Trigger animation on next frame
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });

    activeMobileOverlay = overlay;
    document.body.style.overflow = 'hidden';

    // Track with Plausible if available
    if (window.plausible) {
        plausible('Mobile Overlay Open', { props: { window: windowId } });
    }
}

function closeMobileOverlay() {
    if (!activeMobileOverlay) return;

    const overlayToClose = activeMobileOverlay;
    activeMobileOverlay = null;

    // Reset any inline transform/transition from dragging, let CSS handle the close animation
    overlayToClose.style.transition = '';
    overlayToClose.style.transform = '';

    // Remove active class - CSS will animate it down
    overlayToClose.classList.remove('active');
    document.body.style.overflow = '';
}

// Swipe-to-dismiss for mobile overlays (Safari only - other browsers trigger pull-to-refresh)
let touchStartY = 0;
let touchCurrentY = 0;
let isDraggingOverlay = false;

// Detect Safari (but not Chrome on iOS which also has Safari in UA)
function isSafariBrowser() {
    const ua = navigator.userAgent;
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua) && !/FxiOS/.test(ua);
    return isSafari;
}

function setupSwipeToDismiss(overlay) {
    const header = overlay.querySelector('.mobile-overlay-header');
    if (!header) return;

    // Only enable swipe-to-dismiss on Safari to avoid pull-to-refresh conflicts
    if (isSafariBrowser()) {
        let startedOnHeader = false;

        overlay.addEventListener('touchstart', (e) => {
            const headerRect = header.getBoundingClientRect();
            const touchY = e.touches[0].clientY;
            startedOnHeader = touchY <= headerRect.bottom + 50;

            if (overlay.scrollTop <= 0 && startedOnHeader) {
                touchStartY = e.touches[0].clientY;
                touchCurrentY = touchStartY;
                isDraggingOverlay = true;
                overlay.style.transition = 'none';
            }
        }, { passive: true });

        overlay.addEventListener('touchmove', (e) => {
            if (!isDraggingOverlay) return;

            touchCurrentY = e.touches[0].clientY;
            const deltaY = touchCurrentY - touchStartY;

            if (deltaY > 0) {
                const resistance = 0.7;
                overlay.style.transform = `translateY(${deltaY * resistance}px)`;
            }
        }, { passive: true });

        overlay.addEventListener('touchend', () => {
            if (!isDraggingOverlay) return;
            isDraggingOverlay = false;

            const deltaY = touchCurrentY - touchStartY;

            if (deltaY > 60) {
                overlay.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
                overlay.style.transform = 'translateY(100%)';

                setTimeout(() => {
                    overlay.classList.remove('active');
                    overlay.style.transform = '';
                    overlay.style.transition = '';
                    document.body.style.overflow = '';
                    if (activeMobileOverlay === overlay) {
                        activeMobileOverlay = null;
                    }
                }, 300);
                activeMobileOverlay = null;
            } else {
                overlay.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
                overlay.style.transform = 'translateY(0)';

                setTimeout(() => {
                    overlay.style.transition = '';
                }, 300);
            }

            touchStartY = 0;
            touchCurrentY = 0;
            startedOnHeader = false;
        });
    }

    // Tapping the drag handle area closes the overlay (works on all browsers)
    header.addEventListener('click', (e) => {
        // If clicked on the drag handle area (top part of header), close
        const headerRect = header.getBoundingClientRect();
        const clickY = e.clientY - headerRect.top;
        if (clickY < 30) { // Top 30px is the drag handle area
            closeMobileOverlay();
        }
    });
}

// Games overlay handling - use simpler approach
// Games folder shows as overlay, individual games use the existing mobile-active-game system

function openGamesOverlay() {
    // Close any existing overlay
    if (activeMobileOverlay) {
        closeMobileOverlay();
    }

    // Create games overlay
    let overlay = document.getElementById('mobile-overlay-games');

    if (!overlay) {
        const gamesWindow = document.getElementById('games');
        if (!gamesWindow) return;

        overlay = document.createElement('div');
        overlay.className = 'mobile-window-overlay';
        overlay.id = 'mobile-overlay-games';

        // Create header
        const header = document.createElement('div');
        header.className = 'mobile-overlay-header';

        const title = document.createElement('div');
        title.className = 'mobile-overlay-title';
        title.textContent = 'Games';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mobile-close-btn';
        closeBtn.textContent = 'Done';
        closeBtn.addEventListener('click', closeMobileOverlay);

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Create content container with game grid
        const contentContainer = document.createElement('div');
        contentContainer.className = 'mobile-overlay-content';

        // Clone the games folder content
        const windowContent = gamesWindow.querySelector('.window-content');
        if (windowContent) {
            const clonedContent = windowContent.cloneNode(true);
            contentContainer.appendChild(clonedContent);

            // Re-attach click handlers for game items in the clone
            clonedContent.querySelectorAll('.folder-item[data-window]').forEach(item => {
                item.addEventListener('click', () => {
                    const gameId = item.dataset.window;
                    if (gameInfo[gameId]) {
                        // Close games overlay and open individual game overlay
                        closeMobileOverlay();
                        setTimeout(() => openGameOverlay(gameId), 100);
                    }
                });
            });
        }

        overlay.appendChild(header);
        overlay.appendChild(contentContainer);
        document.body.appendChild(overlay);
        setupSwipeToDismiss(overlay);
    }

    // Trigger animation
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });

    activeMobileOverlay = overlay;
    document.body.style.overflow = 'hidden';
}

// Store original parent for game windows
const gameWindowParents = {};

function openGameOverlay(gameId) {
    const gameWindow = document.getElementById(gameId);
    if (!gameWindow) return;

    const config = gameInfo[gameId] || { icon: '🎮', title: gameId };

    // Store original parent so we can restore later
    if (!gameWindowParents[gameId]) {
        gameWindowParents[gameId] = gameWindow.parentElement;
    }

    // Move to body to escape hidden .windows-area parent
    document.body.appendChild(gameWindow);

    // Use the existing game window but show it as a full-screen overlay
    gameWindow.classList.add('mobile-active-game');
    gameWindow.style.display = 'flex';
    gameWindow.style.position = 'fixed';
    gameWindow.style.inset = '0';
    gameWindow.style.zIndex = '1005';
    gameWindow.style.maxHeight = '100vh';
    gameWindow.style.borderRadius = '0';

    // Add close button to game window header if not present
    let backBtn = gameWindow.querySelector('.mobile-game-back-btn');
    if (!backBtn) {
        const header = gameWindow.querySelector('.window-header');
        if (header) {
            backBtn = document.createElement('button');
            backBtn.className = 'mobile-game-back-btn mobile-close-btn';
            backBtn.textContent = 'Close';
            backBtn.addEventListener('click', () => closeGameOverlay(gameId));
            header.style.position = 'relative';
            header.appendChild(backBtn);
        }
    } else {
        backBtn.style.display = 'block';
    }

    document.body.style.overflow = 'hidden';

    // Track with Plausible
    if (window.plausible) {
        plausible('Mobile Game Open', { props: { game: gameId } });
    }
}

function closeGameOverlay(gameId) {
    const gameWindow = document.getElementById(gameId);
    if (!gameWindow) return;

    // Reset game window styles
    gameWindow.classList.remove('mobile-active-game');
    gameWindow.style.display = '';
    gameWindow.style.position = '';
    gameWindow.style.inset = '';
    gameWindow.style.zIndex = '';
    gameWindow.style.maxHeight = '';
    gameWindow.style.borderRadius = '';

    // Hide back button
    const backBtn = gameWindow.querySelector('.mobile-game-back-btn');
    if (backBtn) {
        backBtn.style.display = 'none';
    }

    // Restore to original parent
    if (gameWindowParents[gameId]) {
        gameWindowParents[gameId].appendChild(gameWindow);
    }

    document.body.style.overflow = '';

    // Return to games folder popup
    setTimeout(() => openMobileGamesFolder(), 100);
}

// Initialize mobile icon grid handlers
function initMobileIconGrid() {
    const mobileGridIcons = document.querySelectorAll('.mobile-grid-icon[data-mobile-open]');

    mobileGridIcons.forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            const windowId = icon.dataset.mobileOpen;
            openMobileOverlay(windowId);
        });
    });

    // Widget click handler
    const widget = document.querySelector('.mobile-widget[data-mobile-open]');
    if (widget) {
        widget.addEventListener('click', () => {
            const windowId = widget.dataset.mobileOpen;
            openMobileOverlay(windowId);
        });
    }

    // Update mobile time - uses system locale for 12/24 hour format
    function updateMobileTime() {
        const timeEl = document.getElementById('mobileTime');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
    }
    updateMobileTime();
    setInterval(updateMobileTime, 60000);
}

// Handle back button/swipe to close overlay
window.addEventListener('popstate', () => {
    if (activeMobileOverlay) {
        closeMobileOverlay();
    }
});

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileIconGrid);
} else {
    initMobileIconGrid();
}

// ===================
// WEATHER WIDGET
// ===================
async function fetchWeather() {
    const weatherIcon = document.getElementById('weatherIcon');
    const weatherTemp = document.getElementById('weatherTemp');
    const desktopWeatherIcon = document.getElementById('desktopWeatherIcon');
    const desktopWeatherTemp = document.getElementById('desktopWeatherTemp');

    // Need at least one set of elements
    if (!weatherIcon && !desktopWeatherIcon) return;

    try {
        // NYC coordinates
        const lat = 40.7128;
        const lon = -74.0060;

        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`
        );

        if (!response.ok) throw new Error('Weather fetch failed');

        const data = await response.json();
        const temp = Math.round(data.current.temperature_2m);
        const code = data.current.weather_code;

        // Map weather codes to emojis
        const weatherEmojis = {
            0: '☀️',      // Clear sky
            1: '🌤️',     // Mainly clear
            2: '⛅',      // Partly cloudy
            3: '☁️',      // Overcast
            45: '🌫️',    // Foggy
            48: '🌫️',    // Depositing rime fog
            51: '🌧️',    // Light drizzle
            53: '🌧️',    // Moderate drizzle
            55: '🌧️',    // Dense drizzle
            61: '🌧️',    // Slight rain
            63: '🌧️',    // Moderate rain
            65: '🌧️',    // Heavy rain
            71: '🌨️',    // Slight snow
            73: '🌨️',    // Moderate snow
            75: '❄️',     // Heavy snow
            77: '🌨️',    // Snow grains
            80: '🌦️',    // Slight rain showers
            81: '🌦️',    // Moderate rain showers
            82: '🌧️',    // Violent rain showers
            85: '🌨️',    // Slight snow showers
            86: '🌨️',    // Heavy snow showers
            95: '⛈️',    // Thunderstorm
            96: '⛈️',    // Thunderstorm with slight hail
            99: '⛈️',    // Thunderstorm with heavy hail
        };

        const emoji = weatherEmojis[code] || '🌡️';
        const tempStr = `${temp}°F`;

        // Update mobile widget
        if (weatherIcon) weatherIcon.textContent = emoji;
        if (weatherTemp) weatherTemp.textContent = tempStr;

        // Update desktop widget
        if (desktopWeatherIcon) desktopWeatherIcon.textContent = emoji;
        if (desktopWeatherTemp) desktopWeatherTemp.textContent = tempStr;

    } catch (error) {
        console.log('Weather fetch error:', error);
        // Leave as default --
    }
}

// Fetch weather on load
fetchWeather();
// Refresh every 30 minutes
setInterval(fetchWeather, 30 * 60 * 1000);

// ===================
// CLICK RIPPLE EFFECT
// ===================
const clickRipple = document.getElementById('clickRipple');

document.addEventListener('click', (e) => {
    if (!clickRipple) return;
    clickRipple.style.left = e.clientX + 'px';
    clickRipple.style.top = e.clientY + 'px';
    clickRipple.classList.remove('active');
    void clickRipple.offsetWidth; // Force reflow
    clickRipple.classList.add('active');
});

// ===================
// SPOTLIGHT SEARCH
// ===================
const spotlightOverlay = document.getElementById('spotlightOverlay');
const spotlightInput = document.getElementById('spotlightInput');
const spotlightResults = document.getElementById('spotlightResults');
const spotlightBtn = document.getElementById('spotlightBtn');

// Searchable items
const searchableItems = [
    { type: 'window', id: 'about', icon: '👤', title: 'Profile', subtitle: 'profile.yaml' },
    { type: 'window', id: 'seeking', icon: '🔍', title: 'Seeking', subtitle: 'seeking.query' },
    { type: 'window', id: 'values', icon: '🧭', title: 'Values', subtitle: '.values' },
    { type: 'window', id: 'experience', icon: '📁', title: 'Experience', subtitle: 'experience/' },
    { type: 'window', id: 'projects', icon: '📊', title: 'Projects', subtitle: 'projects/' },
    { type: 'window', id: 'skills', icon: '⚙️', title: 'Skills', subtitle: 'skills.config' },
    { type: 'window', id: 'recommendations', icon: '💬', title: 'Recommendations', subtitle: 'reviews.log' },
    { type: 'window', id: 'games', icon: '🎮', title: 'Games', subtitle: 'games/' },
    { type: 'window', id: 'connect', icon: '📧', title: 'Connect', subtitle: 'connect.sh' },
    { type: 'action', id: 'theme', icon: '🌓', title: 'Toggle Dark Mode', subtitle: 'Switch theme' },
    { type: 'action', id: 'launchpad', icon: '⊞', title: 'Launchpad', subtitle: 'View all apps' },
    { type: 'action', id: 'mission', icon: '☰', title: 'Mission Control', subtitle: 'View all windows' },
    { type: 'link', id: 'email', icon: '📧', title: 'Email Kevin', subtitle: 'kevin@middleton.io', url: 'mailto:kevin@middleton.io' },
    { type: 'link', id: 'linkedin', icon: '💼', title: 'LinkedIn', subtitle: 'linkedin.com/in/kevinmiddleton', url: 'https://linkedin.com/in/kevinmiddleton' },
    { type: 'link', id: 'calendly', icon: '📅', title: 'Schedule a Call', subtitle: 'calendly.com', url: 'https://calendly.com/kevin-middleton/let-s-talk' },
];

let selectedIndex = 0;

function openSpotlight() {
    // Close other overlays first
    closeLaunchpad();
    closeMissionControl();

    spotlightOverlay.classList.add('active');
    spotlightInput.value = '';
    spotlightInput.focus();
    renderSpotlightResults('');
}

function closeSpotlight() {
    spotlightOverlay.classList.remove('active');
}

function renderSpotlightResults(query) {
    const filtered = query.trim() === ''
        ? searchableItems.slice(0, 8)
        : searchableItems.filter(item =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            item.subtitle.toLowerCase().includes(query.toLowerCase())
        );

    selectedIndex = 0;

    if (filtered.length === 0) {
        spotlightResults.innerHTML = '<div class="spotlight-empty">No results found</div>';
        return;
    }

    const grouped = {
        window: filtered.filter(i => i.type === 'window'),
        action: filtered.filter(i => i.type === 'action'),
        link: filtered.filter(i => i.type === 'link'),
    };

    let html = '';

    if (grouped.window.length > 0) {
        html += '<div class="spotlight-section"><div class="spotlight-section-title">Windows</div>';
        grouped.window.forEach((item, i) => {
            html += `<div class="spotlight-item${i === 0 ? ' selected' : ''}" data-type="${item.type}" data-id="${item.id}">
                <span class="spotlight-item-icon">${item.icon}</span>
                <div class="spotlight-item-info">
                    <div class="spotlight-item-title">${item.title}</div>
                    <div class="spotlight-item-subtitle">${item.subtitle}</div>
                </div>
            </div>`;
        });
        html += '</div>';
    }

    if (grouped.action.length > 0) {
        html += '<div class="spotlight-section"><div class="spotlight-section-title">Actions</div>';
        grouped.action.forEach(item => {
            html += `<div class="spotlight-item" data-type="${item.type}" data-id="${item.id}">
                <span class="spotlight-item-icon">${item.icon}</span>
                <div class="spotlight-item-info">
                    <div class="spotlight-item-title">${item.title}</div>
                    <div class="spotlight-item-subtitle">${item.subtitle}</div>
                </div>
            </div>`;
        });
        html += '</div>';
    }

    if (grouped.link.length > 0) {
        html += '<div class="spotlight-section"><div class="spotlight-section-title">Links</div>';
        grouped.link.forEach(item => {
            html += `<div class="spotlight-item" data-type="${item.type}" data-id="${item.id}" data-url="${item.url}">
                <span class="spotlight-item-icon">${item.icon}</span>
                <div class="spotlight-item-info">
                    <div class="spotlight-item-title">${item.title}</div>
                    <div class="spotlight-item-subtitle">${item.subtitle}</div>
                </div>
            </div>`;
        });
        html += '</div>';
    }

    spotlightResults.innerHTML = html;

    // Add click handlers
    spotlightResults.querySelectorAll('.spotlight-item').forEach(item => {
        item.addEventListener('click', () => executeSpotlightItem(item));
    });
}

function executeSpotlightItem(item) {
    const type = item.dataset.type;
    const id = item.dataset.id;

    closeSpotlight();

    if (type === 'window') {
        // Delay to let overlay fade out, then bring window to top
        setTimeout(() => openWindow(id), 200);
    } else if (type === 'action') {
        if (id === 'theme') {
            applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
        } else if (id === 'launchpad') {
            openLaunchpad();
        } else if (id === 'mission') {
            openMissionControl();
        }
    } else if (type === 'link') {
        window.open(item.dataset.url, '_blank');
    }
}

// Keyboard navigation
spotlightInput?.addEventListener('input', (e) => {
    renderSpotlightResults(e.target.value);
});

spotlightInput?.addEventListener('keydown', (e) => {
    const items = spotlightResults.querySelectorAll('.spotlight-item');

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        updateSpotlightSelection(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        updateSpotlightSelection(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedIndex]) {
            executeSpotlightItem(items[selectedIndex]);
        }
    }
});

function updateSpotlightSelection(items) {
    items.forEach((item, i) => {
        item.classList.toggle('selected', i === selectedIndex);
    });
}

// Open/close handlers
spotlightBtn?.addEventListener('click', openSpotlight);
spotlightOverlay?.addEventListener('click', (e) => {
    if (e.target === spotlightOverlay) closeSpotlight();
});

// Keyboard shortcut (Cmd+K or Ctrl+K)
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (spotlightOverlay.classList.contains('active')) {
            closeSpotlight();
        } else {
            openSpotlight();
        }
    }
    if (e.key === 'Escape') {
        if (spotlightOverlay?.classList.contains('active')) closeSpotlight();
        if (launchpadOverlay?.classList.contains('active')) closeLaunchpad();
        if (missionControl?.classList.contains('active')) closeMissionControl();
        if (notificationCenter?.classList.contains('active')) closeNotificationCenter();
    }
});

// ===================
// NOTIFICATION CENTER
// ===================
const notificationCenter = document.getElementById('notificationCenter');
const ncBackdrop = document.getElementById('ncBackdrop');
const ncClose = document.getElementById('ncClose');
const menubarTime = document.getElementById('menubarTime');

function openNotificationCenter() {
    notificationCenter.classList.add('active');
    ncBackdrop.classList.add('active');

    // Update weather in NC
    const ncWeatherIcon = document.getElementById('ncWeatherIcon');
    const ncWeatherTemp = document.getElementById('ncWeatherTemp');
    const desktopIcon = document.getElementById('desktopWeatherIcon');
    const desktopTemp = document.getElementById('desktopWeatherTemp');

    if (ncWeatherIcon && desktopIcon) ncWeatherIcon.textContent = desktopIcon.textContent;
    if (ncWeatherTemp && desktopTemp) ncWeatherTemp.textContent = desktopTemp.textContent;
}

function closeNotificationCenter() {
    notificationCenter.classList.remove('active');
    ncBackdrop.classList.remove('active');
}

menubarTime?.addEventListener('click', () => {
    if (notificationCenter.classList.contains('active')) {
        closeNotificationCenter();
    } else {
        openNotificationCenter();
    }
});

ncClose?.addEventListener('click', closeNotificationCenter);
ncBackdrop?.addEventListener('click', closeNotificationCenter);

// ===================
// LAUNCHPAD
// ===================
const launchpadOverlay = document.getElementById('launchpadOverlay');
const launchpadGrid = document.getElementById('launchpadGrid');
const launchpadInput = document.getElementById('launchpadInput');
const launchpadBtn = document.getElementById('launchpadBtn');

const launchpadApps = [
    { id: 'about', icon: '👤', label: 'Profile' },
    { id: 'seeking', icon: '🔍', label: 'Seeking' },
    { id: 'values', icon: '🧭', label: 'Values' },
    { id: 'experience', icon: '📁', label: 'Experience' },
    { id: 'projects', icon: '📊', label: 'Projects' },
    { id: 'skills', icon: '⚙️', label: 'Skills' },
    { id: 'recommendations', icon: '💬', label: 'Reviews' },
    { id: 'games', icon: '🎮', label: 'Games' },
    { id: 'connect', icon: '📧', label: 'Connect' },
    { id: 'recipesdb', icon: '🗃️', label: 'Recipes' },
];

function openLaunchpad() {
    // Close other overlays first
    closeSpotlight();
    closeMissionControl();

    renderLaunchpadGrid('');
    launchpadOverlay.classList.add('active');
    launchpadInput.value = '';
    launchpadInput.focus();
}

function closeLaunchpad() {
    launchpadOverlay.classList.remove('active');
}

function renderLaunchpadGrid(filter) {
    const filtered = filter.trim() === ''
        ? launchpadApps
        : launchpadApps.filter(app => app.label.toLowerCase().includes(filter.toLowerCase()));

    launchpadGrid.innerHTML = filtered.map(app => `
        <div class="launchpad-item" data-window="${app.id}">
            <div class="launchpad-icon">${app.icon}</div>
            <div class="launchpad-label">${app.label}</div>
        </div>
    `).join('');

    launchpadGrid.querySelectorAll('.launchpad-item').forEach(item => {
        item.addEventListener('click', () => {
            const windowId = item.dataset.window;
            closeLaunchpad();
            // Delay to let overlay fade out, then bring window to top
            setTimeout(() => openWindow(windowId), 300);
        });
    });
}

launchpadBtn?.addEventListener('click', openLaunchpad);
launchpadInput?.addEventListener('input', (e) => renderLaunchpadGrid(e.target.value));
launchpadOverlay?.addEventListener('click', (e) => {
    if (e.target === launchpadOverlay) closeLaunchpad();
});

// ===================
// MISSION CONTROL
// ===================
const missionControl = document.getElementById('missionControl');
const mcWindows = document.getElementById('mcWindows');
const missionControlBtn = document.getElementById('missionControlBtn');

function openMissionControl() {
    // Close other overlays first
    closeSpotlight();
    closeLaunchpad();

    // Get all open windows
    const openWindows = document.querySelectorAll('.window.window-open');

    mcWindows.innerHTML = '';

    openWindows.forEach(win => {
        const icon = win.querySelector('.window-icon')?.textContent || '📄';
        // Get title text without the icon - clone and remove icon to get clean text
        const titleEl = win.querySelector('.window-title');
        let title = win.dataset.window;
        if (titleEl) {
            const clone = titleEl.cloneNode(true);
            const iconEl = clone.querySelector('.window-icon');
            if (iconEl) iconEl.remove();
            title = clone.textContent?.trim() || win.dataset.window;
        }

        const mcWin = document.createElement('div');
        mcWin.className = 'mc-window';
        mcWin.dataset.window = win.dataset.window;
        mcWin.innerHTML = `
            <div class="mc-window-header">
                <span class="mc-window-icon">${icon}</span>
                <span class="mc-window-title">${title}</span>
            </div>
            <div class="mc-window-preview">${icon}</div>
        `;
        mcWin.addEventListener('click', () => {
            const windowId = win.dataset.window;
            closeMissionControl();
            // Delay to let overlay fade out, then bring window to top
            setTimeout(() => openWindow(windowId), 300);
        });
        mcWindows.appendChild(mcWin);
    });

    if (openWindows.length === 0) {
        mcWindows.innerHTML = '<div style="color: rgba(255,255,255,0.5); text-align: center; padding: 40px;">No windows open</div>';
    }

    missionControl.classList.add('active');
}

function closeMissionControl() {
    missionControl.classList.remove('active');
}

missionControlBtn?.addEventListener('click', openMissionControl);
missionControl?.addEventListener('click', (e) => {
    if (e.target === missionControl) closeMissionControl();
});

// ===================
// WINDOW SNAPPING
// ===================
let snapPreview = null;

function createSnapPreview() {
    if (snapPreview) return;
    snapPreview = document.createElement('div');
    snapPreview.className = 'window-snap-preview';
    document.body.appendChild(snapPreview);
}

function showSnapPreview(zone) {
    if (!snapPreview) createSnapPreview();

    const menubarHeight = 28;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight - menubarHeight;

    if (zone === 'left') {
        snapPreview.style.top = menubarHeight + 'px';
        snapPreview.style.left = '0';
        snapPreview.style.width = '50%';
        snapPreview.style.height = screenHeight + 'px';
    } else if (zone === 'right') {
        snapPreview.style.top = menubarHeight + 'px';
        snapPreview.style.left = '50%';
        snapPreview.style.width = '50%';
        snapPreview.style.height = screenHeight + 'px';
    } else if (zone === 'top') {
        snapPreview.style.top = menubarHeight + 'px';
        snapPreview.style.left = '0';
        snapPreview.style.width = '100%';
        snapPreview.style.height = screenHeight + 'px';
    }

    snapPreview.classList.add('active');
}

function hideSnapPreview() {
    if (snapPreview) {
        snapPreview.classList.remove('active');
    }
}

function getSnapZone(x, y) {
    const threshold = 20;
    const screenWidth = window.innerWidth;

    if (x <= threshold) return 'left';
    if (x >= screenWidth - threshold) return 'right';
    if (y <= 28 + threshold) return 'top';
    return null;
}

// Enhance window dragging with snap detection
// (This hooks into the existing drag code - needs to be integrated)
document.addEventListener('mousemove', (e) => {
    // Only show snap preview when dragging a window
    const draggedWindow = document.querySelector('.window-header:active')?.closest('.window');
    if (!draggedWindow) {
        hideSnapPreview();
        return;
    }

    const zone = getSnapZone(e.clientX, e.clientY);
    if (zone) {
        showSnapPreview(zone);
    } else {
        hideSnapPreview();
    }
});

document.addEventListener('mouseup', (e) => {
    const zone = getSnapZone(e.clientX, e.clientY);

    // Snap the window that was being dragged
    if (currentlyDraggingWindow && zone) {
        const win = currentlyDraggingWindow;
        win.classList.remove('snapped-left', 'snapped-right', 'snapped-top');
        win.classList.add('snapped-' + zone);

        // Set position based on snap zone
        if (zone === 'left') {
            win.style.top = '28px';
            win.style.left = '0px';
        } else if (zone === 'right') {
            win.style.top = '28px';
            win.style.left = '50%';
        } else if (zone === 'top') {
            win.style.top = '28px';
            win.style.left = '0px';
        }
    }

    currentlyDraggingWindow = null;
    hideSnapPreview();
});

// Double-click title bar to maximize/restore
windows.forEach(win => {
    const header = win.querySelector('.window-header');
    header?.addEventListener('dblclick', (e) => {
        if (e.target.classList.contains('window-dot')) return;

        if (win.classList.contains('snapped-top')) {
            win.classList.remove('snapped-top');
            win.style.top = '';
            win.style.left = '';
            win.style.width = '';
            win.style.height = '';
        } else {
            win.classList.remove('snapped-left', 'snapped-right');
            win.classList.add('snapped-top');
            // Set initial position for maximized window
            win.style.top = '28px';
            win.style.left = '0px';
        }
    });
});

// ===================
// LOADING STATES
// ===================
const originalOpenWindow = openWindow;
window.openWindow = function(id) {
    const win = document.querySelector(`.window[data-window="${id}"]`);
    if (win && !win.classList.contains('window-open')) {
        win.classList.add('loading');
        setTimeout(() => {
            win.classList.remove('loading');
        }, 300);
    }
    originalOpenWindow(id);
};
