/**
 * @module dashboard
 * @description Match Day Dashboard — AI briefings, live metrics, Chart.js, alerts
 */

import { geminiClient } from './gemini.js';

const VENUES = {
  metlife  : 'MetLife Stadium, NJ (cap 82,500)',
  atandt   : 'AT&T Stadium, TX (cap 80,000)',
  sofi     : 'SoFi Stadium, CA (cap 70,240)',
  levis    : "Levi's Stadium, CA (cap 68,500)",
  gillette : 'Gillette Stadium, MA (cap 65,878)',
  lumen    : 'Lumen Field, WA (cap 72,000)',
  bcplace  : 'BC Place, Canada (cap 54,500)',
  azteca   : 'Estadio Azteca, Mexico (cap 87,523)',
};

const BASE_DATA = {
  attendance : { current: 67_842, capacity: 82_500 },
  gates      : ['N1', 'N2', 'N3', 'S1', 'S2', 'E1', 'E2', 'W1'],
  density    : [78, 82, 91, 65, 70, 96, 75, 80],
  temp       : 24,
  match      : { home: 'USA 🇺🇸', away: 'France 🇫🇷', score: '1-1', minute: 67 },
  alerts: [
    { severity: 'warning', msg: 'Gate E1 at 96% capacity — AI recommends redirecting fans to Gate E2', time: '2 min ago' },
    { severity: 'info',    msg: 'Sections 114–116 accessible seating at 85% — 18 requests queued',    time: '5 min ago' },
    { severity: 'success', msg: 'North transport hub operating normally — 4 min shuttle frequency',     time: '8 min ago' },
    { severity: 'warning', msg: 'Concourse C crowd density above threshold — deploy 3 stewards',       time: '11 min ago' },
  ],
};

export class DashboardModule {
  constructor(container, options) {
    this.container = container;
    this.options   = options;
    this._chart    = null;
    this._ticker   = null;
    this._data     = { ...BASE_DATA, attendance: { ...BASE_DATA.attendance }, density: [...BASE_DATA.density] };
  }

  async init() {
    this._renderShell();
    this._initChart();
    this._startTicker();
    await this._fetchBriefing();
  }

  _renderShell() {
    const venueName = VENUES[this.options.venue] ?? 'MetLife Stadium';
    const { match, attendance, temp } = this._data;
    const pct = Math.round(attendance.current / attendance.capacity * 100);

    const section = document.createElement('section');
    section.className = 'module-section';
    section.setAttribute('aria-labelledby', 'db-heading');

    section.innerHTML = `
      <div class="module-header">
        <h1 id="db-heading" tabindex="-1">📊 Match Day Dashboard</h1>
        <div class="live-score-badge" role="status"
          aria-label="Live: ${match.home} vs ${match.away}, score ${match.score}, minute ${match.minute}">
          <span class="score-teams">${match.home}</span>
          <span class="score-value">${match.score}</span>
          <span class="score-teams">${match.away}</span>
          <span class="score-minute" aria-hidden="true">${match.minute}'</span>
        </div>
      </div>

      <p class="body-sm" style="color:var(--text-muted)">📍 ${venueName}</p>

      <div class="metrics-grid" role="list" aria-label="Live stadium metrics">
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">👥</div>
          <div class="metric-value" id="db-attendance" aria-live="polite" aria-label="Attendance">${attendance.current.toLocaleString()}</div>
          <div class="metric-label">Attendance</div>
          <div class="metric-sub">${pct}% of capacity</div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">🌡️</div>
          <div class="metric-value">${temp}°C</div>
          <div class="metric-label">Temperature</div>
          <div class="metric-sub">⛅ Partly cloudy, UV 5</div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">⚡</div>
          <div class="metric-value" id="db-density" aria-live="polite">84%</div>
          <div class="metric-label">Avg Crowd Density</div>
          <div class="metric-sub">🔴 High — 1 hotspot active</div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">♿</div>
          <div class="metric-value">142</div>
          <div class="metric-label">Access Requests</div>
          <div class="metric-sub">18 pending assistance</div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">🌱</div>
          <div class="metric-value">73%</div>
          <div class="metric-label">Waste Diverted</div>
          <div class="metric-sub">↑ 8% vs last match</div>
        </div>
        <div class="metric-card" role="listitem">
          <div class="metric-icon" aria-hidden="true">🚌</div>
          <div class="metric-value">94%</div>
          <div class="metric-label">Transport On-Time</div>
          <div class="metric-sub">Metro & Shuttle</div>
        </div>
      </div>

      <div class="ai-card">
        <div class="ai-card-header">
          <span aria-hidden="true" style="font-size:1.5rem">🤖</span>
          <h2 style="flex:1">AI Match Day Briefing</h2>
          <button class="btn-refresh" id="db-refresh" aria-label="Refresh AI briefing" title="Refresh">↻</button>
        </div>
        <div class="ai-response" id="db-briefing" aria-live="polite" aria-label="AI generated match day briefing"></div>
      </div>

      <div class="chart-card">
        <h2>🚪 Gate Activity Levels</h2>
        <div class="chart-wrapper">
          <canvas id="db-chart"
            role="img"
            aria-label="Bar chart showing crowd density at each gate. Gate E1 is at 96% — critical level."
          ></canvas>
        </div>
      </div>

      <div class="alerts-section" aria-labelledby="db-alerts-heading">
        <h2 id="db-alerts-heading">🔔 Live Operational Alerts</h2>
        <ul class="alert-list" role="list" id="db-alerts" aria-label="Current operational alerts"></ul>
      </div>
    `;

    this.container.appendChild(section);
    this._renderAlerts();
    document.getElementById('db-refresh')?.addEventListener('click', () => this._fetchBriefing());
  }

