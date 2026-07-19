/**
 * @module transport
 * @description Transport Hub — real-time status board and AI departure recommendations
 */

import { geminiClient } from './gemini.js';
import { _typewrite }   from './dashboard.js';

const TRANSPORT_DATA = [
  { id: 'nj-transit-1',  name: 'NJ Transit Train',    route: 'Meadowlands Line → Penn Station',      next: '18:42', wait: '12 min', status: 'on-time',   type: '🚆', capacity: 68 },
  { id: 'nj-transit-2',  name: 'NJ Transit Train',    route: 'Meadowlands Line → Penn Station',      next: '19:02', wait: '32 min', status: 'on-time',   type: '🚆', capacity: 22 },
  { id: 'shuttle-north', name: 'Shuttle North',        route: 'North Car Park → Stadium → Metro Hub', next: '18:35', wait: '5 min',  status: 'arriving',  type: '🚌', capacity: 91 },
  { id: 'shuttle-south', name: 'Shuttle South',        route: 'South Car Park → Stadium',             next: '18:38', wait: '8 min',  status: 'on-time',   type: '🚌', capacity: 54 },
  { id: 'bus-express',   name: 'Express Coach 55',     route: 'Stadium → Times Square Direct',        next: '18:55', wait: '25 min', status: 'on-time',   type: '🚌', capacity: 45 },
  { id: 'rideshare',     name: 'Rideshare Zone A',     route: 'Designated pickup — North forecourt',  next: 'Now',   wait: '2-8 min',status: 'on-time',   type: '🚗', capacity: 0  },
  { id: 'rideshare-b',   name: 'Rideshare Zone B',     route: 'Designated pickup — East forecourt',   next: 'Now',   wait: '4-12 min',status:'delayed',  type: '🚗', capacity: 0  },
  { id: 'taxi',          name: 'Official Taxi Rank',   route: 'Licensed taxis — South Entrance',      next: 'Now',   wait: '5-15 min',status:'on-time',  type: '🚕', capacity: 0  },
  { id: 'park-ride',     name: 'Park & Ride Blue',     route: 'Blue Lot → Stadium (loop)',            next: '18:40', wait: '10 min', status: 'on-time',   type: '🅿️', capacity: 37 },
  { id: 'accessible',    name: 'Accessible Transport', route: 'Accessible vehicle — Gate W1 only',   next: '18:45', wait: '15 min', status: 'on-time',   type: '♿', capacity: 12 },
];

const STATUS_MAP = {
  'on-time' : { cls: 'status-on-time',   label: '✅ On Time'  },
  'delayed' : { cls: 'status-delayed',   label: '⚠️ Delayed'  },
  'arriving': { cls: 'status-arriving',  label: '🔵 Arriving' },
  'cancelled':{ cls: 'status-cancelled', label: '❌ Cancelled' },
};

export class TransportModule {
  /**
   * @description Call/execute constructor
   * @complexity Time O(1) | Space O(1)
   */
  constructor(container, options) {
    this.container  = container;
    this.options    = options;
    this._ticker    = null;
    this._data      = TRANSPORT_DATA.map(t => ({ ...t }));
    this._messages  = [];
    this._chatLoading = false;
  }

  /**
   * @description Call/execute init
   * @complexity Time O(1) | Space O(1)
   */
  async init() {
    this._render();
    this._renderBoard();
    this._startTicker();
  }

