/**
 * @module operations
 * @description Operations Command Centre — AI-powered incident management, dispatch, predictive alerts
 *
 * Features:
 *  - Live incident feed with severity classification
 *  - AI incident report generator
 *  - Volunteer dispatch recommendations
 *  - Predictive operational alerts (Gemini)
 *  - Staff AI console for freeform queries
 */

import { geminiClient } from './gemini.js';
import { _typewrite }   from './dashboard.js';

const INCIDENTS = [
  { id: 'INC-001', severity: 'critical', type: 'Crowd Safety', description: 'Gate E1 at 96% — risk of crushing', zone: 'East Concourse', time: '18:22', status: 'Active',   assignee: 'Team Alpha' },
  { id: 'INC-002', severity: 'warning',  type: 'Medical',      description: 'Fan reported chest pain, Section D Row 12', zone: 'Section D', time: '18:25', status: 'Responding', assignee: 'Medic Unit 2' },
  { id: 'INC-003', severity: 'warning',  type: 'Lost Property', description: 'Unattended bag near Concession B — checked, clear', zone: 'Concourse B', time: '18:18', status: 'Resolved',  assignee: 'Security Unit 5' },
  { id: 'INC-004', severity: 'normal',   type: 'Fan Service',   description: 'Lost child — reunited with family at Gate N1', zone: 'Gate N1', time: '18:10', status: 'Resolved',  assignee: 'Fan Services' },
  { id: 'INC-005', severity: 'warning',  type: 'Infrastructure','description': 'Lift C out of service — users redirected to Lift D', zone: 'East Concourse', time: '18:05', status: 'Active',   assignee: 'Facilities' },
];

const VOLUNTEER_ZONES = [
  { zone: 'Gate N1-N3 (North)', volunteers: 8, required: 8, status: 'ok' },
  { zone: 'Gate E1 (East — BUSY)', volunteers: 4, required: 8, status: 'understaffed' },
  { zone: 'Gate S1-S2 (South)', volunteers: 7, required: 6, status: 'ok' },
  { zone: 'Gate W1 (West)', volunteers: 5, required: 5, status: 'ok' },
  { zone: 'Accessible Services', volunteers: 3, required: 5, status: 'understaffed' },
  { zone: 'Fan Info Desks', volunteers: 6, required: 6, status: 'ok' },
  { zone: 'Concourse C', volunteers: 2, required: 4, status: 'understaffed' },
  { zone: 'Medical Support', volunteers: 4, required: 4, status: 'ok' },
];

const PREDICTIVE_ALERTS = [
  { time: 'HT -5min',  risk: 'High',   event: 'Half-time concourse surge', action: 'Open auxiliary gates N2, S2. Add 6 stewards to Concourse A.' },
  { time: '75min',     risk: 'Medium', event: 'Early-departure wave begins', action: 'Pre-position 4 volunteers at North and East exits.' },
  { time: 'FT -2min',  risk: 'High',   event: 'Full-time exit rush (50,000+ fans)', action: 'Activate all 8 gates. Stagger shuttle departures every 2 min.' },
  { time: 'FT +20min', risk: 'Medium', event: 'Remaining crowd slow exit', action: 'Extended food service to reduce lingering. Fan satisfaction check.' },
];

const SEV_CONFIG = {
  critical : { cls: 'incident-critical', badge: 'status-cancelled', badgeText: '🔴 Critical', dotCls: 'incident-critical' },
  warning  : { cls: 'incident-warning',  badge: 'status-delayed',   badgeText: '⚠️ Warning',  dotCls: 'incident-warning' },
  normal   : { cls: 'incident-normal',   badge: 'status-on-time',   badgeText: '✅ Resolved', dotCls: 'incident-normal' },
};

export class OperationsModule {
  constructor(container, options) {
    this.container   = container;
    this.options     = options;
    this._messages   = [];
    this._chatLoading = false;
    this._activeTab  = 'incidents';
  }

  async init() {
    this._render();
    this._bindEvents();
    this._renderIncidents();
    this._renderVolunteers();
    this._renderPredictive();
    this._switchTab('incidents');
    // Add welcome message to AI console
    this._addMsg('assistant', `🎯 **Operations Command Centre — AI Console**\n\nI'm your operational intelligence assistant for ${options?.venue?.toUpperCase() ?? 'MetLife Stadium'}.\n\nI can help with:\n• Incident analysis and response recommendations\n• Volunteer dispatch decisions\n• Real-time crowd management advice\n• Predictive risk assessment\n• Report generation\n\nWhat do you need right now?`);
  }