  _renderAlerts() {
    const list = document.getElementById('db-alerts');
    if (!list) return;
    list.innerHTML = '';
    const icons = { warning: '⚠️', info: 'ℹ️', success: '✅', error: '❌' };

    this._data.alerts.forEach(alert => {
      const li = document.createElement('li');
      li.className = `alert-item alert-${alert.severity}`;
      li.setAttribute('role', 'listitem');

      const iconEl = document.createElement('span');
      iconEl.className = 'alert-icon';
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.textContent = icons[alert.severity] ?? 'ℹ️';

      const body   = document.createElement('div');
      const msgEl  = document.createElement('p');
      msgEl.className = 'alert-message';
      msgEl.textContent = alert.msg; // textContent — no XSS risk

      const timeEl = document.createElement('time');
      timeEl.className = 'alert-time';
      timeEl.textContent = alert.time;

      body.append(msgEl, timeEl);
      li.append(iconEl, body);
      list.appendChild(li);
    });
  }

  _initChart() {
    const canvas = document.getElementById('db-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    this._chart = new Chart(canvas, {
      type : 'bar',
      data : {
        labels   : this._data.gates,
        datasets : [{
          label           : 'Density %',
          data            : [...this._data.density],
          backgroundColor : this._data.density.map(v =>
            v >= 90 ? 'rgba(239,68,68,0.85)' :
            v >= 75 ? 'rgba(251,146,60,0.85)' :
                      'rgba(16,185,129,0.85)'
          ),
          borderRadius  : 8,
          borderSkipped : false,
          borderWidth   : 0,
        }],
      },
      options : {
        responsive          : true,
        maintainAspectRatio : false,
        animation           : { duration: 1000, easing: 'easeOutQuart' },
        plugins : {
          legend  : { display: false },
          tooltip : {
            callbacks : {
              label : ctx => `${ctx.raw}% — ${ctx.raw >= 90 ? '🔴 Critical' : ctx.raw >= 75 ? '🟡 High' : '🟢 Normal'}`,
            },
          },
        },
        scales : {
          y : {
            beginAtZero : true, max: 100,
            ticks       : { callback: v => v + '%', color: 'var(--text-secondary)', font: { family: 'Inter' } },
            grid        : { color: 'var(--border-color)' },
          },
          x : {
            ticks : { color: 'var(--text-secondary)', font: { family: 'Inter', weight: '600' } },
            grid  : { display: false },
          },
        },
      },
    });
  }

  _startTicker() {
    this._ticker = setInterval(() => {
      const delta = Math.floor(Math.random() * 15) - 5;
      this._data.attendance.current = Math.min(
        this._data.attendance.capacity,
        Math.max(60_000, this._data.attendance.current + delta)
      );
      const el = document.getElementById('db-attendance');
      if (el) el.textContent = this._data.attendance.current.toLocaleString();

      // Update one random gate
      if (this._chart) {
        const idx    = Math.floor(Math.random() * this._data.density.length);
        const newVal = Math.round(Math.min(100, Math.max(40, this._data.density[idx] + (Math.random() > 0.5 ? 2 : -2))));
        this._data.density[idx] = newVal;
        this._chart.data.datasets[0].data[idx] = newVal;
        this._chart.data.datasets[0].backgroundColor[idx] =
          newVal >= 90 ? 'rgba(239,68,68,0.85)' :
          newVal >= 75 ? 'rgba(251,146,60,0.85)' :
                         'rgba(16,185,129,0.85)';
        this._chart.update('none');
      }
    }, 4_000);
  }

  async _fetchBriefing() {
    const el = document.getElementById('db-briefing');
    if (!el) return;

    el.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'ai-loading';
    loading.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    const txt = document.createElement('p');
    txt.textContent = 'Generating AI briefing...';
    loading.appendChild(txt);
    el.appendChild(loading);

    const { match, attendance } = this._data;
    const venueName = VENUES[this.options.venue] ?? 'MetLife Stadium';
    const hotspot   = this._data.alerts.find(a => a.severity === 'warning');

    const prompt = [
      `Generate a concise FIFA World Cup 2026 match-day operations briefing for stadium command staff.`,
      `Venue: ${venueName}`,
      `Match: ${match.home} vs ${match.away} | Score: ${match.score} | Minute: ${match.minute}`,
      `Attendance: ${attendance.current.toLocaleString()} / ${attendance.capacity.toLocaleString()} (${Math.round(attendance.current/attendance.capacity*100)}%)`,
      hotspot ? `Active alert: ${hotspot.msg}` : '',
      `Temperature: ${this._data.temp}°C, partly cloudy.`,
      ``,
      `Provide exactly 3 sections:`,
      `1. **Top 3 Priority Actions (next 30 min)** — concrete, numbered steps`,
      `2. **Safety Concerns** — crowd safety risks or environmental hazards`,
      `3. **Fan Experience Notes** — one positive observation and one improvement`,
      ``,
      `Be concise (max 200 words total). Use bullet points within each section.`,
    ].filter(Boolean).join('\n');

    try {
      const response = await geminiClient.generate(prompt, '', false);
      el.innerHTML = '';
      const textEl = document.createElement('div');
      textEl.className = 'ai-text';
      el.appendChild(textEl);
      _typewrite(textEl, response, 12);
    } catch (err) {
      el.innerHTML = '';
      const msgEl = document.createElement('p');
      msgEl.style.color = 'var(--text-muted)';
      msgEl.textContent = err.message.includes('API key')
        ? '⚙️ Enter your Gemini API key in Settings (⚙️) to see live AI briefings.'
        : `⚠️ ${err.message}`;
      el.appendChild(msgEl);
    }
  }

  destroy() {
    clearInterval(this._ticker);
    this._chart?.destroy();
    this._chart  = null;
    this._ticker = null;
  }
}

/**
 * Typewriter animation for AI responses.
 * Uses textContent exclusively — never innerHTML from API data.
 * @param {HTMLElement} element
 * @param {string} text
 * @param {number} [speed=12]
 */
export function _typewrite(element, text, speed = 12) {
  if (!element || typeof text !== 'string') return;
  element.textContent = '';
  element.classList.add('cursor-blink');
  let i = 0;
  const interval = setInterval(() => {
    if (i < text.length) {
      element.textContent += text[i++];
    } else {
      clearInterval(interval);
      element.classList.remove('cursor-blink');
    }
  }, speed);
}
