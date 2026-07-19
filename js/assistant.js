/**
 * @module assistant
 * @description Multilingual AI Assistant — Gemini-powered conversational support in 10+ languages
 *
 * Features:
 *  - Full multi-turn conversation with history management
 *  - Auto language detection (Gemini responds in user's language)
 *  - 8 pre-built quick action categories
 *  - Conversation clear/reset
 *  - WCAG 2.1 AA accessible chat interface
 */

import { geminiClient } from './gemini.js';

/* ─── Supported Languages (display only — Gemini auto-detects) ─── */
const LANGUAGES = [
  { code: 'auto', label: '🌐 Auto',    name: 'Auto-detect' },
  { code: 'en',   label: '🇺🇸 EN',    name: 'English' },
  { code: 'es',   label: '🇪🇸 ES',    name: 'Español' },
  { code: 'fr',   label: '🇫🇷 FR',    name: 'Français' },
  { code: 'pt',   label: '🇧🇷 PT',    name: 'Português' },
  { code: 'de',   label: '🇩🇪 DE',    name: 'Deutsch' },
  { code: 'ar',   label: '🇸🇦 AR',    name: 'العربية' },
  { code: 'zh',   label: '🇨🇳 ZH',    name: '中文' },
  { code: 'ja',   label: '🇯🇵 JA',    name: '日本語' },
  { code: 'hi',   label: '🇮🇳 HI',    name: 'हिन्दी' },
  { code: 'ru',   label: '🇷🇺 RU',    name: 'Русский' },
];

/* ─── Quick Action Categories ─── */
const QUICK_ACTIONS = [
  {
    category: '🚨 Emergency',
    prompts: [
      { label: 'Medical emergency',   prompt: 'I need medical assistance urgently. What should I do and where is the nearest help?' },
      { label: 'Lost child',          prompt: 'I have lost a child in the stadium. What is the emergency procedure?' },
      { label: 'Report incident',     prompt: 'I need to report a security incident. Who do I contact and how?' },
    ],
  },
  {
    category: '📍 Navigation',
    prompts: [
      { label: 'Find my seat',        prompt: 'How do I find my seat in Section 204, Row G, Seat 12?' },
      { label: 'Nearest exit',        prompt: 'Where is the nearest emergency exit from Section C?' },
      { label: 'Accessible route',    prompt: 'I use a wheelchair. What is the accessible route to the south seating area?' },
    ],
  },
  {
    category: '🍔 Services',
    prompts: [
      { label: 'Halal food',          prompt: 'Where can I find halal food options in this stadium?' },
      { label: 'Lost & found',        prompt: 'I have lost my bag/phone. How do I access the lost and found service?' },
      { label: 'Baby facilities',     prompt: 'Where is the nearest baby changing facility and family room?' },
    ],
  },
  {
    category: '🚌 Transport',
    prompts: [
      { label: 'Getting home',        prompt: 'What is the best way to get home after the match? I am coming from downtown.' },
      { label: 'Taxi/Rideshare',      prompt: 'Where is the designated rideshare pickup zone?' },
      { label: 'Parking info',        prompt: 'What are the parking zones and which is closest to Gate N?' },
    ],
  },
];

export class AssistantModule {
  constructor(container, options) {
    this.container   = container;
    this.options     = options;
    this._messages   = [];      // conversation history [{role, content}]
    this._isLoading  = false;
    this._activeLang = 'auto';
  }

  async init() {
    this._render();
    this._bindEvents();
    this._addGreeting();
  }

