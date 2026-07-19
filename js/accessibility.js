/**
 * @module accessibility
 * @description Accessibility Companion — inclusive stadium services powered by Gemini AI
 *
 * Features:
 *  - Accessible route planner (wheelchair, visual, hearing)
 *  - Sensory-friendly zone finder
 *  - AI audio description generator for match events
 *  - Facility status board (lifts, accessible restrooms, viewing areas)
 *  - WCAG 2.1 AA throughout, with high-contrast support
 */

import { geminiClient } from './gemini.js';
import { _typewrite }   from './dashboard.js';

const FACILITIES = [
  { type: 'lift',       name: 'Lift A — North Concourse',         status: 'operational', location: 'Near Gate N1' },
  { type: 'lift',       name: 'Lift B — South Concourse',         status: 'operational', location: 'Near Gate S1' },
  { type: 'lift',       name: 'Lift C — East Concourse',          status: 'maintenance', location: 'Near Gate E1 — Use Lift D' },
  { type: 'lift',       name: 'Lift D — East Concourse (Alt)',    status: 'operational', location: 'Gate E2 area' },
  { type: 'restroom',   name: 'Accessible Restroom — Level 1 N',  status: 'operational', location: 'Concourse A' },
  { type: 'restroom',   name: 'Accessible Restroom — Level 2',    status: 'operational', location: 'Concourse B' },
  { type: 'restroom',   name: 'Family Room — Level 1 S',         status: 'operational', location: 'Concourse D' },
  { type: 'viewing',    name: 'Accessible Viewing — North Stand', status: 'operational', location: 'Level 1, Row AA' },
  { type: 'viewing',    name: 'Accessible Viewing — South Stand', status: 'limited',     location: 'Level 1 — 4 spaces remaining' },
  { type: 'sensory',    name: 'Sensory Quiet Room',              status: 'operational', location: 'Gate W1, Room W-101' },
  { type: 'hearing',    name: 'Hearing Loop — Main Concourse',   status: 'operational', location: 'All concourse areas' },
  { type: 'assistance', name: 'Wheelchair Assistance Desk',      status: 'operational', location: 'Each gate entrance' },
];

const STATUS_ICONS = {
  operational : { icon: '✅', label: 'Operational', cls: 'status-on-time' },
  maintenance : { icon: '🔧', label: 'Maintenance', cls: 'status-delayed' },
  limited     : { icon: '⚠️', label: 'Limited',    cls: 'status-arriving' },
  unavailable : { icon: '❌', label: 'Unavailable', cls: 'status-cancelled' },
};

const TYPE_ICONS = {
  lift      : '🛗',
  restroom  : '🚻',
  viewing   : '♿',
  sensory   : '🎧',
  hearing   : '🔊',
  assistance: '🤝',
};

const NEED_OPTIONS = [
  { value: 'wheelchair',  label: '♿ Wheelchair / Mobility Aid' },
  { value: 'visual',      label: '👁️ Visual Impairment' },
  { value: 'hearing',     label: '🔊 Hearing Impairment' },
  { value: 'sensory',     label: '🎧 Sensory Sensitivity (Autism)' },
  { value: 'cognitive',   label: '🧠 Cognitive / Learning Needs' },
  { value: 'companion',   label: '🤝 Companion / Carer Support' },
];

export class AccessibilityModule {
  constructor(container, options) {
    this.container    = container;
    this.options      = options;
    this._activeTab   = 'route';
    this._accMessages = [];
    this._chatLoading = false;
  }

  async init() {
    this._render();
    this._bindEvents();
    this._renderFacilities();
    this._switchTab('route');
  }

