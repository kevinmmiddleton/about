/* ===================
   CASE STUDY JAVASCRIPT
   Shared JS for all case study pages
   =================== */

// ===================
// LIGHTBOX
// ===================
function openLightbox(src, alt) {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    const caption = document.getElementById('lightbox-caption');
    img.src = src;
    img.alt = alt;
    caption.textContent = alt;
    lightbox.classList.add('active');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('active');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
});

// ===================
// FLOATING TOC
// ===================
const tocStatic = document.getElementById('tocStatic');
const tocFloating = document.getElementById('tocFloating');

function updateFloatingToc() {
    // Hide on smaller screens (CSS also hides it, but this is backup)
    if (window.innerWidth <= 1200) {
        tocFloating.classList.remove('visible');
        return;
    }

    const staticRect = tocStatic.getBoundingClientRect();
    // Show floating TOC when static TOC scrolls out of view
    if (staticRect.bottom < 0) {
        tocFloating.classList.add('visible');
    } else {
        tocFloating.classList.remove('visible');
    }
}

window.addEventListener('scroll', updateFloatingToc);
window.addEventListener('resize', updateFloatingToc);

// ===================
// ACTIVE TOC HIGHLIGHTING
// ===================
const tocItems = document.querySelectorAll('.toc-item');
const sections = document.querySelectorAll('.section[id]');

window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        if (rect.top < 200 && rect.bottom > 200) {
            current = section.id;
        }
    });
    tocItems.forEach(item => {
        item.classList.toggle('active', item.dataset.section === current);
    });
});