  _render() {
    const section = document.createElement('section');
    section.className = 'module-section';
    section.setAttribute('aria-labelledby', 'asst-heading');

    section.innerHTML = `
      <div class="module-header">
        <h1 id="asst-heading" tabindex="-1">🌍 Multilingual AI Assistant</h1>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="asst-clear" class="btn-icon-text" aria-label="Clear conversation history">🗑️ Clear</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:280px 1fr;gap:24px;align-items:start">

        <!-- Sidebar: Languages + Quick Actions -->
        <div style="display:flex;flex-direction:column;gap:16px">

          <!-- Language selector -->
          <div class="card" aria-labelledby="lang-heading">
            <h2 class="card-title" id="lang-heading" style="font-size:0.9rem;margin-bottom:12px;">🌐 Language</h2>
            <div class="lang-selector" role="group" aria-label="Select language for responses" id="asst-langs">
              ${LANGUAGES.map(l =>
                `<button class="lang-btn${l.code === 'auto' ? ' active' : ''}"
                  data-lang="${l.code}"
                  aria-pressed="${l.code === 'auto' ? 'true' : 'false'}"
                  title="${l.name}"
                  aria-label="${l.name}"
                >${l.label}</button>`
              ).join('')}
            </div>
            <p class="form-hint" style="margin-top:8px">
              Gemini auto-detects your language. Select a language to force responses in that language.
            </p>
          </div>

          <!-- Quick Actions -->
          <div class="card" aria-labelledby="qa-heading">
            <h2 class="card-title" id="qa-heading" style="font-size:0.9rem;margin-bottom:12px;">⚡ Quick Actions</h2>
            <div style="display:flex;flex-direction:column;gap:12px" id="asst-quick-actions">
              ${QUICK_ACTIONS.map((cat, ci) => `
                <div>
                  <p style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${cat.category}</p>
                  <div style="display:flex;flex-direction:column;gap:4px">
                    ${cat.prompts.map((p, pi) =>
                      `<button class="quick-action-btn" style="text-align:left;width:100%"
                        data-ci="${ci}" data-pi="${pi}" aria-label="${p.label}"
                      >${p.label}</button>`
                    ).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Chat Interface -->
        <div class="chat-container" role="region" aria-label="Multilingual AI conversation" style="height:640px">
          <div style="padding:12px 16px;border-bottom:1px solid var(--border-color);background:rgba(255,255,255,0.02);display:flex;align-items:center;justify-content:space-between;">
            <div>
              <h2 style="font-size:0.9rem;font-weight:700;">💬 AI Conversation</h2>
              <p class="body-xs" style="color:var(--text-muted)">Powered by Gemini 2.0 Flash · 10+ Languages</p>
            </div>
            <div id="asst-status" class="body-xs" style="color:var(--text-muted)"></div>
          </div>

          <div class="chat-messages" id="asst-messages" role="log" aria-live="polite" aria-label="Conversation messages"></div>

          <div class="chat-input-area">
            <div class="chat-input-row">
              <textarea
                id="asst-input"
                class="chat-input"
                rows="2"
                maxlength="500"
                placeholder="Type in any language — English, Español, Français, العربية, 中文, हिन्दी..."
                aria-label="Type your message in any language"
                aria-describedby="asst-hint"
              ></textarea>
              <button id="asst-send" class="chat-send-btn" aria-label="Send message">➤</button>
            </div>
            <small id="asst-hint" class="form-hint">
              Enter to send · Shift+Enter for new line · Powered by Google Gemini
            </small>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(section);

    // Responsive stacking on small screens
    const grid = section.querySelector('[style*="grid-template-columns"]');
    if (window.innerWidth < 900 && grid) {
      grid.style.gridTemplateColumns = '1fr';
    }
  }

  _bindEvents() {
    // Language selector
    document.getElementById('asst-langs')?.addEventListener('click', e => {
      const btn = e.target.closest('.lang-btn');
      if (!btn) return;
      this._activeLang = btn.dataset.lang;
      document.querySelectorAll('.lang-btn').forEach(b => {
        const active = b.dataset.lang === this._activeLang;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    });

    // Quick actions
    document.getElementById('asst-quick-actions')?.addEventListener('click', e => {
      const btn = e.target.closest('.quick-action-btn');
      if (!btn) return;
      const ci = parseInt(btn.dataset.ci, 10);
      const pi = parseInt(btn.dataset.pi, 10);
      const prompt = QUICK_ACTIONS[ci]?.prompts[pi]?.prompt;
      if (prompt) this._sendMessage(prompt);
    });

    // Send
    document.getElementById('asst-send')?.addEventListener('click', () => this._handleSend());
    document.getElementById('asst-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._handleSend(); }
    });

    // Clear
    document.getElementById('asst-clear')?.addEventListener('click', () => {
      this._messages = [];
      const log = document.getElementById('asst-messages');
      if (log) log.innerHTML = '';
      this._addGreeting();
    });
  }

  _addGreeting() {
    const greeting = [
      `🌍 **Hello! Hola! Bonjour! مرحباً! 你好! नमस्ते!**`,
      ``,
      `I'm StadiumIQ, your FIFA World Cup 2026 multilingual assistant.`,
      `I can help you in **10+ languages** — just write to me naturally in your preferred language.`,
      ``,
      `I can assist with: navigation, lost & found, emergency procedures, transport, food, accessibility, and more.`,
      ``,
      `How can I help you today?`,
    ].join('\n');
    this._addMessageDOM('assistant', greeting);
  }

  _handleSend() {
    const input = document.getElementById('asst-input');
    const text  = input?.value.trim();
    if (!text || this._isLoading) return;
    if (text.length > 500) {
      this.options.onToast?.('Input exceeds 500 characters limit.', 'warning');
      return;
    }
    input.value = '';
    this._sendMessage(text);
  }

  async _sendMessage(text) {
    if (!text || this._isLoading) return;
    this._isLoading = true;

    this._addMessageDOM('user', text);
    this._messages.push({ role: 'user', content: text });

    const typingId = this._addTyping();
    const sendBtn  = document.getElementById('asst-send');
    if (sendBtn) sendBtn.disabled = true;

    // Build language instruction
    const langInstruction = this._activeLang === 'auto'
      ? 'Detect the user\'s language from their message and respond ONLY in that same language.'
      : `Respond ONLY in the language with ISO code: "${this._activeLang}". Do not switch languages.`;

    const sysExtra = [
      langInstruction,
      'You are a helpful, empathetic multilingual assistant for FIFA World Cup 2026.',
      'Be concise, friendly, and safety-conscious.',
      'If a user reports an emergency, always direct them to official emergency services first.',
    ].join(' ');

    try {
      const reply = await geminiClient.chat(this._messages, sysExtra);
      this._removeTyping(typingId);
      this._addMessageDOM('assistant', reply);
      this._messages.push({ role: 'assistant', content: reply });
      if (this._messages.length > 30) this._messages.splice(0, 2);

      const status = document.getElementById('asst-status');
      if (status) status.textContent = `${this._messages.length / 2} exchanges`;
    } catch (err) {
      this._removeTyping(typingId);
      this._addMessageDOM('assistant', `⚠️ ${err.message}`);
    } finally {
      this._isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      document.getElementById('asst-input')?.focus();
    }
  }

  _addMessageDOM(role, text) {
    const list = document.getElementById('asst-messages');
    if (!list) return;

    const wrapper = document.createElement('div');
    wrapper.className = `message message-${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text; // textContent — no XSS risk

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = role === 'user' ? `You · ${time}` : `StadiumIQ · ${time}`;

    wrapper.append(bubble, meta);
    list.appendChild(wrapper);
    list.scrollTop = list.scrollHeight;
    return wrapper;
  }

  _addTyping() {
    const list = document.getElementById('asst-messages');
    if (!list) return null;
    const id  = `typing-${Date.now()}`;
    const div = document.createElement('div');
    div.id        = id;
    div.className = 'message message-assistant';
    div.innerHTML = '<div class="message-bubble"><div class="ai-loading"><div class="loading-dots"><span></span><span></span><span></span></div><span>Responding…</span></div></div>';
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    return id;
  }

  _removeTyping(id) { if (id) document.getElementById(id)?.remove(); }

  destroy() {
    this._messages = [];
  }
}