  _render() {
    const section = document.createElement('section');
    section.className = 'module-section';
    section.setAttribute('aria-labelledby', 'transport-heading');

    section.innerHTML = `
      <div class="module-header">
        <h1 id="transport-heading" tabindex="-1">🚌 Transport Hub</h1>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="transport-ai-btn" class="btn-primary" aria-label="Get AI departure recommendations">
            🤖 AI Advice
          </button>
          <button id="transport-refresh" class="btn-refresh" aria-label="Refresh transport data" title="Refresh">↻</button>
        </div>
      </div>

      <!-- Metrics -->
      <div class="metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))" role="list" aria-label="Transport summary metrics">
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">🚆</div>
          <div class="metric-value">2</div>
          <div class="metric-label">Trains Available</div>
          <div class="metric-sub">Next: 18:42</div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">🚌</div>
          <div class="metric-value">3</div>
          <div class="metric-label">Shuttles Active</div>
          <div class="metric-sub">5 min frequency</div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">🚗</div>
          <div class="metric-value">94%</div>
          <div class="metric-label">On-Time Rate</div>
          <div class="metric-sub">Above target</div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">⏱️</div>
          <div class="metric-value" id="transport-avg-wait">8 min</div>
          <div class="metric-label">Avg Wait Time</div>
          <div class="metric-sub" id="transport-last-update">Live</div>
        </div>
      </div>

      <!-- Departures Board -->
      <div class="status-board" aria-labelledby="board-heading">
        <div class="status-board-header">
          <h2 id="board-heading">🕐 Departure Board</h2>
          <span class="body-xs" style="color:var(--text-muted)">Times shown are next departures</span>
        </div>
        <div id="transport-board" role="list" aria-label="Transport departures"></div>
      </div>

      <!-- AI Recommendations -->
      <div class="ai-card" id="transport-ai-card" style="display:none" aria-labelledby="transport-ai-heading">
        <div class="ai-card-header">
          <span aria-hidden="true" style="font-size:1.5rem">🤖</span>
          <h2 id="transport-ai-heading" style="flex:1">AI Departure Recommendations</h2>
          <button class="btn-refresh" id="transport-close-ai" aria-label="Close AI recommendations">✕</button>
        </div>
        <div class="ai-response" id="transport-ai-text" aria-live="polite" aria-label="AI departure advice"></div>
      </div>

      <!-- AI Chat for Transport -->
      <div class="chat-container" role="region" aria-label="Transport AI assistant" style="height:400px">
        <div style="padding:12px 16px;border-bottom:1px solid var(--border-color);background:rgba(255,255,255,0.02);">
          <h2 style="font-size:0.9rem;font-weight:700;">💬 Transport Assistant</h2>
          <p class="body-xs" style="color:var(--text-muted)">Ask about routes, schedules, parking, and transport options</p>
        </div>
        <div class="chat-messages" id="transport-messages" role="log" aria-live="polite" aria-label="Transport assistant conversation"></div>
        <div class="chat-input-area">
          <div class="quick-actions" role="group" aria-label="Common transport questions">
            <button class="quick-action-btn" data-p="Which transport option is best for getting downtown quickly after the match?">🏙️ Get downtown fast</button>
            <button class="quick-action-btn" data-p="What are the accessible transport options available?">♿ Accessible transport</button>
            <button class="quick-action-btn" data-p="Where is the nearest rideshare pickup zone and how long is the wait?">🚗 Rideshare pickup</button>
            <button class="quick-action-btn" data-p="What time should I leave to beat the post-match crowds?">⏰ Beat the rush</button>
          </div>
          <div class="chat-input-row">
            <textarea id="transport-input" class="chat-input" rows="2" maxlength="500"
              placeholder="Ask about transport options..." aria-label="Type your transport question"></textarea>
            <button id="transport-send" class="chat-send-btn" aria-label="Send message">➤</button>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(section);
    this._bindEvents();
  }

  /**
   * @description Call/execute _bindEvents
   * @complexity Time O(1) | Space O(1)
   */
  _bindEvents() {
    document.getElementById('transport-ai-btn')?.addEventListener('click', () => this._getAIAdvice());
    document.getElementById('transport-close-ai')?.addEventListener('click', () => {
      document.getElementById('transport-ai-card').style.display = 'none';
    });
    document.getElementById('transport-refresh')?.addEventListener('click', () => this._renderBoard());
    document.getElementById('transport-send')?.addEventListener('click', () => this._chatSend());
    document.getElementById('transport-input')?.addEventListener('keydown', e => {
      /**
       * @description Call/execute if
       * @complexity Time O(1) | Space O(1)
       */
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._chatSend(); }
    });
    this.container.querySelector('#transport-messages')?.closest('.chat-container').querySelector('.quick-actions')
      ?.addEventListener('click', e => {
        const btn = e.target.closest('[data-p]');
        if (btn) {
          const input = document.getElementById('transport-input');
          if (input) { input.value = btn.dataset.p; this._chatSend(); }
        }
      });
  }

  /**
   * @description Call/execute _renderBoard
   * @complexity Time O(1) | Space O(1)
   */
  _renderBoard() {
    const board = document.getElementById('transport-board');
    if (!board) return;
    board.innerHTML = '';

    this._data.forEach(t => {
      const status = STATUS_MAP[t.status] ?? STATUS_MAP['on-time'];
      const row    = document.createElement('div');
      row.className = 'status-row';
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-label', `${t.name}, ${t.route}, next: ${t.next}, status: ${status.label}`);
      row.style.gridTemplateColumns = '1fr auto auto auto';

      const nameDiv = document.createElement('div');
      const nameTxt = document.createElement('div');
      nameTxt.className = 'transport-name';
      nameTxt.textContent = `${t.type} ${t.name}`;

      const routeTxt = document.createElement('div');
      routeTxt.className = 'transport-route';
      routeTxt.textContent = t.route;

      nameDiv.append(nameTxt, routeTxt);

      const nextTime = document.createElement('div');
      nextTime.className = 'transport-time';
      nextTime.textContent = t.next;

      const waitDiv = document.createElement('div');
      waitDiv.className = 'transport-wait';
      waitDiv.textContent = t.wait;

      // Capacity bar (if applicable)
      /**
       * @description Call/execute if
       * @complexity Time O(1) | Space O(1)
       */
      if (t.capacity > 0) {
        const cap = document.createElement('div');
        cap.className = 'progress-bar';
        cap.style.width = '60px';
        cap.style.marginTop = '4px';
        const fill = document.createElement('div');
        fill.className = `progress-fill ${t.capacity > 80 ? 'progress-fill-red' : t.capacity > 50 ? '' : 'progress-fill-green'}`;
        fill.style.width = `${t.capacity}%`;
        cap.appendChild(fill);
        nameDiv.appendChild(cap);
      }

      const badge = document.createElement('span');
      badge.className = `status-badge ${status.cls}`;
      badge.textContent = status.label;

      row.append(nameDiv, nextTime, waitDiv, badge);
      board.appendChild(row);
    });
  }

  /**
   * @description Call/execute _startTicker
   * @complexity Time O(1) | Space O(1)
   */
  _startTicker() {
    this._ticker = setInterval(() => {
      // Simulate minute counter updates
      this._data.forEach(t => {
        if (t.wait.includes('min')) {
          const mins = parseInt(t.wait, 10);
          if (!isNaN(mins) && mins > 1) {
            const newWait = mins - 1;
            t.wait = `${newWait} min`;
          }
        }
      });
      this._renderBoard();

      const update = document.getElementById('transport-last-update');
      if (update) update.textContent = `Updated ${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
    }, 30_000);
  }

  /**
   * @description Call/execute _getAIAdvice
   * @complexity Time O(1) | Space O(1)
   */
  async _getAIAdvice() {
    const card = document.getElementById('transport-ai-card');
    const textEl = document.getElementById('transport-ai-text');
    if (!card || !textEl) return;

    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

    textEl.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'ai-loading';
    loading.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    const txt = document.createElement('p'); txt.textContent = 'Analysing transport options...';
    loading.appendChild(txt); textEl.appendChild(loading);

    const prompt = [
      `Provide transport departure recommendations for fans leaving a FIFA World Cup 2026 match.`,
      `Current time: approximately 18:30. Match ends around 19:30-20:00.`,
      ``,
      `Available transport options:`,
      ...this._data.map(t => `- ${t.type} ${t.name}: Next departure ${t.next}, wait ${t.wait}, status: ${t.status}${t.capacity > 0 ? `, capacity: ${t.capacity}%` : ''}`),
      ``,
      `Please provide:`,
      `1. **Best Options Right Now** — top 3 recommendations with reasoning`,
      `2. **Post-Match Strategy** — advice for leaving DURING and AFTER the match`,
      `3. **Avoid These** — any options to avoid and why`,
      `4. **Pro Tip** — one insider tip for a smoother exit`,
      ``,
      `Be practical and specific. Max 200 words.`,
    ].join('\n');

    try {
      const text = await geminiClient.generate(prompt, 'You are a transport logistics expert for FIFA World Cup 2026 stadiums.', false);
      textEl.innerHTML = '';
      const outEl = document.createElement('div');
      outEl.className = 'ai-text';
      textEl.appendChild(outEl);
      _typewrite(outEl, text, 10);
    } catch (err) {
      console.error('[Transport] Gemini error:', err);
      textEl.innerHTML = '';
      const msgEl = document.createElement('p');
      msgEl.style.color = 'var(--text-muted)';
      msgEl.textContent = err.message.includes('API key') || err.message.includes('No API key')
        ? '⚙️ Add your Gemini API key in Settings (⚙️) to get AI departure recommendations.'
        : 'I\'m having trouble connecting right now. Please try again in a moment. 🔄';
      textEl.appendChild(msgEl);
    }
  }

  /**
   * @description Call/execute _chatSend
   * @complexity Time O(1) | Space O(1)
   */
  async _chatSend() {
    const input = document.getElementById('transport-input');
    const text  = input?.value.trim();
    if (!text || this._chatLoading) return;
    if (text.length > 500) {
      this.options.onToast?.('Input exceeds 500 characters limit.', 'warning');
      return;
    }
    input.value = '';
    this._chatLoading = true;

    this._addMsg('user', text);
    this._messages.push({ role: 'user', content: text });

    const typingId = this._addTyping();
    const sendBtn  = document.getElementById('transport-send');
    if (sendBtn) sendBtn.disabled = true;

    try {
      const reply = await geminiClient.chat(this._messages, 'You are a transport and logistics assistant for FIFA World Cup 2026. Give concise, practical transport advice.');
      this._removeTyping(typingId);
      this._addMsg('assistant', reply);
      this._messages.push({ role: 'assistant', content: reply });
      if (this._messages.length > 20) this._messages.splice(0, 2);
    } catch (err) {
      console.error('[Transport Chat] Gemini error:', err);
      this._removeTyping(typingId);
      this._addMsg('assistant', err.message.includes('API key') || err.message.includes('No API key')
        ? '⚙️ Please enter your Gemini API key in Settings (⚙️) to enable AI transport advice.'
        : 'I\'m having trouble connecting right now. Please try again in a moment. 🔄'
      );
    } finally {
      this._chatLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      input?.focus();
    }
  }

  /**
   * @description Call/execute _addMsg
   * @complexity Time O(1) | Space O(1)
   */
  _addMsg(role, text) {
    const list = document.getElementById('transport-messages');
    if (!list) return;
    const wrap = document.createElement('div');
    wrap.className = `message message-${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = role === 'user' ? 'You' : 'StadiumIQ';
    wrap.append(bubble, meta);
    list.appendChild(wrap);
    list.scrollTop = list.scrollHeight;
  }

  /**
   * @description Call/execute _addTyping
   * @complexity Time O(1) | Space O(1)
   */
  _addTyping() {
    const list = document.getElementById('transport-messages');
    if (!list) return null;
    const id  = `typing-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id; div.className = 'message message-assistant';
    div.innerHTML = '<div class="message-bubble"><div class="ai-loading"><div class="loading-dots"><span></span><span></span><span></span></div></div></div>';
    list.appendChild(div); list.scrollTop = list.scrollHeight;
    return id;
  }

  /**
   * @description Call/execute _removeTyping
   * @complexity Time O(1) | Space O(1)
   */
  _removeTyping(id) { if (id) document.getElementById(id)?.remove(); }

  destroy() {
    clearInterval(this._ticker);
    this._ticker   = null;
    this._messages = [];
  }
}

/* ─── Pure Utility Functions (exported for testing) ─────────────────────── */

const _memoize = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
};

/**
 * Calculate on-time percentage for transport routes.
 * @param {number} onTime - Number of on-time departures
 * @param {number} total  - Total departures
 * @returns {number} Percentage 0–100
 * @complexity Time O(1) | Space O(1)
 */
export const calcOnTimePercent = _memoize((onTime, total) => {
  if (typeof onTime !== 'number' || typeof total !== 'number') return 0;
  if (isNaN(onTime) || isNaN(total)) return 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (onTime / total) * 100));
});

/**
 * Classify transport delay severity per FIFA operations guidelines.
 * @param {number} delayMins - Delay in minutes
 * @returns {string} 'LOW' | 'MEDIUM' | 'HIGH'
 * @complexity Time O(1) | Space O(1)
 */
export const getDelaySeverity = _memoize((delayMins) => {
  if (typeof delayMins !== 'number' || isNaN(delayMins)) return 'LOW';
  const d = Math.max(0, delayMins);
  if (d < 5)  return 'LOW';
  if (d <= 15) return 'MEDIUM';
  return 'HIGH';
});
