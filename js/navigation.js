/**
 * @module navigation
 * @description Smart Navigation — Leaflet.js interactive map + Gemini AI wayfinding chatbot
 */

import { geminiClient } from './gemini.js';
import { _typewrite }   from './dashboard.js';

const VENUE_MAPS = {
  metlife  : { lat: 40.8135,  lng: -74.0745,  zoom: 16, name: 'MetLife Stadium' },
  atandt   : { lat: 32.7480,  lng: -97.0933,  zoom: 16, name: 'AT&T Stadium' },
  sofi     : { lat: 33.9535,  lng: -118.3392, zoom: 16, name: 'SoFi Stadium' },
  levis    : { lat: 37.4032,  lng: -121.9698, zoom: 16, name: "Levi's Stadium" },
  gillette : { lat: 42.0909,  lng: -71.2643,  zoom: 16, name: 'Gillette Stadium' },
  lumen    : { lat: 47.5952,  lng: -122.3316, zoom: 16, name: 'Lumen Field' },
  bcplace  : { lat: 49.2768,  lng: -123.1118, zoom: 16, name: 'BC Place' },
  azteca   : { lat: 19.3029,  lng: -99.1505,  zoom: 16, name: 'Estadio Azteca' },
};

const POIS = [
  { label: '🅿️ Gate N1 — North Entry',         type: 'gate',      offset: [ 0.003, -0.001] },
  { label: '🅿️ Gate S1 — South Entry',         type: 'gate',      offset: [-0.003,  0.001] },
  { label: '🅿️ Gate E1 — East Entry (⚠️ Busy)', type: 'gate-busy', offset: [ 0.000,  0.004] },
  { label: '🅿️ Gate W1 — West Entry',           type: 'gate',      offset: [ 0.000, -0.004] },
  { label: '🍔 Concession Stand A (Level 1)',    type: 'food',      offset: [ 0.001,  0.001] },
  { label: '🍔 Concession Stand B (Level 2)',    type: 'food',      offset: [-0.001, -0.002] },
  { label: '🚻 Restroom Block 1 (Accessible)',   type: 'accessible',offset: [ 0.002, -0.002] },
  { label: '🚻 Restroom Block 2',               type: 'restroom',  offset: [-0.002,  0.002] },
  { label: '♿ Accessible Viewing — North',      type: 'accessible',offset: [ 0.0015, 0.000] },
  { label: '🏥 First Aid Station',               type: 'medical',   offset: [-0.001,  0.003] },
  { label: '🚌 Shuttle Stop — North',           type: 'transport', offset: [ 0.004,  0.000] },
  { label: '🚇 Metro Link Entrance',             type: 'transport', offset: [-0.004,  0.000] },
  { label: 'ℹ️ Fan Info Desk',                   type: 'info',      offset: [ 0.001, -0.003] },
  { label: '🛒 Official Merchandise Store',      type: 'shop',      offset: [-0.002, -0.001] },
];

const MARKER_EMOJI = {
  gate       : '🔵',
  'gate-busy': '🔴',
  food       : '🟡',
  accessible : '♿',
  restroom   : '🟢',
  medical    : '🔴',
  transport  : '🟣',
  info       : '⚪',
  shop       : '🟠',
};

const QUICK_PROMPTS = [
  { label: '🚪 Nearest gate',       prompt: 'What is the nearest open gate and fastest route from the main car park?' },
  { label: '♿ Accessible restroom', prompt: 'Where is the nearest accessible restroom with a changing table?' },
  { label: '🍕 Food & beverages',    prompt: 'Which concession stands have the shortest queues right now?' },
  { label: '🏥 First aid',           prompt: 'Where is the nearest first aid station and what services do they provide?' },
  { label: '🚌 Shuttle times',       prompt: 'What time is the next shuttle bus and where do I board?' },
  { label: '📍 My section',          prompt: 'How do I get to Section 204 from Gate N1?' },
];

export class NavigationModule {
  constructor(container, options) {
    this.container    = container;
    this.options      = options;
    this._map         = null;
    this._messages    = [];
    this._isLoading   = false;
    this._venueConfig = VENUE_MAPS[options.venue] ?? VENUE_MAPS.metlife;
  }

  async init() {
    this._render();
    this._initMap();
    this._bindEvents();
    this._addMessage('assistant',
      `🗺️ Welcome to Smart Navigation at **${this._venueConfig.name}**!\n\n` +
      `I can help you find gates, restrooms, food, first aid, accessible facilities, and transport.\n\n` +
      `Try a quick action below or type your question in any language.`
    );
  }

