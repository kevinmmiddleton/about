// Site Tour System
// Works with KevBot for narration, supports desktop spotlight + mobile toast modes

(function() {
  'use strict';

  const SiteTour = {
    isActive: false,
    currentStep: 0,
    isMobile: false,

    steps: [
      {
        target: '.hero-inner',
        title: 'Welcome',
        message: "Hey! This is Kevin's site. He's a Full Stack PM based in NYC, currently open to new opportunities. Let me show you around!"
      },
      {
        target: '#looking-for .container',
        mobileScrollTarget: '#looking-for',
        title: 'What He Wants',
        message: "Kevin's looking for roles in product management, internal tools, or platforms. He's also open to product ops, marketing ops, or consulting."
      },
      {
        target: '#about .container',
        mobileScrollTarget: '.about-text',
        title: 'About Kevin',
        message: "Here's a bit about who Kevin is. He's into collaborative teams, good communication, and keeping things moving. Also: cats and cooking."
      },
      {
        target: '.experience-list',
        spotlightInclude: ['#experience > .container > .section-title', '#experience .experience-toggle-wrapper'],
        scrollTarget: '#experience',
        mobileScrollTarget: '#experience',
        title: 'Experience',
        message: "12+ years across SaaS, startups, and enterprise. Click any role to expand the details, or toggle to 'Journey' mode for the narrative version."
      },
      {
        target: '#projects',
        title: 'Case Studies',
        message: "These are deep-dives into Kevin's work. Real projects, real outcomes. Click any card to read the full case study."
      },
      {
        target: '#skills',
        title: 'Skills',
        message: "Kevin's toolkit: strategy, leadership, analytics, and technical chops. Plus a wall of tools he's used over the years."
      },
      {
        target: '#connect',
        title: 'Get in Touch',
        message: "Ready to chat? Email, LinkedIn, GitHub, or book a call directly. Kevin's always happy to connect!"
      }
    ],

    init: function() {
      this.checkMobile();
      this.createElements();
      this.bindEvents();

      // Expose start method globally
      window.startTour = () => this.start();
    },

    checkMobile: function() {
      // More reliable mobile check - also consider touch devices
      this.isMobile = window.innerWidth <= 768 ||
                      ('ontouchstart' in window) ||
                      (navigator.maxTouchPoints > 0);
    },

    createElements: function() {
      // Dark overlay background
      const overlay = document.createElement('div');
      overlay.className = 'tour-overlay';
      this.overlay = overlay;

      // Spotlight highlight (positioned over target)
      const spotlight = document.createElement('div');
      spotlight.className = 'tour-spotlight';
      this.spotlight = spotlight;

      // Tooltip (desktop)
      const tooltip = document.createElement('div');
      tooltip.className = 'tour-tooltip';
      tooltip.innerHTML = `
        <div class="tour-tooltip-content">
          <p class="tour-message"></p>
        </div>
        <div class="tour-tooltip-actions">
          <button class="tour-skip">Skip Tour</button>
          <div class="tour-progress"></div>
          <button class="tour-next">Next</button>
        </div>
      `;
      this.tooltip = tooltip;
      this.messageEl = tooltip.querySelector('.tour-message');
      this.progressEl = tooltip.querySelector('.tour-progress');

      // Toast (mobile)
      const toast = document.createElement('div');
      toast.className = 'tour-toast';
      toast.innerHTML = `
        <div class="tour-toast-content">
          <p class="tour-toast-message"></p>
          <div class="tour-toast-actions">
            <button class="tour-toast-skip">Skip</button>
            <span class="tour-toast-progress"></span>
            <button class="tour-toast-next">Next</button>
          </div>
        </div>
      `;
      this.toast = toast;
      this.toastMessage = toast.querySelector('.tour-toast-message');
      this.toastProgress = toast.querySelector('.tour-toast-progress');

      document.body.appendChild(overlay);
      document.body.appendChild(spotlight);
      document.body.appendChild(tooltip);
      document.body.appendChild(toast);
    },

    bindEvents: function() {
      // Desktop controls
      this.tooltip.querySelector('.tour-next').addEventListener('click', () => this.next());
      this.tooltip.querySelector('.tour-skip').addEventListener('click', () => this.end());
      this.overlay.addEventListener('click', () => this.next());

      // Mobile controls
      this.toast.querySelector('.tour-toast-next').addEventListener('click', () => this.next());
      this.toast.querySelector('.tour-toast-skip').addEventListener('click', () => this.end());

      // Keyboard
      document.addEventListener('keydown', (e) => {
        if (!this.isActive) return;
        if (e.key === 'Escape') this.end();
        if (e.key === 'ArrowRight' || e.key === 'Enter') this.next();
        if (e.key === 'ArrowLeft') this.prev();
      });

      // Resize handler
      window.addEventListener('resize', () => {
        if (this.isActive) {
          this.checkMobile();
          this.showStep(this.currentStep);
        }
      });
    },

    start: function() {
      this.isActive = true;
      this.currentStep = 0;
      this.checkMobile();

      document.body.classList.add('tour-active');

      // Close KevBot if open (tour uses its own UI)
      if (window.KevBot && window.KevBot.isOpen) {
        window.KevBot.toggle();
      }

      this.showStep(0);

      // Track in analytics
      if (window.plausible) {
        window.plausible('Tour Started');
      }
    },

    showStep: function(index) {
      const step = this.steps[index];
      if (!step) return this.end();

      const target = document.querySelector(step.target);
      if (!target) return this.next();

      // Temporarily unlock scrolling for the programmatic scroll
      document.body.classList.remove('tour-active');

      // Use mobileScrollTarget on mobile, scrollTarget on desktop, or fall back to target
      const scrollSelector = this.isMobile
        ? (step.mobileScrollTarget || step.scrollTarget)
        : step.scrollTarget;
      const scrollEl = scrollSelector
        ? (document.querySelector(scrollSelector) || target)
        : target;

      // Scroll to element
      const headerHeight = 80;
      const scrollRect = scrollEl.getBoundingClientRect();
      const scrollY = window.scrollY + scrollRect.top - headerHeight - 20;

      window.scrollTo({
        top: Math.max(0, scrollY),
        behavior: 'smooth'
      });

      // Wait for scroll, then lock and show UI
      setTimeout(() => {
        // Re-lock scrolling
        document.body.classList.add('tour-active');

        // Re-check mobile in case window was resized
        this.checkMobile();

        if (this.isMobile) {
          // Mobile: show toast only, hide desktop elements
          this.overlay.classList.remove('active');
          this.spotlight.classList.remove('active');
          this.tooltip.classList.remove('active');
          this.showToast(step, index);
        } else {
          // Desktop: show spotlight + tooltip
          this.toast.classList.remove('active');
          this.showSpotlight(step, target, index);
        }
      }, 250);
    },

    showSpotlight: function(step, target, index) {
      // Start with main target rect
      let top = target.getBoundingClientRect().top;
      let left = target.getBoundingClientRect().left;
      let bottom = target.getBoundingClientRect().bottom;
      let right = target.getBoundingClientRect().right;

      // Union with any additional included elements
      if (step.spotlightInclude) {
        step.spotlightInclude.forEach(selector => {
          const el = document.querySelector(selector);
          if (el) {
            const r = el.getBoundingClientRect();
            top = Math.min(top, r.top);
            left = Math.min(left, r.left);
            bottom = Math.max(bottom, r.bottom);
            right = Math.max(right, r.right);
          }
        });
      }

      const padding = 20;

      // Position spotlight over merged area (fixed positioning = viewport coordinates)
      this.spotlight.style.top = `${top - padding}px`;
      this.spotlight.style.left = `${left - padding}px`;
      this.spotlight.style.width = `${(right - left) + padding * 2}px`;
      this.spotlight.style.height = `${(bottom - top) + padding * 2}px`;

      // Update tooltip content
      this.messageEl.textContent = step.message;
      this.progressEl.textContent = `${index + 1} / ${this.steps.length}`;

      // Update button text
      const nextBtn = this.tooltip.querySelector('.tour-next');
      nextBtn.textContent = index === this.steps.length - 1 ? 'Finish' : 'Next';

      // Show elements
      this.overlay.classList.add('active');
      this.spotlight.classList.add('active');
      this.tooltip.classList.add('active');

      // Position tooltip
      this.positionTooltip();
    },

    positionTooltip: function(targetRect) {
      const tooltip = this.tooltip;

      // Reset position
      tooltip.style.top = '';
      tooltip.style.bottom = '';
      tooltip.style.left = '';
      tooltip.style.right = '';

      // Fixed position: bottom-right corner
      tooltip.style.bottom = '24px';
      tooltip.style.right = '24px';
    },

    showToast: function(step, index) {
      this.toastMessage.textContent = step.message;
      this.toastProgress.textContent = `${index + 1}/${this.steps.length}`;

      const nextBtn = this.toast.querySelector('.tour-toast-next');
      nextBtn.textContent = index === this.steps.length - 1 ? 'Done' : 'Next';

      this.toast.classList.add('active');
    },

    next: function() {
      this.currentStep++;
      if (this.currentStep >= this.steps.length) {
        this.end();
      } else {
        this.showStep(this.currentStep);
      }
    },

    prev: function() {
      if (this.currentStep > 0) {
        this.currentStep--;
        this.showStep(this.currentStep);
      }
    },

    end: function() {
      this.isActive = false;
      this.overlay.classList.remove('active');
      this.spotlight.classList.remove('active');
      this.tooltip.classList.remove('active');
      this.toast.classList.remove('active');
      document.body.classList.remove('tour-active');

      // Scroll back to top
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Track completion
      if (window.plausible) {
        window.plausible('Tour Completed', { props: { step: this.currentStep + 1 } });
      }
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SiteTour.init());
  } else {
    SiteTour.init();
  }

  // Expose globally
  window.SiteTour = SiteTour;
})();
