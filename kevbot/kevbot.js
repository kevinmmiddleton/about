// KevBot Chat Widget
// Add this script to your page and call KevBot.init('YOUR_WORKER_URL')

(function() {
  'use strict';

  const KevBot = {
    workerUrl: null,
    isOpen: false,
    history: [],

    init: function(workerUrl) {
      this.workerUrl = workerUrl;
      this.injectStyles();
      this.createWidget();
      this.bindEvents();
    },

    injectStyles: function() {
      const styles = `
        .kevbot-fab {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6C8CFF 0%, #A48CF9 100%);
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(108, 140, 255, 0.4);
          z-index: 9999;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kevbot-fab:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 28px rgba(108, 140, 255, 0.5);
        }
        .kevbot-fab svg {
          width: 28px;
          height: 28px;
          fill: white;
        }
        .kevbot-fab.open svg.chat-icon { display: none; }
        .kevbot-fab:not(.open) svg.close-icon { display: none; }

        .kevbot-panel {
          position: fixed;
          bottom: 100px;
          right: 24px;
          width: 380px;
          max-width: calc(100vw - 48px);
          height: 500px;
          max-height: calc(100vh - 140px);
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
          z-index: 9998;
          display: none;
          flex-direction: column;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .kevbot-panel.open {
          display: flex;
          animation: kevbot-slide-up 0.25s ease;
        }
        @keyframes kevbot-slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .kevbot-header {
          padding: 16px 20px;
          background: linear-gradient(135deg, #6C8CFF 0%, #A48CF9 100%);
          color: white;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .kevbot-avatar {
          font-size: 32px;
          line-height: 1;
        }
        .kevbot-title {
          font-weight: 600;
          font-size: 16px;
        }
        .kevbot-subtitle {
          font-size: 12px;
          opacity: 0.9;
        }

        .kevbot-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .kevbot-msg {
          max-width: 85%;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.5;
          word-wrap: break-word;
        }
        .kevbot-msg.bot {
          background: #f0f2f5;
          color: #1a1a1a;
          align-self: flex-start;
          border-bottom-left-radius: 4px;
        }
        .kevbot-msg.user {
          background: linear-gradient(135deg, #6C8CFF 0%, #A48CF9 100%);
          color: white;
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }
        .kevbot-msg.typing {
          background: #f0f2f5;
          align-self: flex-start;
        }
        .kevbot-msg.typing span {
          display: inline-block;
          width: 8px;
          height: 8px;
          background: #999;
          border-radius: 50%;
          margin: 0 2px;
          animation: kevbot-bounce 1.4s infinite ease-in-out both;
        }
        .kevbot-msg.typing span:nth-child(1) { animation-delay: -0.32s; }
        .kevbot-msg.typing span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes kevbot-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }

        .kevbot-prompts {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
          align-self: flex-start;
        }
        .kevbot-prompt {
          background: transparent;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 6px 12px;
          font-size: 12px;
          color: #6C8CFF;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .kevbot-prompt:hover {
          background: rgba(108, 140, 255, 0.1);
          border-color: #6C8CFF;
        }

        .kevbot-msg.bot a {
          color: #6C8CFF;
          text-decoration: underline;
        }
        .kevbot-msg.bot a:hover {
          color: #A48CF9;
        }

        .kevbot-input-area {
          padding: 12px 16px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          gap: 8px;
        }
        .kevbot-input {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid #e5e7eb;
          border-radius: 24px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }
        .kevbot-input:focus {
          border-color: #6C8CFF;
        }
        .kevbot-send {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, #6C8CFF 0%, #A48CF9 100%);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s, opacity 0.2s;
        }
        .kevbot-send:hover:not(:disabled) {
          transform: scale(1.05);
        }
        .kevbot-send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .kevbot-send svg {
          width: 20px;
          height: 20px;
        }

        @media (max-width: 480px) {
          .kevbot-panel {
            bottom: 0;
            right: 0;
            left: 0;
            width: 100%;
            max-width: 100%;
            height: calc(100vh - 80px);
            max-height: calc(100vh - 80px);
            border-radius: 16px 16px 0 0;
          }
          .kevbot-fab {
            bottom: 16px;
            right: 16px;
          }
        }

        @media (prefers-color-scheme: dark) {
          .kevbot-panel {
            background: #1a1c22;
          }
          .kevbot-msg.bot {
            background: #2d3139;
            color: #f3f4f6;
          }
          .kevbot-input-area {
            border-top-color: #374151;
          }
          .kevbot-input {
            background: #2d3139;
            border-color: #374151;
            color: #f3f4f6;
          }
          .kevbot-input:focus {
            border-color: #6C8CFF;
          }
        }
      `;
      const styleEl = document.createElement('style');
      styleEl.textContent = styles;
      document.head.appendChild(styleEl);
    },

    createWidget: function() {
      // Floating action button
      const fab = document.createElement('button');
      fab.className = 'kevbot-fab';
      fab.setAttribute('aria-label', 'Chat with KevBot');
      fab.innerHTML = `
        <svg class="chat-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>
        <svg class="close-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      `;
      this.fab = fab;

      // Chat panel
      const panel = document.createElement('div');
      panel.className = 'kevbot-panel';
      panel.innerHTML = `
        <div class="kevbot-header">
          <div class="kevbot-avatar">🤖</div>
          <div>
            <div class="kevbot-title">KevBot</div>
            <div class="kevbot-subtitle">Ask me about Kevin!</div>
          </div>
        </div>
        <div class="kevbot-messages"></div>
        <div class="kevbot-input-area">
          <input type="text" class="kevbot-input" placeholder="Ask me about Kevin..." maxlength="500">
          <button class="kevbot-send" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      `;
      this.panel = panel;
      this.messagesEl = panel.querySelector('.kevbot-messages');
      this.inputEl = panel.querySelector('.kevbot-input');
      this.sendBtn = panel.querySelector('.kevbot-send');

      document.body.appendChild(fab);
      document.body.appendChild(panel);

      // Initial greeting with suggested prompts
      this.addMessage('bot', "Hey! I'm KevBot 🤖 Ask me anything about Kevin—his experience, skills, projects, or how to get in touch!");
      this.addSuggestedPrompts();
    },

    addSuggestedPrompts: function() {
      const prompts = document.createElement('div');
      prompts.className = 'kevbot-prompts';
      prompts.innerHTML = `
        <button class="kevbot-prompt" data-action="tour">🗺️ Give me a tour</button>
        <button class="kevbot-prompt" data-prompt="What does Kevin do?">What does Kevin do?</button>
        <button class="kevbot-prompt" data-action="contact">Contact info</button>
      `;
      this.messagesEl.appendChild(prompts);
      this.promptsEl = prompts;

      // Bind prompt clicks
      prompts.querySelectorAll('.kevbot-prompt').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const promptText = btn.dataset.prompt;

          // Hide prompts after click
          prompts.style.display = 'none';

          if (action === 'tour') {
            // Start tour immediately - tour system handles narration
            if (window.startTour) {
              window.startTour();
            }
          } else if (action === 'contact') {
            // Scroll to connect section
            const connectEl = document.querySelector('#connect');
            if (connectEl) {
              connectEl.scrollIntoView({ behavior: 'smooth' });
            }
            // Close KevBot
            this.toggle();
          } else if (promptText) {
            this.inputEl.value = promptText;
            this.send();
          }
        });
      });
    },

    addFollowUpPrompts: function() {
      // Remove any existing follow-up prompts
      const existing = this.messagesEl.querySelector('.kevbot-followups');
      if (existing) existing.remove();

      const followUps = [
        "Tell me about his experience",
        "What are his skills?",
        "How can I contact him?"
      ];

      const container = document.createElement('div');
      container.className = 'kevbot-prompts kevbot-followups';
      followUps.forEach(text => {
        const btn = document.createElement('button');
        btn.className = 'kevbot-prompt';
        btn.textContent = text;
        btn.addEventListener('click', () => {
          this.inputEl.value = text;
          this.send();
        });
        container.appendChild(btn);
      });

      this.messagesEl.appendChild(container);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    },

    bindEvents: function() {
      this.fab.addEventListener('click', () => this.toggle());
      this.sendBtn.addEventListener('click', () => this.send());
      this.inputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.send();
      });
    },

    toggle: function() {
      this.isOpen = !this.isOpen;
      this.fab.classList.toggle('open', this.isOpen);
      this.panel.classList.toggle('open', this.isOpen);
      if (this.isOpen) {
        this.inputEl.focus();
      }
    },

    formatMessage: function(text) {
      // Basic markdown: **bold**, [link](url), and line breaks
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\n/g, '<br>');
      return html;
    },

    addMessage: function(type, text) {
      const msg = document.createElement('div');
      msg.className = `kevbot-msg ${type}`;
      if (type === 'bot') {
        msg.innerHTML = this.formatMessage(text);
      } else {
        msg.textContent = text;
      }
      this.messagesEl.appendChild(msg);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      return msg;
    },

    showTyping: function() {
      const typing = document.createElement('div');
      typing.className = 'kevbot-msg typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      this.messagesEl.appendChild(typing);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      return typing;
    },

    async send() {
      const text = this.inputEl.value.trim();
      if (!text) return;

      this.inputEl.value = '';
      this.inputEl.disabled = true;
      this.sendBtn.disabled = true;

      // Remove follow-up prompts
      const followups = this.messagesEl.querySelector('.kevbot-followups');
      if (followups) followups.remove();

      this.addMessage('user', text);
      const typing = this.showTyping();

      try {
        const response = await fetch(this.workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: this.history
          }),
        });

        const data = await response.json();
        typing.remove();

        if (data.error) {
          this.addMessage('bot', "Oops, something went wrong. Try again?");
        } else {
          this.addMessage('bot', data.reply);
          // Update history for context
          this.history.push({ role: 'user', content: text });
          this.history.push({ role: 'assistant', content: data.reply });
          // Keep history reasonable
          if (this.history.length > 20) {
            this.history = this.history.slice(-20);
          }
          // Show follow-up prompts
          this.addFollowUpPrompts();
        }
      } catch (error) {
        typing.remove();
        this.addMessage('bot', "Couldn't connect. Check your internet and try again!");
      }

      this.inputEl.disabled = false;
      this.sendBtn.disabled = false;
      this.inputEl.focus();
    }
  };

  // Expose globally
  window.KevBot = KevBot;
})();
