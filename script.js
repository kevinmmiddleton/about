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
    } else if (headerName) {
      headerName.classList.remove("visible")
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
  lightboxTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      lightboxImage.src = trigger.src
      lightboxImage.alt = trigger.alt
      lightbox.classList.add("active")
    })
  })

  closeLightbox.addEventListener("click", () => {
    lightbox.classList.remove("active")
  })

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove("active")
    }
  })
}

// ========== Values Slider ==========
const values = [
  {
    title: "Start with an Inventory",
    description: "Before diving in, understand the current state, gather the facts, and identify available resources.",
    number: "1",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
  {
    title: "Choose Reality",
    description: "Stay grounded, even when it's uncomfortable. Progress begins with honesty about where we stand.",
    number: "2",
    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  },
  {
    title: "People First",
    description: "People are at the heart of everything—whether it's the customer, the team, or stakeholders.",
    number: "3",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  },
  {
    title: "Collaboration FTW",
    description: "Nothing great happens in a silo. Prioritize collaboration to generate the best ideas and solutions.",
    number: "4",
    icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  },
  {
    title: "Win or Learn as a Team",
    description: "The team succeeds or grows together, learning from each win and setback.",
    number: "5",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  },
  {
    title: "Bias for Action",
    description:
      "Moving quickly, test, learn, and improve. Action leads to progress, even if it's not perfect from the start.",
    number: "6",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    title: "Fail Fast, Learn Faster",
    description: "Pivot from failure and apply the learnings. Embrace it as part of growth.",
    number: "7",
    icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  },
  {
    title: "Follow the Facts",
    description:
      "Decisions should be grounded in data but with enough flexibility to adapt as new information emerges.",
    number: "8",
    icon: "M8 13v-1m4 1v-3m4 3V8M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z",
  },
  {
    title: "Empower Others",
    description: "Empower others to contribute their best work, fostering autonomy and ownership.",
    number: "9",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    title: "Work Hard, Have Fun",
    description: "We can work hard and still have a good time—they're not mutually exclusive.",
    number: "10",
    icon: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
]

const sliderContainer = document.getElementById("slider-container")
const sliderDots = document.getElementById("slider-dots")
let currentSlide = 0
let sliderInterval

function createSlides() {
  if (!sliderContainer || !sliderDots) return

  sliderContainer.innerHTML = values
    .map(
      (value, index) => `
        <div class="value-slide ${index === 0 ? "active" : ""}" data-index="${index}">
            <div class="value-card">
                <div class="value-number">${value.number}</div>
                <svg class="value-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${value.icon}"/>
                </svg>
                <h3 class="value-title">${value.title}</h3>
                <p class="value-description">${value.description}</p>
            </div>
        </div>
    `,
    )
    .join("")

  sliderDots.innerHTML = values
    .map(
      (_, index) => `
        <div class="slider-dot ${index === 0 ? "active" : ""}" data-index="${index}"></div>
    `,
    )
    .join("")
}

function updateSlider() {
  const slides = document.querySelectorAll(".value-slide")
  const dots = document.querySelectorAll(".slider-dot")

  slides.forEach((slide, index) => {
    slide.classList.toggle("active", index === currentSlide)
  })

  dots.forEach((dot, index) => {
    dot.classList.toggle("active", index === currentSlide)
  })
}

function nextSlide() {
  currentSlide = (currentSlide + 1) % values.length
  updateSlider()
}

function startSlider() {
  sliderInterval = setInterval(nextSlide, 3000)
}

function stopSlider() {
  clearInterval(sliderInterval)
}

createSlides()
startSlider()

// Handle dot clicks
if (sliderDots) {
  sliderDots.addEventListener("click", (e) => {
    if (e.target.classList.contains("slider-dot")) {
      stopSlider()
      currentSlide = Number.parseInt(e.target.getAttribute("data-index"))
      updateSlider()
      startSlider()
    }
  })
}

// Pause slider on hover
if (sliderContainer) {
  sliderContainer.addEventListener("mouseenter", stopSlider)
  sliderContainer.addEventListener("mouseleave", startSlider)
}

// ========== Experience Mode Toggle ==========
const toggleInput = document.getElementById("experienceModeToggle")
const journeyPreamble = document.getElementById("journey-preamble")
const experienceGrid = document.querySelector(".experience-grid")

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
  const order = mode === "story" ? storyOrder : resumeOrder
  order.forEach((id) => {
    const card = document.getElementById(id)
    if (card) experienceGrid.appendChild(card)
  })
}

if (toggleInput && experienceGrid) {
  toggleInput.addEventListener("change", () => {
    if (journeyPreamble) {
      if (toggleInput.checked) {
        journeyPreamble.style.display = "block";
      } else {
        journeyPreamble.style.display = "none";
      }
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