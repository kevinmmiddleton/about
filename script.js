// ========== Navigation ==========
const header = document.querySelector(".header")
const menuToggle = document.getElementById("menu-toggle")
const menu = document.getElementById("menu")
const headerName = document.getElementById("header-name")
const aboutSection = document.getElementById("about")

// Sticky header on scroll
window.addEventListener("scroll", () => {
  if (window.scrollY > 50) {
    header.classList.add("scrolled")
  } else {
    header.classList.remove("scrolled")
  }

  // Show/hide header name based on scroll
  if (aboutSection) {
    const aboutTop = aboutSection.offsetTop
    const scrollPosition = window.scrollY + window.innerHeight / 2

    if (scrollPosition >= aboutTop && headerName) {
      headerName.classList.add("visible")
      header.classList.add("name-visible")
    } else if (headerName) {
      headerName.classList.remove("visible")
      header.classList.remove("name-visible")
    }
  }
})

// Mobile menu toggle
if (menuToggle && menu) {
  menuToggle.addEventListener("click", () => {
    menu.classList.toggle("active")
  })

  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !menuToggle.contains(e.target)) {
      menu.classList.remove("active")
    }
  })

  // Close menu when clicking on a link
  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menu.classList.remove("active")
    })
  })
}

// ========== Lightbox ==========
const lightbox = document.getElementById("lightbox")
const lightboxImage = document.getElementById("lightbox-image")
const closeLightbox = document.querySelector(".close-lightbox")
const lightboxTriggers = document.querySelectorAll(".lightbox-trigger")

if (lightbox && lightboxImage && closeLightbox) {
  let lastFocusedElement = null

  function openLightbox(trigger) {
    lastFocusedElement = document.activeElement
    lightboxImage.src = trigger.src
    lightboxImage.alt = trigger.alt
    lightbox.classList.add("active")
    lightbox.setAttribute("aria-hidden", "false")
    document.body.style.overflow = "hidden"
    // Focus the close button after opening
    setTimeout(() => closeLightbox.focus(), 50)
  }

  function closeLightboxModal() {
    lightbox.classList.remove("active")
    lightbox.setAttribute("aria-hidden", "true")
    document.body.style.overflow = ""
    // Return focus to the element that opened the lightbox
    if (lastFocusedElement) {
      lastFocusedElement.focus()
    }
  }

  // Make triggers focusable and keyboard accessible
  lightboxTriggers.forEach((trigger) => {
    trigger.setAttribute("tabindex", "0")
    trigger.setAttribute("role", "button")
    trigger.setAttribute("aria-haspopup", "dialog")

    trigger.addEventListener("click", () => openLightbox(trigger))

    trigger.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        openLightbox(trigger)
      }
    })
  })

  closeLightbox.addEventListener("click", closeLightboxModal)

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) {
      closeLightboxModal()
    }
  })

  // Keyboard handling for lightbox
  lightbox.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("active")) return

    // Close on Escape
    if (e.key === "Escape") {
      closeLightboxModal()
      return
    }

    // Trap focus within lightbox
    if (e.key === "Tab") {
      // Only focusable element is the close button
      e.preventDefault()
      closeLightbox.focus()
    }
  })

  // Set initial ARIA state
  lightbox.setAttribute("role", "dialog")
  lightbox.setAttribute("aria-modal", "true")
  lightbox.setAttribute("aria-label", "Image lightbox")
  lightbox.setAttribute("aria-hidden", "true")
  closeLightbox.setAttribute("aria-label", "Close lightbox")
}

// ========== Experience Accordion Toggle ==========
document.querySelectorAll('.exp-header').forEach(header => {
  // Make headers focusable and add ARIA attributes
  header.setAttribute('tabindex', '0');
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', 'false');

  const content = header.nextElementSibling;
  if (content && content.classList.contains('exp-content')) {
    const contentId = content.id || `exp-content-${Math.random().toString(36).slice(2, 9)}`;
    content.id = contentId;
    header.setAttribute('aria-controls', contentId);
  }

  function toggleAccordion(e) {
    // Don't toggle if clicking on a link
    if (e.target.tagName === 'A') return;

    const isExpanded = header.classList.toggle('expanded');
    header.setAttribute('aria-expanded', isExpanded);

    if (content && content.classList.contains('exp-content')) {
      content.classList.toggle('expanded');
    }
  }

  header.addEventListener('click', toggleAccordion);

  // Keyboard support: Enter and Space to toggle
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleAccordion(e);
    }
  });
});

// ========== Experience Mode Toggle ==========
const toggleInput = document.getElementById("experienceModeToggle")
const journeyPreamble = document.getElementById("journey-preamble")
const experienceList = document.querySelector(".experience-list")

if (journeyPreamble) {
  journeyPreamble.style.display = "none";
}

// Store original order based on the IDs we added
const resumeOrder = [
  "exp-gridstrong",
  "exp-hvac",
  "exp-hurd",
  "exp-lever",
  "exp-sendoso",
  "exp-rocketlawyer",
  "exp-oracle",
]

const storyOrder = [
  "exp-oracle",
  "exp-rocketlawyer",
  "exp-sendoso",
  "exp-lever",
  "exp-hurd",
  "exp-hvac",
  "exp-gridstrong",
]

function reorderExperience(mode) {
  if (!experienceList) return;
  const order = mode === "story" ? storyOrder : resumeOrder
  order.forEach((id) => {
    const card = document.getElementById(id)
    if (card) experienceList.appendChild(card)
  })
}

if (toggleInput) {
  toggleInput.addEventListener("change", () => {
    if (journeyPreamble) {
      journeyPreamble.style.display = toggleInput.checked ? "block" : "none";
    }
    const mode = toggleInput.checked ? "story" : "resume"
    reorderExperience(mode)
  })
}

// ========== Smooth Scroll ==========
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault()
    const target = document.querySelector(this.getAttribute("href"))
    if (target) {
      const headerOffset = 80
      const elementPosition = target.offsetTop
      const offsetPosition = elementPosition - headerOffset

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      })
    }
  })
})

// ========== Footer Easter Egg (Confetti) ==========
const secretTrigger = document.getElementById("confetti-trigger")

if (secretTrigger) {
  secretTrigger.addEventListener("click", (e) => {
    e.preventDefault()

    if (typeof confetti === "function") {
      confetti({
        particleCount: 200,
        spread: 90,
        gravity: 0.6,
        origin: { y: 0.8 },
      })
    } else {
      console.log("Confetti library not loaded")
    }
  })
}