  _render() {
    const section = document.createElement('section');
    section.className = 'module-section';
    section.setAttribute('aria-labelledby', 'ops-heading');

    section.innerHTML = `
      <div class="module-header">
        <h1 id="ops-heading" tabindex="-1">🎯 Operations Command</h1>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="live-indicator" role="status" aria-label="Operations status: Live">
            <span class="pulse-dot" aria-hidden="true"></span>
            <span>OPS LIVE</span>
          </div>
          <button id="ops-report-btn" class="btn-primary" aria-label="Generate AI operational report">
            📋 AI Report
          </button>
        </div>
      </div>

      <!-- Metrics -->
      <div class="metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))" role="list" aria-label="Operations summary">
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">🚨</div>
          <div class="metric-value" style="color:var(--color-error)">2</div>
          <div class="metric-label">Active Incidents</div>
          <div class="metric-sub">1 Critical, 1 Warning</div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">🙋</div>
          <div class="metric-value">37</div>
          <div class="metric-label">Volunteers On Duty</div>
          <div class="metric-sub">3 zones understaffed</div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">📡</div>
          <div class="metric-value">4</div>
          <div class="metric-label">Predictive Alerts</div>
          <div class="metric-sub">Next: HT -5 min</div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">⚡</div>
          <div class="metric-value">98%</div>
          <div class="metric-label">System Uptime</div>
          <div class="metric-sub">All systems normal</div>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="module-nav-bar" role="tablist" aria-label="Operations tabs">
        <button class="module-nav-tab" role="tab" data-tab="incidents" id="ops-tab-incidents" aria-controls="ops-panel-incidents" aria-selected="true">🚨 Incidents (${INCIDENTS.length})</button>
        <button class="module-nav-tab" role="tab" data-tab="volunteers" id="ops-tab-volunteers" aria-controls="ops-panel-volunteers" aria-selected="false">🙋 Volunteers</button>
        <button class="module-nav-tab" role="tab" data-tab="predictive" id="ops-tab-predictive" aria-controls="ops-panel-predictive" aria-selected="false">📡 Predictive</button>
        <button class="module-nav-tab" role="tab" data-tab="console" id="ops-tab-console" aria-controls="ops-panel-console" aria-selected="false">💬 AI Console</button>
      </div>

      <!-- Incidents Panel -->
      <div id="ops-panel-incidents" role="tabpanel" aria-labelledby="ops-tab-incidents" hidden>
        <div class="card" aria-labelledby="inc-heading">
          <div class="card-header">
            <h2 class="card-title" id="inc-heading">🚨 Active Incident Feed</h2>
            <button class="btn-icon-text" id="ops-gen-report" aria-label="Generate AI incident summary">🤖 AI Summary</button>
          </div>
          <div id="ops-incidents" role="list" aria-label="Active incidents"></div>
          <div class="ai-card" id="ops-incident-ai" style="display:none;margin-top:16px" aria-labelledby="ops-inc-ai-heading">
            <div class="ai-card-header">
              <span aria-hidden="true" style="font-size:1.5rem">🤖</span>
              <h2 id="ops-inc-ai-heading" style="flex:1">AI Incident Summary</h2>
              <button class="btn-refresh" id="ops-close-inc-ai" aria-label="Close">✕</button>
            </div>
            <div class="ai-response" id="ops-incident-text" aria-live="polite"></div>
          </div>
        </div>
      </div>

      <!-- Volunteers Panel -->
      <div id="ops-panel-volunteers" role="tabpanel" aria-labelledby="ops-tab-volunteers" hidden>
        <div class="card" aria-labelledby="vol-heading">
          <div class="card-header">
            <h2 class="card-title" id="vol-heading">🙋 Volunteer Deployment Status</h2>
            <button class="btn-icon-text" id="ops-dispatch-btn" aria-label="Get AI dispatch recommendations">🤖 AI Dispatch</button>
          </div>
          <div id="ops-volunteers" role="list" aria-label="Volunteer zone status"></div>
          <div class="ai-card" id="ops-dispatch-ai" style="display:none;margin-top:16px" aria-labelledby="ops-dispatch-ai-heading">
            <div class="ai-card-header">
              <span aria-hidden="true" style="font-size:1.5rem">🤖</span>
              <h2 id="ops-dispatch-ai-heading" style="flex:1">AI Dispatch Recommendations</h2>
              <button class="btn-refresh" id="ops-close-dispatch" aria-label="Close">✕</button>
            </div>
            <div class="ai-response" id="ops-dispatch-text" aria-live="polite"></div>
          </div>
        </div>
      </div>

      <!-- Predictive Panel -->
      <div id="ops-panel-predictive" role="tabpanel" aria-labelledby="ops-tab-predictive" hidden>
        <div class="card" aria-labelledby="pred-heading">
          <h2 class="card-title" id="pred-heading" style="margin-bottom:16px">📡 AI Predictive Alerts</h2>
          <p class="body-sm" style="color:var(--text-muted);margin-bottom:16px">Based on historical match data, current density, and FIFA 2026 patterns.</p>
          <div id="ops-predictive" role="list" aria-label="Predictive operational alerts"></div>
        </div>
      </div>

      <!-- AI Console Panel -->
      <div id="ops-panel-console" role="tabpanel" aria-labelledby="ops-tab-console" hidden>
        <div class="chat-container" role="region" aria-label="Operations AI command console" style="height:560px">
          <div style="padding:12px 16px;border-bottom:1px solid var(--border-color);background:rgba(255,215,0,0.05);">
            <h2 style="font-size:0.9rem;font-weight:700;">🤖 Operations AI Console</h2>
            <p class="body-xs" style="color:var(--text-muted)">Powered by Gemini · For authorised operations staff only</p>
          </div>
          <div class="chat-messages" id="ops-messages" role="log" aria-live="polite" aria-label="Operations AI conversation"></div>
          <div class="chat-input-area">
            <div class="quick-actions" role="group" aria-label="Quick operations commands">
              <button class="quick-action-btn" data-p="Generate a full operational status report for this shift.">📋 Status report</button>
              <button class="quick-action-btn" data-p="Gate E1 is at 96% density. What immediate actions should I take?">🚨 Gate E1 critical</button>
              <button class="quick-action-btn" data-p="Recommend volunteer reallocation to address understaffed zones.">🙋 Reallocate staff</button>
              <button class="quick-action-btn" data-p="What are the highest risk scenarios for the post-match period?">⚡ Post-match risks</button>
              <button class="quick-action-btn" data-p="Draft a public announcement about Gate E1 congestion and redirect fans to Gate E2.">📢 Draft announcement</button>
            </div>
            <div class="chat-input-row">
              <textarea id="ops-input" class="chat-input" rows="2" maxlength="500"
                placeholder="Ask the AI for operational intelligence, incident analysis, or staff recommendations..."
                aria-label="Type your operations command"></textarea>
              <button id="ops-send" class="chat-send-btn" aria-label="Send command">➤</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Full AI Report -->
      <div class="ai-card" id="ops-full-report" style="display:none" aria-labelledby="ops-report-heading">
        <div class="ai-card-header">
          <span aria-hidden="true" style="font-size:1.5rem">📋</span>
          <h2 id="ops-report-heading" style="flex:1">AI Operational Intelligence Report</h2>
          <button class="btn-refresh" id="ops-close-report" aria-label="Close report">✕</button>
        </div>
        <div class="ai-response" id="ops-report-text" aria-live="polite" aria-label="AI operational report"></div>
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

    // Buttons
    document.getElementById('ops-report-btn')  ?.addEventListener('click', () => this._generateReport());
    document.getElementById('ops-close-report') ?.addEventListener('click', () => { document.getElementById('ops-full-report').style.display = 'none'; });
    document.getElementById('ops-gen-report')   ?.addEventListener('click', () => this._generateIncidentSummary());
    document.getElementById('ops-close-inc-ai') ?.addEventListener('click', () => { document.getElementById('ops-incident-ai').style.display = 'none'; });
    document.getElementById('ops-dispatch-btn') ?.addEventListener('click', () => this._generateDispatch());
    document.getElementById('ops-close-dispatch')?.addEventListener('click', () => { document.getElementById('ops-dispatch-ai').style.display = 'none'; });

    // Console
    document.getElementById('ops-send')?.addEventListener('click', () => this._consoleSend());
    document.getElementById('ops-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._consoleSend(); }
    });
    this.container.querySelector('#ops-panel-console .quick-actions')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-p]');
      if (btn) { const input = document.getElementById('ops-input'); if (input) { input.value = btn.dataset.p; this._consoleSend(); } }
    });
  }

  _switchTab(tab) {
    this._activeTab = tab;
    ['incidents','volunteers','predictive','console'].forEach(t => {
      const panel = document.getElementById(`ops-panel-${t}`);
      const tabBtn = document.getElementById(`ops-tab-${t}`);
      const active = t === tab;
      if (panel) panel.hidden = !active;
      if (tabBtn) { tabBtn.classList.toggle('active', active); tabBtn.setAttribute('aria-selected', String(active)); }
    });
  }

  _renderIncidents() {
    const list = document.getElementById('ops-incidents');
    if (!list) return;
    list.innerHTML = '';

    INCIDENTS.forEach(inc => {
      const sev = SEV_CONFIG[inc.severity] ?? SEV_CONFIG.normal;
      const item = document.createElement('div');
      item.className = 'incident-item';
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-label', `${inc.severity}: ${inc.type} — ${inc.description}, status: ${inc.status}`);

      const dot = document.createElement('div');
      dot.className = `incident-dot ${sev.dotCls}`;
      dot.setAttribute('aria-hidden', 'true');

      const body = document.createElement('div');
      body.style.flex = '1';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

      const idSpan = document.createElement('span');
      idSpan.style.cssText = 'font-size:0.7rem;font-family:monospace;color:var(--text-muted);';
      idSpan.textContent = inc.id;

      const typeSpan = document.createElement('strong');
      typeSpan.style.fontSize = '0.9rem';
      typeSpan.textContent = inc.type;

      const badge = document.createElement('span');
      badge.className = `status-badge ${sev.badge}`;
      badge.textContent = sev.badgeText;

      const statusBadge = document.createElement('span');
      statusBadge.className = `status-badge ${inc.status === 'Resolved' ? 'status-on-time' : inc.status === 'Responding' ? 'status-arriving' : 'status-delayed'}`;
      statusBadge.textContent = inc.status;

      header.append(idSpan, typeSpan, badge, statusBadge);

      const desc = document.createElement('p');
      desc.style.cssText = 'font-size:0.85rem;color:var(--text-secondary);margin-top:4px;';
      desc.textContent = inc.description;

      const meta = document.createElement('p');
      meta.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-top:4px;';
      meta.textContent = `📍 ${inc.zone} · ⏱ ${inc.time} · 👤 ${inc.assignee}`;

      body.append(header, desc, meta);
      item.append(dot, body);
      list.appendChild(item);
    });
  }

  _renderVolunteers() {
    const list = document.getElementById('ops-volunteers');
    if (!list) return;
    list.innerHTML = '';

    VOLUNTEER_ZONES.forEach(zone => {
      const row = document.createElement('div');
      row.className = 'status-row';
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-label', `${zone.zone}: ${zone.volunteers} of ${zone.required} volunteers, status: ${zone.status}`);
      row.style.gridTemplateColumns = '1fr auto auto';

      const nameDiv = document.createElement('div');
      const nameTxt = document.createElement('div');
      nameTxt.className = 'transport-name';
      nameTxt.textContent = zone.zone;

      const barDiv = document.createElement('div');
      barDiv.className = 'progress-bar';
      barDiv.style.width = '120px';
      barDiv.style.marginTop = '6px';
      const fill = document.createElement('div');
      const pct  = Math.round(zone.volunteers / zone.required * 100);
      fill.className = `progress-fill ${pct >= 100 ? 'progress-fill-green' : pct >= 60 ? '' : 'progress-fill-red'}`;
      fill.style.width = `${Math.min(100, pct)}%`;
      barDiv.appendChild(fill);
      nameDiv.append(nameTxt, barDiv);

      const countEl = document.createElement('div');
      countEl.style.cssText = 'font-family:Orbitron,sans-serif;font-size:0.9rem;font-weight:700;color:var(--color-gold);white-space:nowrap;';
      countEl.textContent = `${zone.volunteers}/${zone.required}`;

      const badge = document.createElement('span');
      badge.className = `status-badge ${zone.status === 'ok' ? 'status-on-time' : 'status-cancelled'}`;
      badge.textContent = zone.status === 'ok' ? '✅ Staffed' : '🔴 Understaffed';

      row.append(nameDiv, countEl, badge);
      list.appendChild(row);
    });
  }

  _renderPredictive() {
    const list = document.getElementById('ops-predictive');
    if (!list) return;
    list.innerHTML = '';

    PREDICTIVE_ALERTS.forEach(alert => {
      const sev = alert.risk === 'High' ? 'error' : 'warning';
      const item = document.createElement('div');
      item.className = `alert-item alert-${sev}`;
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-label', `${alert.time}: ${alert.event}, risk ${alert.risk}. Action: ${alert.action}`);

      const iconEl = document.createElement('span');
      iconEl.className = 'alert-icon';
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.textContent = alert.risk === 'High' ? '🔴' : '⚠️';

      const body = document.createElement('div');

      const riskBadge = document.createElement('span');
      riskBadge.className = `status-badge ${alert.risk === 'High' ? 'status-cancelled' : 'status-delayed'}`;
      riskBadge.textContent = `${alert.risk} Risk`;

      const timeEl = document.createElement('strong');
      timeEl.textContent = ` ${alert.time} — ${alert.event}`;

      const header = document.createElement('div');
      header.style.marginBottom = '4px';
      header.append(riskBadge, timeEl);

      const actionEl = document.createElement('p');
      actionEl.style.cssText = 'font-size:0.85rem;color:var(--text-secondary);';
      actionEl.textContent = `📋 Recommended Action: ${alert.action}`;

      body.append(header, actionEl);
      item.append(iconEl, body);
      list.appendChild(item);
    });
  }

  async _generateReport() {
    const card   = document.getElementById('ops-full-report');
    const textEl = document.getElementById('ops-report-text');
    if (!card || !textEl) return;

    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

    textEl.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'ai-loading';
    loading.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    const txt = document.createElement('p'); txt.textContent = 'Generating operational report...';
    loading.appendChild(txt); textEl.appendChild(loading);

    const criticals = INCIDENTS.filter(i => i.severity === 'critical' && i.status === 'Active');
    const understaffed = VOLUNTEER_ZONES.filter(z => z.status === 'understaffed').map(z => z.zone).join(', ');

    const prompt = [
      `Generate a comprehensive FIFA World Cup 2026 stadium operational intelligence report.`,
      ``,
      `**SITUATION:**`,
      `- Match: USA 🇺🇸 1–1 France 🇫🇷 (Minute 67)`,
      `- Attendance: 67,842 / 82,500 (82% capacity)`,
      `- Active incidents: ${criticals.length} critical, ${INCIDENTS.filter(i => i.severity === 'warning' && i.status !== 'Resolved').length} warnings`,
      `- Understaffed zones: ${understaffed}`,
      ``,
      `**ACTIVE INCIDENTS:**`,
      ...INCIDENTS.filter(i => i.status === 'Active').map(i => `- [${i.severity.toUpperCase()}] ${i.id}: ${i.description} (${i.zone})`),
      ``,
      `**PREDICTIVE RISKS:**`,
      ...PREDICTIVE_ALERTS.map(a => `- ${a.time}: ${a.event} (${a.risk} risk)`),
      ``,
      `Generate a structured report with:`,
      `1. **Executive Summary** (2-3 sentences)`,
      `2. **Immediate Priority Actions** (top 5, numbered)`,
      `3. **Staffing Recommendations** (specific redeployments needed)`,
      `4. **Risk Forecast** (next 60 minutes)`,
      `5. **Communication Actions** (fan announcements needed)`,
      ``,
      `Professional tone. Use clear operational language. Max 280 words.`,
    ].join('\n');

    try {
      const text = await geminiClient.generate(prompt, 'You are a senior FIFA stadium operations director. Your reports are concise, prioritised, and action-oriented.', false);
      textEl.innerHTML = '';
      const outEl = document.createElement('div');
      outEl.className = 'ai-text';
      textEl.appendChild(outEl);
      _typewrite(outEl, text, 8);
    } catch (err) {
      textEl.innerHTML = '';
      const msgEl = document.createElement('p');
      msgEl.style.color = 'var(--text-muted)';
      msgEl.textContent = err.message.includes('API key')
        ? '⚙️ Add your Gemini API key in Settings to generate reports.'
        : `⚠️ ${err.message}`;
      textEl.appendChild(msgEl);
    }
  }

  async _generateIncidentSummary() {
    const card   = document.getElementById('ops-incident-ai');
    const textEl = document.getElementById('ops-incident-text');
    if (!card || !textEl) return;
    card.style.display = 'block';
    textEl.innerHTML = '';
    const loading = document.createElement('div'); loading.className = 'ai-loading';
    loading.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div><p>Analysing incidents...</p>';
    textEl.appendChild(loading);

    const prompt = `Summarise these active incidents and provide response priorities:\n${INCIDENTS.map(i => `${i.id} [${i.severity}] ${i.type}: ${i.description} — Status: ${i.status}`).join('\n')}\n\nProvide: 1. Priority ranking 2. Resource requirements 3. Expected resolution times. Max 150 words.`;

    try {
      const text = await geminiClient.generate(prompt, '', false);
      textEl.innerHTML = '';
      const outEl = document.createElement('div'); outEl.className = 'ai-text'; textEl.appendChild(outEl);
      _typewrite(outEl, text, 10);
    } catch (err) {
      textEl.innerHTML = ''; const msgEl = document.createElement('p'); msgEl.style.color = 'var(--text-muted)';
      msgEl.textContent = err.message.includes('API key') ? '⚙️ Add API key in Settings.' : `⚠️ ${err.message}`;
      textEl.appendChild(msgEl);
    }
  }

  async _generateDispatch() {
    const card   = document.getElementById('ops-dispatch-ai');
    const textEl = document.getElementById('ops-dispatch-text');
    if (!card || !textEl) return;
    card.style.display = 'block';
    textEl.innerHTML = '';
    const loading = document.createElement('div'); loading.className = 'ai-loading';
    loading.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div><p>Generating dispatch plan...</p>';
    textEl.appendChild(loading);

    const prompt = `Generate volunteer reallocation recommendations for FIFA WC 2026 stadium:\n${VOLUNTEER_ZONES.map(z => `${z.zone}: ${z.volunteers}/${z.required} volunteers — ${z.status}`).join('\n')}\n\nProvide specific volunteer movement instructions, source zones, and reasoning. Max 180 words.`;

    try {
      const text = await geminiClient.generate(prompt, 'You are a stadium operations manager expert in event staffing.', false);
      textEl.innerHTML = '';
      const outEl = document.createElement('div'); outEl.className = 'ai-text'; textEl.appendChild(outEl);
      _typewrite(outEl, text, 10);
    } catch (err) {
      textEl.innerHTML = ''; const msgEl = document.createElement('p'); msgEl.style.color = 'var(--text-muted)';
      msgEl.textContent = err.message.includes('API key') ? '⚙️ Add API key in Settings.' : `⚠️ ${err.message}`;
      textEl.appendChild(msgEl);
    }
  }

  async _consoleSend() {
    const input = document.getElementById('ops-input');
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
    const sendBtn  = document.getElementById('ops-send');
    if (sendBtn) sendBtn.disabled = true;

    const sysExtra = [
      'You are an AI operations assistant for FIFA World Cup 2026 stadium command centre.',
      'Current situation: USA 1-1 France, Minute 67, MetLife Stadium at 82% capacity.',
      'Active critical: Gate E1 at 96% density. Lift C out of service.',
      'Your responses must be professional, concise, and operationally focused.',
      'Always prioritise safety in recommendations.',
    ].join(' ');

    try {
      const reply = await geminiClient.chat(this._messages, sysExtra);
      this._removeTyping(typingId);
      this._addMsg('assistant', reply);
      this._messages.push({ role: 'assistant', content: reply });
      if (this._messages.length > 30) this._messages.splice(0, 2);
    } catch (err) {
      this._removeTyping(typingId);
      this._addMsg('assistant', `⚠️ ${err.message}`);
    } finally {
      this._chatLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      input?.focus();
    }
  }

  _addMsg(role, text) {
    const list = document.getElementById('ops-messages');
    if (!list) return;
    const wrap = document.createElement('div'); wrap.className = `message message-${role}`;
    const bubble = document.createElement('div'); bubble.className = 'message-bubble'; bubble.textContent = text;
    const meta   = document.createElement('div'); meta.className = 'message-meta';
    const time   = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.textContent = role === 'user' ? `Ops Staff · ${time}` : `StadiumIQ AI · ${time}`;
    wrap.append(bubble, meta);
    list.appendChild(wrap);
    list.scrollTop = list.scrollHeight;
  }

  _addTyping() {
    const list = document.getElementById('ops-messages');
    if (!list) return null;
    const id  = `typing-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id; div.className = 'message message-assistant';
    div.innerHTML = '<div class="message-bubble"><div class="ai-loading"><div class="loading-dots"><span></span><span></span><span></span></div><span>Processing…</span></div></div>';
    list.appendChild(div); list.scrollTop = list.scrollHeight;
    return id;
  }

  _removeTyping(id) { if (id) document.getElementById(id)?.remove(); }

  destroy() {
    this._messages = [];
  }
}
