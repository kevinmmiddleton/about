// ====================================================================
// CASE STUDY SHARED JAVASCRIPT
// Used by all case study pages for common interactive functionality
// ====================================================================

// --------------------- FLOATING TOC VISIBILITY ---------------------
// Shows/hides floating navigation based on scroll position
(function initFloatingToc() {
    const staticToc = document.querySelector(".cs-toc-top");
    const floatingToc = document.querySelector(".cs-toc--floating");

    if (!staticToc || !floatingToc) return;

    let triggerY = 0;

    // Compute trigger from static TOC position + height - buffer
    function computeTrigger() {
        const rect = staticToc.getBoundingClientRect();
        const absoluteTop = window.scrollY + rect.top;
        const buffer = 80; // early handoff

        triggerY = absoluteTop + rect.height - buffer;
    }

    function updateTocStates() {
        const isDesktop = window.innerWidth >= 1100;

        if (!isDesktop) {
            floatingToc.classList.remove("visible");
            return;
        }

        // Show floating TOC once you scroll past static TOC zone
        if (window.scrollY >= triggerY) {
            floatingToc.classList.add("visible");
        } else {
            floatingToc.classList.remove("visible");
        }
    }

    // Init
    window.addEventListener("load", () => {
        computeTrigger();
        updateTocStates();
    });

    window.addEventListener("resize", () => {
        computeTrigger();
        updateTocStates();
    });

    window.addEventListener("scroll", updateTocStates);
})();

// --------------------- SLIDESHOW / LIGHTBOX ---------------------
// Handles product walkthrough slideshow with lightbox functionality
// Only initializes if slideshow elements exist on the page
(function initSlideshow() {
    const slides = document.querySelectorAll(".slide");
    if (slides.length === 0) return; // No slideshow on this page

    const captionEl = document.getElementById("slideshow-caption");
    const prevBtn = document.querySelector(".prev-slide");
    const nextBtn = document.querySelector(".next-slide");
    const frame = document.querySelector(".slideshow-frame");

    // Lightbox
    const lightbox = document.getElementById("slideshow-lightbox");
    const lightboxImg = document.getElementById("lightbox-image");
    const lightboxCaption = document.getElementById("lightbox-caption");
    const lightboxPrev = document.querySelector(".lightbox-prev");
    const lightboxNext = document.querySelector(".lightbox-next");

    let index = 0;

    // Show specific slide
    function showSlide(i) {
        slides.forEach(s => s.classList.remove("active"));
        slides[i].classList.add("active");

        const caption = slides[i].getAttribute("data-caption") || "";
        if (captionEl) captionEl.textContent = caption;
    }

    // Navigation buttons (with looping)
    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            index = (index - 1 + slides.length) % slides.length;
            showSlide(index);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            index = (index + 1) % slides.length;
            showSlide(index);
        });
    }

    // Lightbox control
    function openLightbox(i) {
        const trigger = slides[i].querySelector(".slide-image-trigger");
        if (!trigger || !lightbox) return;

        const fullSrc = trigger.getAttribute("data-fullsrc");
        const caption = trigger.getAttribute("data-caption");

        if (trigger.classList.contains("transparent-bg")) {
            lightboxImg.classList.add("lightbox-dark-bg");
        } else {
            lightboxImg.classList.remove("lightbox-dark-bg");
        }

        lightboxImg.src = fullSrc;
        lightboxCaption.textContent = caption;
        lightbox.classList.add("active");
    }

    // Click slide to open lightbox
    slides.forEach((slide, i) => {
        const trigger = slide.querySelector(".slide-image-trigger");
        if (trigger) {
            trigger.addEventListener("click", () => {
                index = i;
                showSlide(index);
                openLightbox(index);
            });
        }
    });

    // Click lightbox image to advance
    if (lightboxImg) {
        lightboxImg.addEventListener("click", () => {
            index = (index + 1) % slides.length;
            showSlide(index);
            openLightbox(index);
        });
    }

    // Lightbox prev/next buttons
    if (lightboxPrev) {
        lightboxPrev.addEventListener("click", (e) => {
            e.stopPropagation();
            index = (index - 1 + slides.length) % slides.length;
            showSlide(index);
            openLightbox(index);
        });
    }

    if (lightboxNext) {
        lightboxNext.addEventListener("click", (e) => {
            e.stopPropagation();
            index = (index + 1) % slides.length;
            showSlide(index);
            openLightbox(index);
        });
    }

    // Close lightbox when clicking background
    if (lightbox) {
        lightbox.addEventListener("click", (e) => {
            if (e.target === lightbox) {
                lightbox.classList.remove("active");
                lightboxImg.src = "";
                lightboxImg.classList.remove("lightbox-dark-bg");
            }
        });
    }

    // Adjust slideshow height to maintain aspect ratio
    function adjustSlideshowHeight() {
        if (!frame) return;
        const w = frame.offsetWidth;
        const h = w * 0.75; // 4:3 ratio for taller images
        frame.style.height = h + "px";
    }

    window.addEventListener("load", adjustSlideshowHeight);
    window.addEventListener("resize", adjustSlideshowHeight);

    // Show first slide
    showSlide(0);
})();

// --------------------- ACTIVE TOC HIGHLIGHT ON SCROLL ---------------------
// Highlights current section in TOC based on scroll position
(function initActiveTocHighlight() {
    document.addEventListener("scroll", () => {
        const sections = document.querySelectorAll(".section[id]");
        const tocItems = document.querySelectorAll(".cs-toc-item");

        let current = "";

        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            if (rect.top < 200 && rect.bottom > 200) {
                current = section.id;
            }
        });

        tocItems.forEach(item => {
            item.classList.toggle("active", item.dataset.section === current);
        });
    });
})();
