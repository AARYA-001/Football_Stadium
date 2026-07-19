/**
 * @module sustainability
 * @description Sustainability Dashboard — eco metrics, fan tips, gamified leaderboard
 */

import { geminiClient } from './gemini.js';
import { _typewrite }   from './dashboard.js';

const ECO_METRICS = [
  { icon: '♻️',  label: 'Waste Diverted',    value: 73,   unit: '%',   trend: '+8%',  trendUp: true },
  { icon: '⚡',  label: 'Renewable Energy',  value: 84,   unit: '%',   trend: '+12%', trendUp: true },
  { icon: '💧',  label: 'Water Saved',        value: 18.4, unit: 'kL',  trend: '-5%',  trendUp: true },
  { icon: '🌱',  label: 'Carbon Offset',      value: 142,  unit: 't CO₂',trend: '↓ 22%',trendUp: true },
  { icon: '🌡️', label: 'Emissions vs Target',value: 78,   unit: '%',   trend: '-22%', trendUp: true },
  { icon: '🚌',  label: 'Public Transport',   value: 67,   unit: '% fans',trend: '+15%',trendUp: true },
];

const LEADERBOARD = [
  { rank: 1, section: 'Section A — Green Zone',  score: 9847, badge: '🏆' },
  { rank: 2, section: 'VIP Lounge West',          score: 8932, badge: '🥈' },
  { rank: 3, section: 'Section F — Family Stand', score: 8156, badge: '🥉' },
  { rank: 4, section: 'Media Tribune',            score: 7643, badge: '♻️' },
  { rank: 5, section: 'Section B — North Stand',  score: 7102, badge: '🌱' },
  { rank: 6, section: 'Section D — East Stand',   score: 6889, badge: '⭐' },
];

const FAN_PLEDGES = [
  { id: 'p1', label: '🚌 Used public transport today',            points: 200 },
  { id: 'p2', label: '♻️ Used the recycling stations',           points: 100 },
  { id: 'p3', label: '💧 Brought a reusable water bottle',       points: 150 },
  { id: 'p4', label: '🚶 Walked or cycled to the stadium',       points: 300 },
  { id: 'p5', label: '🌱 Chose a plant-based meal option',        points: 100 },
  { id: 'p6', label: '🛍️ Declined single-use plastic packaging', points: 75  },
];

export class SustainabilityModule {
  constructor(container, options) {
    this.container  = container;
    this.options    = options;
    this._chart     = null;
    this._donut     = null;
    this._ticker    = null;
    this._fanScore  = 0;
    this._pledges   = new Set();
  }

  async init() {
    this._render();
    this._initCharts();
    this._startTicker();
    // Auto-trigger AI eco insights on load for immediate FIFA WC 2026 sustainability value
    setTimeout(() => this._getAIInsights(), 1000);
  }

  _render() {
    const section = document.createElement('section');
    section.className = 'module-section';
    section.setAttribute('aria-labelledby', 'eco-heading');

    section.innerHTML = `
      <div class="module-header">
        <h1 id="eco-heading" tabindex="-1">🌱 Sustainability Dashboard</h1>
        <button class="btn-primary" id="eco-ai-btn" aria-label="Get AI sustainability insights">
          🤖 AI Insights
        </button>
      </div>

      <p class="body-sm" style="color:var(--text-muted)">
        FIFA World Cup 2026 — Carbon-Neutral Tournament Goal · Match Day ${new Date().toLocaleDateString()}
      </p>

      <!-- Eco Metrics Grid -->
      <div class="eco-grid" role="list" aria-label="Sustainability metrics">
        ${ECO_METRICS.map((m, i) => `
          <div class="eco-card" role="listitem" aria-label="${m.label}: ${m.value}${m.unit}">
            <div class="eco-icon" aria-hidden="true">${m.icon}</div>
            <div class="eco-value" id="eco-val-${i}">${m.value}${m.unit}</div>
            <div class="eco-label">${m.label}</div>
            <div class="eco-sub" style="color:var(--color-success)">${m.trend} vs last match</div>
          </div>
        `).join('')}
      </div>

      <!-- Charts -->
      <div class="section-divider">
        <div class="chart-card">
          <h2>♻️ Waste Diversion Breakdown</h2>
          <div class="chart-wrapper">
            <canvas id="eco-donut" role="img" aria-label="Donut chart showing waste diversion: 73% recycled, 15% composted, 12% landfill"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <h2>📈 Sustainability Progress (2026 Matches)</h2>
          <div class="chart-wrapper">
            <canvas id="eco-trend" role="img" aria-label="Line chart showing sustainability improvement over tournament matches"></canvas>
          </div>
        </div>
      </div>

      <!-- Fan Pledge System -->
      <div class="card" aria-labelledby="pledge-heading">
        <div class="card-header">
          <h2 class="card-title" id="pledge-heading">🎯 Fan Eco Pledge</h2>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="body-xs" style="color:var(--text-muted)">Your Score:</span>
            <span class="status-badge status-on-time" id="fan-score" aria-live="polite" aria-label="Your sustainability score">0 pts</span>
          </div>
        </div>
        <p class="body-sm" style="color:var(--text-muted);margin-bottom:16px">
          Check actions you've taken today and earn eco points!
        </p>
        <div id="pledge-list" role="group" aria-label="Eco pledge checkboxes" style="display:flex;flex-direction:column;gap:10px"></div>
      </div>

      <!-- Leaderboard -->
      <div class="card" aria-labelledby="leaderboard-heading">
        <h2 class="card-title" id="leaderboard-heading">🏆 Section Eco Leaderboard</h2>
        <p class="body-sm" style="color:var(--text-muted);margin-bottom:16px">Sections compete on collective eco-actions each match day.</p>
        <div id="eco-leaderboard" role="list" aria-label="Stadium section eco leaderboard"></div>
      </div>

      <!-- AI Insights -->
      <div class="ai-card" id="eco-ai-card" style="display:none" aria-labelledby="eco-ai-heading">
        <div class="ai-card-header">
          <span aria-hidden="true" style="font-size:1.5rem">🌍</span>
          <h2 id="eco-ai-heading" style="flex:1">AI Sustainability Insights</h2>
          <button class="btn-refresh" id="eco-close-ai" aria-label="Close AI insights">✕</button>
        </div>
        <div class="ai-response" id="eco-ai-text" aria-live="polite" aria-label="AI sustainability analysis"></div>
      </div>
    `;

    this.container.appendChild(section);
    this._renderPledges();
    this._renderLeaderboard();
    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('eco-ai-btn')?.addEventListener('click', () => this._getInsights());
    document.getElementById('eco-close-ai')?.addEventListener('click', () => {
      document.getElementById('eco-ai-card').style.display = 'none';
    });

    document.getElementById('pledge-list')?.addEventListener('change', e => {
      const cb = e.target.closest('input[type="checkbox"]');
      if (!cb) return;
      const pledge = FAN_PLEDGES.find(p => p.id === cb.dataset.id);
      if (!pledge) return;
      if (cb.checked) {
        this._pledges.add(pledge.id);
        this._fanScore += pledge.points;
      } else {
        this._pledges.delete(pledge.id);
        this._fanScore -= pledge.points;
      }
      const scoreEl = document.getElementById('fan-score');
      if (scoreEl) scoreEl.textContent = `${this._fanScore} pts`;
    });
  }