  _render() {
    const section = document.createElement('section');
    section.className = 'module-section';
    section.setAttribute('aria-labelledby', 'acc-heading');

    section.innerHTML = `
      <div class="module-header">
        <h1 id="acc-heading" tabindex="-1">♿ Accessibility Companion</h1>
        <p class="body-sm" style="color:var(--text-muted)">Inclusive services for all fans</p>
      </div>

      <!-- Tab Navigation -->
      <div class="module-nav-bar" role="tablist" aria-label="Accessibility service tabs">
        <button class="module-nav-tab" role="tab" data-tab="route" id="tab-route"
          aria-controls="panel-route" aria-selected="true">🗺️ Route Planner</button>
        <button class="module-nav-tab" role="tab" data-tab="facilities" id="tab-facilities"
          aria-controls="panel-facilities" aria-selected="false">🏗️ Facilities</button>
        <button class="module-nav-tab" role="tab" data-tab="audio" id="tab-audio"
          aria-controls="panel-audio" aria-selected="false">🎙️ Audio Description</button>
        <button class="module-nav-tab" role="tab" data-tab="chat" id="tab-chat"
          aria-controls="panel-chat" aria-selected="false">💬 AI Helper</button>
      </div>

      <!-- Route Planner Panel -->
      <div id="panel-route" role="tabpanel" aria-labelledby="tab-route" hidden>
        <div class="section-divider">
          <div class="card" aria-labelledby="route-form-heading">
            <h2 class="card-title" id="route-form-heading" style="margin-bottom:16px">🗺️ Plan Accessible Route</h2>

            <div class="form-group">
              <label for="acc-need" class="form-label">Your Accessibility Need</label>
              <select id="acc-need" class="form-select" aria-describedby="acc-need-hint">
                ${NEED_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
              </select>
              <small id="acc-need-hint" class="form-hint">Select the option that best describes your need.</small>
            </div>

            <div class="form-group">
              <label for="acc-from" class="form-label">Starting Point</label>
              <select id="acc-from" class="form-select">
                <option value="gate-n1">Gate N1 (North Entry)</option>
                <option value="gate-s1">Gate S1 (South Entry)</option>
                <option value="gate-e2">Gate E2 (East Entry)</option>
                <option value="gate-w1">Gate W1 (West Entry)</option>
                <option value="parking-north">North Car Park</option>
                <option value="metro">Metro Station Entrance</option>
                <option value="shuttle">Shuttle Drop-off Point</option>
              </select>
            </div>

            <div class="form-group">
              <label for="acc-to" class="form-label">Destination</label>
              <select id="acc-to" class="form-select">
                <option value="section-104">Section 104 (Accessible Seating)</option>
                <option value="section-aa">Section AA (North Stand, Row 1)</option>
                <option value="viewing-n">Accessible Viewing Platform — North</option>
                <option value="viewing-s">Accessible Viewing Platform — South</option>
                <option value="restroom-1">Accessible Restroom — Level 1</option>
                <option value="quiet-room">Sensory Quiet Room</option>
                <option value="first-aid">First Aid Station</option>
                <option value="concession">Nearest Accessible Concession</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Additional Requirements</label>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${[
                  { id: 'acc-avoid-crowds', label: 'Avoid high-crowd areas (quiet route)' },
                  { id: 'acc-no-stairs',    label: 'No stairs (lifts and ramps only)' },
                  { id: 'acc-priority',     label: 'Priority access / companion required' },
                ].map(cb => `
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.875rem;">
                    <input type="checkbox" id="${cb.id}" style="width:16px;height:16px;accent-color:var(--color-gold)">
                    ${cb.label}
                  </label>
                `).join('')}
              </div>
            </div>

            <button id="acc-plan-route" class="btn-primary" aria-label="Generate AI accessible route">
              🤖 Generate AI Route
            </button>
          </div>

          <!-- Route result -->
          <div class="ai-card" id="acc-route-result" aria-labelledby="route-result-heading">
            <div class="ai-card-header">
              <span aria-hidden="true" style="font-size:1.5rem">♿</span>
              <h2 id="route-result-heading" style="flex:1">Your Accessible Route</h2>
            </div>
            <div class="ai-response" id="acc-route-text" aria-live="polite" aria-label="AI generated accessible route">
              <p style="color:var(--text-muted)">Fill in the form and click "Generate AI Route" to receive a personalised step-by-step accessible route.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Facilities Panel -->
      <div id="panel-facilities" role="tabpanel" aria-labelledby="tab-facilities" hidden>
        <div class="card" aria-labelledby="fac-heading">
          <div class="card-header">
            <h2 class="card-title" id="fac-heading">🏗️ Accessible Facilities Status</h2>
            <span class="status-badge status-on-time" aria-label="Status: Live">Live</span>
          </div>
          <div id="acc-facilities-list" role="list" aria-label="Stadium accessible facilities status"></div>
        </div>
      </div>

      <!-- Audio Description Panel -->
      <div id="panel-audio" role="tabpanel" aria-labelledby="tab-audio" hidden>
        <div class="section-divider">
          <div class="card" aria-labelledby="audio-form-heading">
            <h2 class="card-title" id="audio-form-heading" style="margin-bottom:16px">🎙️ Match Audio Description</h2>
            <p class="body-sm" style="color:var(--text-muted);margin-bottom:16px">
              Generate a rich audio description of a match event for visually impaired fans.
            </p>
            <div class="form-group">
              <label for="audio-event" class="form-label">Describe the Match Event</label>
              <textarea id="audio-event" class="form-textarea" rows="4"
                placeholder="e.g. USA corner kick, Minute 67, Pulisic running to take the corner, high pressure in the penalty area..."
                aria-describedby="audio-event-hint"
                maxlength="500"
              ></textarea>
              <small id="audio-event-hint" class="form-hint">Describe what is happening on the pitch. AI will generate a vivid audio commentary.</small>
            </div>
            <button id="audio-generate" class="btn-primary" aria-label="Generate audio description">
              🎙️ Generate Description
            </button>
          </div>

          <div class="ai-card" aria-labelledby="audio-result-heading">
            <div class="ai-card-header">
              <span aria-hidden="true" style="font-size:1.5rem">🔊</span>
              <h2 id="audio-result-heading" style="flex:1">Audio Commentary</h2>
            </div>
            <div class="ai-response" id="audio-result" aria-live="polite" aria-label="AI generated audio description">
              <p style="color:var(--text-muted)">Enter a match event above to generate vivid audio commentary for visually impaired fans.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- AI Chat Panel -->
      <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" hidden>
        <div class="chat-container" role="region" aria-label="Accessibility AI assistant" style="height:500px">
          <div style="padding:12px 16px;border-bottom:1px solid var(--border-color);background:rgba(255,255,255,0.02);">
            <h2 style="font-size:0.9rem;font-weight:700;">🤖 Accessibility AI Helper</h2>
            <p class="body-xs" style="color:var(--text-muted)">Ask anything about accessible facilities, routes, or support services</p>
          </div>
          <div class="chat-messages" id="acc-messages" role="log" aria-live="polite" aria-label="Accessibility assistant conversation"></div>
          <div class="chat-input-area">
            <div class="quick-actions" role="group" aria-label="Common accessibility questions">
              <button class="quick-action-btn" data-p="Where is the nearest accessible parking space?">🅿️ Accessible parking</button>
              <button class="quick-action-btn" data-p="What support is available for hearing-impaired fans?">🔊 Hearing support</button>
              <button class="quick-action-btn" data-p="Is there a sensory quiet room and how do I find it?">🎧 Quiet room</button>
              <button class="quick-action-btn" data-p="How do I request wheelchair assistance at the stadium?">♿ Wheelchair help</button>
            </div>
            <div class="chat-input-row">
              <textarea id="acc-chat-input" class="chat-input" rows="2" maxlength="500"
                placeholder="Ask about accessibility services..." aria-label="Type your accessibility question"></textarea>
              <button id="acc-chat-send" class="chat-send-btn" aria-label="Send message">➤</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(section);
  }

  _bindEvents() {
    // Tabs
    this.container.querySelector('[role="tablist"]')?.addEventListener('click', e => {
      const tab = e.target.closest('[data-tab]');
      if (tab) this._switchTab(tab.dataset.tab);
    });

    // Route planner
    document.getElementById('acc-plan-route')?.addEventListener('click', () => this._planRoute());

    // Audio description
    document.getElementById('audio-generate')?.addEventListener('click', () => this._generateAudio());

    // Chat
    document.getElementById('acc-chat-send')?.addEventListener('click', () => this._chatSend());
    document.getElementById('acc-chat-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._chatSend(); }
    });

    // Chat quick actions
    this.container.querySelector('#panel-chat .quick-actions')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-p]');
      if (btn) { const input = document.getElementById('acc-chat-input'); if (input) { input.value = btn.dataset.p; this._chatSend(); } }
    });
  }

  _switchTab(tab) {
    this._activeTab = tab;
    ['route','facilities','audio','chat'].forEach(t => {
      const panel = document.getElementById(`panel-${t}`);
      const tabBtn = document.getElementById(`tab-${t}`);
      const active = t === tab;
      if (panel) panel.hidden = !active;
      if (tabBtn) {
        tabBtn.classList.toggle('active', active);
        tabBtn.setAttribute('aria-selected', String(active));
      }
    });
  }

  _renderFacilities() {
    const list = document.getElementById('acc-facilities-list');
    if (!list) return;
    list.innerHTML = '';

    FACILITIES.forEach(fac => {
      const s      = STATUS_ICONS[fac.status] ?? STATUS_ICONS.operational;
      const typeIc = TYPE_ICONS[fac.type] ?? '♿';

      const item = document.createElement('div');
      item.className = 'status-row';
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-label', `${fac.name}: ${s.label}`);
      item.style.gridTemplateColumns = '1fr auto auto';

      const nameDiv = document.createElement('div');
      const nameTxt = document.createElement('div');
      nameTxt.className = 'transport-name';
      nameTxt.textContent = `${typeIc} ${fac.name}`;
      const locTxt = document.createElement('div');
      locTxt.className = 'transport-route';
      locTxt.textContent = fac.location;
      nameDiv.append(nameTxt, locTxt);

      const badge = document.createElement('span');
      badge.className = `status-badge ${s.cls}`;
      badge.textContent = `${s.icon} ${s.label}`;

      item.append(nameDiv, badge);
      list.appendChild(item);
    });
  }

  async _planRoute() {
    const need    = document.getElementById('acc-need')?.value ?? 'wheelchair';
    const from    = document.getElementById('acc-from')?.options[document.getElementById('acc-from').selectedIndex]?.text ?? 'Gate N1';
    const to      = document.getElementById('acc-to')?.options[document.getElementById('acc-to').selectedIndex]?.text ?? 'Section 104';
    const avoidCrowd = document.getElementById('acc-avoid-crowds')?.checked ?? false;
    const noStairs   = document.getElementById('acc-no-stairs')?.checked ?? false;
    const priority   = document.getElementById('acc-priority')?.checked ?? false;

    const resultEl = document.getElementById('acc-route-text');
    if (!resultEl) return;

    resultEl.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'ai-loading';
    loading.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    const txt = document.createElement('p');
    txt.textContent = 'Planning your accessible route...';
    loading.appendChild(txt);
    resultEl.appendChild(loading);

    const needLabel = NEED_OPTIONS.find(o => o.value === need)?.label ?? need;

    const prompt = [
      `Generate a detailed step-by-step accessible route for a FIFA World Cup 2026 stadium visitor.`,
      ``,
      `Visitor needs: ${needLabel}`,
      `Starting from: ${from}`,
      `Destination: ${to}`,
      `Preferences: ${[
        avoidCrowd ? 'Avoid high-crowd areas' : '',
        noStairs   ? 'No stairs (lifts/ramps only)' : '',
        priority   ? 'Priority access / companion needed' : '',
      ].filter(Boolean).join(', ') || 'Standard accessible route'}`,
      ``,
      `Provide:`,
      `1. **Step-by-step route** — numbered steps with clear physical descriptions`,
      `2. **Lift/Ramp locations** — specific lift names from: Lift A (North), Lift B (South), Lift D (East)`,
      `3. **Estimated journey time** — realistic estimate with accessibility needs in mind`,
      `4. **Staff assistance note** — where to ask for help if needed`,
      ``,
      `Use clear, simple language. Max 200 words. Think like a compassionate stadium guide.`,
    ].join('\n');

    try {
      const text = await geminiClient.generate(prompt, 'You are an expert stadium accessibility coordinator for FIFA World Cup 2026.', false);
      resultEl.innerHTML = '';
      const textEl = document.createElement('div');
      textEl.className = 'ai-text';
      resultEl.appendChild(textEl);
      _typewrite(textEl, text, 10);
    } catch (err) {
      console.error('[Accessibility] Route error:', err);
      resultEl.innerHTML = '';
      const msgEl = document.createElement('p');
      msgEl.style.color = 'var(--text-muted)';
      msgEl.textContent = err.message.includes('API key') || err.message.includes('No API key')
        ? '⚙️ Add your Gemini API key in Settings (⚙️) to generate accessible routes.'
        : 'I\'m having trouble connecting right now. Please try again in a moment. 🔄';
      resultEl.appendChild(msgEl);
    }
  }

  async _generateAudio() {
    const eventInput = document.getElementById('audio-event')?.value.trim();
    const resultEl   = document.getElementById('audio-result');
    if (!eventInput || !resultEl) return;
    if (eventInput.length > 500) {
      this.options.onToast?.('Input exceeds 500 characters limit.', 'warning');
      return;
    }

    resultEl.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'ai-loading';
    loading.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    const txt = document.createElement('p');
    txt.textContent = 'Generating audio description...';
    loading.appendChild(txt);
    resultEl.appendChild(loading);

    const prompt = [
      `Create a vivid, professional audio description for a visually impaired fan at FIFA World Cup 2026.`,
      ``,
      `Match event to describe: "${eventInput}"`,
      ``,
      `Your description must:`,
      `1. Paint a vivid picture using spatial language (left, right, centre, near, far)`,
      `2. Describe player movements, ball trajectory, and crowd atmosphere`,
      `3. Include emotional context and stadium atmosphere`,
      `4. Be written in present tense as if narrating live`,
      `5. Be 100-150 words — long enough for rich description, short enough for real-time delivery`,
      ``,
      `Write ONLY the audio description — no headers, no instructions. Pure commentary.`,
    ].join('\n');

    try {
      const text = await geminiClient.generate(prompt, 'You are a professional sports audio describer for blind and visually impaired fans.', false);
      resultEl.innerHTML = '';
      const textEl = document.createElement('div');
      textEl.className = 'ai-text';
      resultEl.appendChild(textEl);
      _typewrite(textEl, text, 8);
    } catch (err) {
      console.error('[Accessibility] Audio description error:', err);
      resultEl.innerHTML = '';
      const msgEl = document.createElement('p');
      msgEl.style.color = 'var(--text-muted)';
      msgEl.textContent = err.message.includes('API key') || err.message.includes('No API key')
        ? '⚙️ Add your Gemini API key in Settings (⚙️) to generate audio descriptions.'
        : 'I\'m having trouble connecting right now. Please try again in a moment. 🔄';
      resultEl.appendChild(msgEl);
    }
  }

  async _chatSend() {
    const input = document.getElementById('acc-chat-input');
    const text  = input?.value.trim();
    if (!text || this._chatLoading) return;
    if (text.length > 500) {
      this.options.onToast?.('Input exceeds 500 characters limit.', 'warning');
      return;
    }
    input.value = '';
    this._chatLoading = true;

    this._addChatMsg('user', text);
    this._accMessages.push({ role: 'user', content: text });

    const typingId = this._addChatTyping();
    const sendBtn  = document.getElementById('acc-chat-send');
    if (sendBtn) sendBtn.disabled = true;

    try {
      const reply = await geminiClient.chat(
        this._accMessages,
        'You specialise in stadium accessibility services for FIFA World Cup 2026. Always be empathetic, clear, and give actionable guidance.'
      );
      this._removeTyping(typingId);
      this._addChatMsg('assistant', reply);
      this._accMessages.push({ role: 'assistant', content: reply });
      if (this._accMessages.length > 20) this._accMessages.splice(0, 2);
    } catch (err) {
      console.error('[Accessibility Chat] Gemini error:', err);
      this._removeTyping(typingId);
      this._addChatMsg('assistant', err.message.includes('API key') || err.message.includes('No API key')
        ? '⚙️ Please add your Gemini API key in Settings (⚙️) to enable AI accessibility support.'
        : 'I\'m having trouble connecting right now. Please try again in a moment. 🔄'
      );
    } finally {
      this._chatLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      input?.focus();
    }
  }

  _addChatMsg(role, text) {
    const list = document.getElementById('acc-messages');
    if (!list) return;
    const wrap   = document.createElement('div');
    wrap.className = `message message-${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    const meta   = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = role === 'user' ? `You` : `StadiumIQ`;
    wrap.append(bubble, meta);
    list.appendChild(wrap);
    list.scrollTop = list.scrollHeight;
  }

  _addChatTyping() {
    const list = document.getElementById('acc-messages');
    if (!list) return null;
    const id  = `typing-${Date.now()}`;
    const div = document.createElement('div');
    div.id        = id;
    div.className = 'message message-assistant';
    div.innerHTML = '<div class="message-bubble"><div class="ai-loading"><div class="loading-dots"><span></span><span></span><span></span></div></div></div>';
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    return id;
  }

  _removeTyping(id) { if (id) document.getElementById(id)?.remove(); }

  destroy() {
    this._accMessages = [];
    this._chatLoading = false;
  }
}