  _render() {
    this.container.innerHTML = `
      <section class="module-section" aria-labelledby="nav-heading">
        <div class="module-header">
          <h1 id="nav-heading" tabindex="-1">🗺️ Smart Navigation</h1>
          <p class="body-sm" style="color:var(--text-muted)">📍 ${this._venueConfig.name}</p>
        </div>

        <div class="section-divider">
          <div>
            <div class="map-container" role="application" aria-label="Interactive stadium map">
              <div id="stadium-map" aria-label="Stadium map showing gates, facilities and points of interest"></div>
              <div style="position:absolute;bottom:8px;left:8px;z-index:1000;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:8px;padding:6px 10px;font-size:0.7rem;display:flex;gap:8px;flex-wrap:wrap;">
                <span>🔵 Gate</span><span>🔴 Busy/Medical</span><span>🟡 Food</span>
                <span>♿ Access</span><span>🟣 Transit</span>
              </div>
            </div>
          </div>

          <div class="chat-container" role="region" aria-label="AI wayfinding assistant">
            <div style="padding:12px 16px;border-bottom:1px solid var(--border-color);background:rgba(255,255,255,0.02);">
              <h2 style="font-size:0.9rem;font-weight:700;">🤖 AI Wayfinding Assistant</h2>
              <p class="body-xs" style="color:var(--text-muted)">Powered by Gemini · Knows your venue</p>
            </div>
            <div class="chat-messages" id="nav-messages" role="log" aria-live="polite" aria-label="AI wayfinding conversation"></div>
            <div class="chat-input-area">
              <div class="quick-actions" role="group" aria-label="Quick navigation shortcuts">
                ${QUICK_PROMPTS.map((q, i) =>
                  `<button class="quick-action-btn" data-idx="${i}" aria-label="Quick: ${q.label}">${q.label}</button>`
                ).join('')}
              </div>
              <div class="chat-input-row">
                <textarea
                  id="nav-input"
                  class="chat-input"
                  placeholder="Ask anything about the stadium..."
                  rows="2"
                  maxlength="500"
                  aria-label="Type your navigation question"
                  aria-describedby="nav-hint"
                ></textarea>
                <button id="nav-send" class="chat-send-btn" aria-label="Send message" title="Send (Enter)">➤</button>
              </div>
              <small id="nav-hint" class="form-hint">Enter to send · Shift+Enter for new line</small>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  _initMap() {
    if (typeof L === 'undefined') { console.warn('[Navigation] Leaflet not loaded'); return; }
    const { lat, lng, zoom } = this._venueConfig;

    this._map = L.map('stadium-map', { center: [lat, lng], zoom, zoomControl: true });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(this._map);

    // Stadium icon
    L.marker([lat, lng], {
      icon: L.divIcon({ html: '<div style="font-size:2rem">🏟️</div>', className: '', iconSize: [32,32], iconAnchor: [16,16] }),
      alt: this._venueConfig.name,
    }).addTo(this._map).bindPopup(`<strong>${this._venueConfig.name}</strong><br>FIFA World Cup 2026 Venue`);

    // POI markers
    POIS.forEach(poi => {
      const emoji = MARKER_EMOJI[poi.type] ?? '📍';
      L.marker(
        [lat + poi.offset[0], lng + poi.offset[1]],
        { icon: L.divIcon({ html: `<div style="font-size:1.25rem;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))">${emoji}</div>`, className: '', iconSize: [24,24], iconAnchor: [12,12] }),
          alt: poi.label }
      ).addTo(this._map).bindPopup(poi.label);
    });
  }

  _bindEvents() {
    this.container.querySelector('.quick-actions')?.addEventListener('click', e => {
      const btn = e.target.closest('.quick-action-btn');
      if (btn) this._sendMessage(QUICK_PROMPTS[parseInt(btn.dataset.idx, 10)]?.prompt ?? '');
    });

    document.getElementById('nav-send')?.addEventListener('click', () => this._handleSend());

    document.getElementById('nav-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._handleSend(); }
    });
  }

  _handleSend() {
    const input = document.getElementById('nav-input');
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
    this._addMessage('user', text);
    this._messages.push({ role: 'user', content: text });

    const typingId = this._addTyping();
    const sendBtn  = document.getElementById('nav-send');
    if (sendBtn) sendBtn.disabled = true;

    const sysExtra = `Venue: ${this._venueConfig.name}. Focus on physical navigation, directions, and facility locations. Reference gate numbers, section numbers, and concourse names where possible.`;

    try {
      const reply = await geminiClient.chat(this._messages, sysExtra);
      this._removeTyping(typingId);
      this._addMessage('assistant', reply);
      this._messages.push({ role: 'assistant', content: reply });
      // Trim history to cap token usage (keep last 10 turns)
      if (this._messages.length > 20) this._messages.splice(0, 2);
    } catch (err) {
      this._removeTyping(typingId);
      this._addMessage('assistant', `⚠️ ${err.message}`);
    } finally {
      this._isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      document.getElementById('nav-input')?.focus();
    }
  }

  _addMessage(role, text) {
    const list = document.getElementById('nav-messages');
    if (!list) return null;

    const wrapper = document.createElement('div');
    wrapper.className = `message message-${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text; // textContent — XSS safe

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.textContent = role === 'user' ? `You · ${time}` : `StadiumIQ · ${time}`;

    wrapper.append(bubble, meta);
    list.appendChild(wrapper);
    list.scrollTop = list.scrollHeight;
    return wrapper;
  }

  _addTyping() {
    const list = document.getElementById('nav-messages');
    if (!list) return null;
    const id  = `typing-${Date.now()}`;
    const div = document.createElement('div');
    div.id        = id;
    div.className = 'message message-assistant';
    div.innerHTML = '<div class="message-bubble"><div class="ai-loading"><div class="loading-dots"><span></span><span></span><span></span></div><span>Thinking…</span></div></div>';
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    return id;
  }

  _removeTyping(id) { if (id) document.getElementById(id)?.remove(); }

  destroy() {
    this._map?.remove();
    this._map      = null;
    this._messages = [];
  }
}