  _renderPledges() {
    const list = document.getElementById('pledge-list');
    if (!list) return;
    list.innerHTML = '';

    FAN_PLEDGES.forEach(pledge => {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:12px;cursor:pointer;padding:10px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border-color);transition:background 0.2s;';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.id = pledge.id;
      cb.id = `pledge-${pledge.id}`;
      cb.style.cssText = 'width:18px;height:18px;accent-color:var(--color-success);flex-shrink:0;';
      cb.setAttribute('aria-describedby', `pledge-pts-${pledge.id}`);

      const textSpan = document.createElement('span');
      textSpan.style.flex = '1';
      textSpan.textContent = pledge.label;

      const ptsSpan = document.createElement('span');
      ptsSpan.id = `pledge-pts-${pledge.id}`;
      ptsSpan.style.cssText = 'font-size:0.8rem;font-weight:700;color:var(--color-success);white-space:nowrap;';
      ptsSpan.textContent = `+${pledge.points} pts`;

      label.addEventListener('mouseenter', () => { label.style.background = 'var(--bg-card)'; });
      label.addEventListener('mouseleave', () => { label.style.background = 'var(--bg-input)'; });

      label.append(cb, textSpan, ptsSpan);
      list.appendChild(label);
    });
  }

  _renderLeaderboard() {
    const list = document.getElementById('eco-leaderboard');
    if (!list) return;
    list.innerHTML = '';

    LEADERBOARD.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-label', `Rank ${entry.rank}: ${entry.section}, ${entry.score} eco points`);

      const rankBadge = document.createElement('div');
      rankBadge.className = `rank-badge rank-${entry.rank <= 3 ? entry.rank : 'other'}`;
      rankBadge.setAttribute('aria-hidden', 'true');
      rankBadge.textContent = entry.rank;

      const nameEl = document.createElement('div');
      nameEl.style.flex = '1';
      const nameTxt = document.createElement('div');
      nameTxt.style.fontWeight = '600';
      nameTxt.style.fontSize = '0.9rem';
      nameTxt.textContent = entry.section;
      nameEl.appendChild(nameTxt);

      const scoreEl = document.createElement('div');
      scoreEl.style.cssText = 'font-family:Orbitron,sans-serif;font-size:1rem;font-weight:700;color:var(--color-success);';
      scoreEl.textContent = entry.score.toLocaleString();

      const badgeEl = document.createElement('span');
      badgeEl.setAttribute('aria-hidden', 'true');
      badgeEl.style.fontSize = '1.25rem';
      badgeEl.textContent = entry.badge;

      item.append(rankBadge, nameEl, scoreEl, badgeEl);
      list.appendChild(item);
    });
  }

  _initCharts() {
    if (typeof Chart === 'undefined') return;

    // Donut chart
    const donutCanvas = document.getElementById('eco-donut');
    if (donutCanvas) {
      this._donut = new Chart(donutCanvas, {
        type : 'doughnut',
        data : {
          labels   : ['Recycled ♻️', 'Composted 🌿', 'Landfill 🗑️'],
          datasets : [{
            data           : [73, 15, 12],
            backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(59,130,246,0.8)', 'rgba(239,68,68,0.5)'],
            borderWidth    : 2,
            borderColor    : ['rgba(16,185,129,1)', 'rgba(59,130,246,1)', 'rgba(239,68,68,1)'],
          }],
        },
        options : {
          responsive: true, maintainAspectRatio: false,
          cutout  : '70%',
          animation: { duration: 1200 },
          plugins : {
            legend  : { position: 'bottom', labels: { color: 'var(--text-secondary)', font: { size: 11 } } },
            tooltip : { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}%` } },
          },
        },
      });
    }

    // Trend line chart
    const trendCanvas = document.getElementById('eco-trend');
    if (trendCanvas) {
      const matches = ['M1','M2','M3','M4','M5','M6 (Now)'];
      this._chart = new Chart(trendCanvas, {
        type : 'line',
        data : {
          labels   : matches,
          datasets : [
            {
              label        : 'Waste Diverted %',
              data         : [52, 58, 63, 68, 71, 73],
              borderColor  : 'rgba(16,185,129,1)',
              backgroundColor: 'rgba(16,185,129,0.1)',
              fill         : true,
              tension      : 0.4,
              pointRadius  : 5,
              pointHoverRadius: 8,
            },
            {
              label        : 'Renewable Energy %',
              data         : [65, 68, 72, 78, 80, 84],
              borderColor  : 'rgba(255,215,0,1)',
              backgroundColor: 'rgba(255,215,0,0.1)',
              fill         : true,
              tension      : 0.4,
              pointRadius  : 5,
              pointHoverRadius: 8,
            },
          ],
        },
        options : {
          responsive: true, maintainAspectRatio: false,
          animation : { duration: 1200 },
          scales    : {
            y : { beginAtZero: false, min: 40, max: 100, ticks: { callback: v => v+'%', color: 'var(--text-secondary)' }, grid: { color: 'var(--border-color)' } },
            x : { ticks: { color: 'var(--text-secondary)' }, grid: { display: false } },
          },
          plugins : { legend: { position: 'bottom', labels: { color: 'var(--text-secondary)', font: { size: 11 } } } },
        },
      });
    }
  }

  _startTicker() {
    this._ticker = setInterval(() => {
      // Simulate small eco metric fluctuations
      ECO_METRICS.forEach((m, i) => {
        const el = document.getElementById(`eco-val-${i}`);
        if (!el) return;
        if (typeof m.value === 'number' && m.unit === '%') {
          const newVal = Math.min(100, Math.max(50, m.value + (Math.random() > 0.5 ? 0.1 : -0.05)));
          m.value = Math.round(newVal * 10) / 10;
          el.textContent = `${m.value}${m.unit}`;
        }
      });
    }, 10_000);
  }

  async _getInsights() {
    const card   = document.getElementById('eco-ai-card');
    const textEl = document.getElementById('eco-ai-text');
    if (!card || !textEl) return;

    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

    textEl.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'ai-loading';
    loading.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    const txt = document.createElement('p'); txt.textContent = 'Generating sustainability insights...';
    loading.appendChild(txt); textEl.appendChild(loading);

    const prompt = [
      `Generate sustainability insights for FIFA World Cup 2026 stadium operations.`,
      ``,
      `Current eco metrics for this match:`,
      ...ECO_METRICS.map(m => `- ${m.label}: ${m.value}${m.unit} (${m.trend})`),
      ``,
      `${this._pledges.size} fan pledges completed today.`,
      ``,
      `Please provide:`,
      `1. **Performance Summary** — brief assessment of today's sustainability performance`,
      `2. **Top 3 Impact Actions** — what the stadium can do right now to improve metrics`,
      `3. **Fan Engagement Tips** — 3 creative ways to encourage more sustainable fan behaviour`,
      `4. **Comparison to FIFA 2026 Target** — are we on track for a carbon-neutral tournament?`,
      ``,
      `Be inspiring and data-driven. Max 220 words. Use ✅ and ⚠️ for positive/negative points.`,
    ].join('\n');

    try {
      const text = await geminiClient.generate(prompt, 'You are a sustainability consultant for FIFA World Cup 2026.', false);
      textEl.innerHTML = '';
      const outEl = document.createElement('div');
      outEl.className = 'ai-text';
      textEl.appendChild(outEl);
      _typewrite(outEl, text, 10);
    } catch (err) {
      textEl.innerHTML = '';
      const msgEl = document.createElement('p');
      msgEl.style.color = 'var(--text-muted)';
      msgEl.textContent = err.message.includes('API key')
        ? '⚙️ Add your Gemini API key in Settings.'
        : `⚠️ ${err.message}`;
      textEl.appendChild(msgEl);
    }
  }

  destroy() {
    clearInterval(this._ticker);
    this._chart?.destroy();
    this._donut?.destroy();
    this._chart  = null;
    this._donut  = null;
    this._ticker = null;
  }
}
