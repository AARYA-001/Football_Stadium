/**
 * @module crowd
 * @description Crowd Intelligence — real-time density heatmap, flow predictions, AI analysis
 */

import { geminiClient } from './gemini.js';
import { _typewrite }   from './dashboard.js';

/* Simulated section density data (0–100) */
const SECTIONS = [
  { id: 'A', name: 'Section A (NW)', density: 72 },
  { id: 'B', name: 'Section B (N)',  density: 88 },
  { id: 'C', name: 'Section C (NE)', density: 65 },
  { id: 'D', name: 'Section D (E)',  density: 97 }, // critical
  { id: 'E', name: 'Section E (SE)', density: 81 },
  { id: 'F', name: 'Section F (S)',  density: 74 },
  { id: 'G', name: 'Section G (SW)', density: 58 },
  { id: 'H', name: 'Section H (W)',  density: 83 },
  { id: 'VIP', name: 'VIP/Press Box', density: 91 },
  { id: 'ACC', name: 'Accessible Zone', density: 69 },
];

const FLOW_PREDICTIONS = [
  { time: '75\'', event: 'Half-time wave', direction: '→ South exits', severity: 'warning' },
  { time: '85\'', event: 'Early departures begin', direction: '→ All exits +15%', severity: 'info' },
  { time: '90\'', event: 'Full-time rush', direction: '→ North & East exits', severity: 'error' },
  { time: '+15m', event: 'Post-match peak', direction: '→ Transport hubs', severity: 'warning' },
];

export class CrowdModule {
  constructor(container, options) {
    this.container  = container;
    this.options    = options;
    this._chart     = null;
    this._polarChart= null;
    this._ticker    = null;
    this._sections  = SECTIONS.map(s => ({ ...s })); // mutable copy
    this._isAnalysing = false;
  }

  async init() {
    this._render();
    this._initBarChart();
    this._initPolarChart();
    this._startTicker();
    // Auto-trigger AI analysis on load for immediate FIFA WC 2026 operational value
    setTimeout(() => this._runAnalysis(), 800);
  }

  _render() {
    const section = document.createElement('section');
    section.className = 'module-section';
    section.setAttribute('aria-labelledby', 'crowd-heading');

    section.innerHTML = `
      <div class="module-header">
        <h1 id="crowd-heading" tabindex="-1">👥 Crowd Intelligence</h1>
        <button class="btn-primary" id="crowd-analyse" aria-label="Generate AI crowd analysis">
          🤖 AI Analysis
        </button>
      </div>

      <!-- Section density heatmap (visual table) -->
      <div class="card" aria-labelledby="density-heading">
        <div class="card-header">
          <h2 class="card-title" id="density-heading">📊 Section Density Heatmap</h2>
          <span class="body-xs" style="color:var(--text-muted)" aria-live="polite" id="crowd-last-update">Live</span>
        </div>
        <div id="crowd-heatmap" class="crowd-heatmap" role="list" aria-label="Stadium section crowd densities"></div>
      </div>

      <div class="section-divider">
        <!-- Bar chart -->
        <div class="chart-card">
          <h2>📈 Density by Section</h2>
          <div class="chart-wrapper">
            <canvas id="crowd-bar" role="img" aria-label="Bar chart showing crowd density by stadium section"></canvas>
          </div>
        </div>

        <!-- Polar chart -->
        <div class="chart-card">
          <h2>🧭 Distribution Overview</h2>
          <div class="chart-wrapper">
            <canvas id="crowd-polar" role="img" aria-label="Polar chart showing crowd distribution around stadium"></canvas>
          </div>
        </div>
      </div>

      <!-- Flow Predictions -->
      <div class="card" aria-labelledby="flow-heading">
        <h2 class="card-title" id="flow-heading">🌊 Predicted Crowd Flow Events</h2>
        <ul role="list" style="margin-top:12px" aria-label="Upcoming crowd flow predictions" id="crowd-flow-list"></ul>
      </div>

      <!-- AI Analysis output -->
      <div class="ai-card" id="crowd-ai-card" style="display:none" aria-labelledby="crowd-ai-heading">
        <div class="ai-card-header">
          <span aria-hidden="true" style="font-size:1.5rem">🤖</span>
          <h2 id="crowd-ai-heading" style="flex:1">AI Crowd Intelligence Report</h2>
          <button class="btn-refresh" id="crowd-close-ai" aria-label="Close AI analysis">✕</button>
        </div>
        <div class="ai-response" id="crowd-ai-response" aria-live="polite" aria-label="AI crowd analysis"></div>
      </div>
    `;

    this.container.appendChild(section);
    this._renderHeatmap();
    this._renderFlowList();

    document.getElementById('crowd-analyse')?.addEventListener('click', () => this._runAnalysis());
    document.getElementById('crowd-close-ai')?.addEventListener('click', () => {
      document.getElementById('crowd-ai-card').style.display = 'none';
    });
  }

  _renderHeatmap() {
    const container = document.getElementById('crowd-heatmap');
    if (!container) return;
    container.innerHTML = '';

    // Inject heatmap CSS if not already there
    if (!document.getElementById('crowd-heatmap-style')) {
      const style = document.createElement('style');
      style.id = 'crowd-heatmap-style';
      style.textContent = `
        .crowd-heatmap { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; }
        .heatmap-cell { padding:12px; border-radius:10px; display:flex; flex-direction:column; gap:4px; cursor:default; transition:transform 0.2s; }
        .heatmap-cell:hover { transform:scale(1.03); }
        .heatmap-cell-name { font-size:0.8rem; font-weight:600; }
        .heatmap-cell-val  { font-family:'Orbitron',sans-serif; font-size:1.2rem; font-weight:700; }
        .heatmap-cell-bar  { height:4px; border-radius:4px; margin-top:4px; transition:width 1s ease; }
      `;
      document.head.appendChild(style);
    }

    this._sections.forEach(sec => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.setAttribute('role', 'listitem');
      cell.setAttribute('aria-label', `${sec.name}: ${sec.density}% density`);

      const bg = sec.density >= 90 ? 'rgba(239,68,68,0.15)' :
                 sec.density >= 75 ? 'rgba(251,146,60,0.15)' :
                                     'rgba(16,185,129,0.1)';
      const color = sec.density >= 90 ? 'var(--color-error)' :
                    sec.density >= 75 ? 'var(--color-warning)' :
                                        'var(--color-success)';
      cell.style.background = bg;
      cell.style.border = `1px solid ${color}30`;
      cell.id = `cell-${sec.id}`;

      cell.innerHTML = `
        <div class="heatmap-cell-name">${sec.name}</div>
        <div class="heatmap-cell-val" style="color:${color}">${sec.density}%</div>
        <div class="heatmap-cell-bar" style="background:${color};width:${sec.density}%"></div>
      `;
      container.appendChild(cell);
    });
  }

  _renderFlowList() {
    const list = document.getElementById('crowd-flow-list');
    if (!list) return;
    list.innerHTML = '';
    const icons = { warning: '⚠️', error: '🔴', info: 'ℹ️', success: '✅' };

    FLOW_PREDICTIONS.forEach(pred => {
      const li = document.createElement('li');
      li.className = `alert-item alert-${pred.severity}`;
      li.setAttribute('role', 'listitem');
      li.setAttribute('aria-label', `At ${pred.time}: ${pred.event}, ${pred.direction}`);

      const iconEl = document.createElement('span');
      iconEl.className = 'alert-icon';
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.textContent = icons[pred.severity] ?? 'ℹ️';

      const body = document.createElement('div');

      const eventEl = document.createElement('strong');
      eventEl.textContent = `${pred.time} — ${pred.event}`;

      const dirEl = document.createElement('p');
      dirEl.className = 'alert-time';
      dirEl.style.marginTop = '2px';
      dirEl.textContent = pred.direction;

      body.append(eventEl, dirEl);
      li.append(iconEl, body);
      list.appendChild(li);
    });
  }

  _initBarChart() {
    const canvas = document.getElementById('crowd-bar');
    if (!canvas || typeof Chart === 'undefined') return;

    this._chart = new Chart(canvas, {
      type : 'bar',
      data : {
        labels   : this._sections.map(s => s.id),
        datasets : [{
          label           : 'Density %',
          data            : this._sections.map(s => s.density),
          backgroundColor : this._sections.map(s =>
            s.density >= 90 ? 'rgba(239,68,68,0.85)' :
            s.density >= 75 ? 'rgba(251,146,60,0.85)' :
                              'rgba(16,185,129,0.85)'
          ),
          borderRadius  : 6,
          borderSkipped : false,
          borderWidth   : 0,
        }],
      },
      options : {
        responsive: true, maintainAspectRatio: false,
        animation : { duration: 800 },
        plugins   : { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw}%` } } },
        scales    : {
          y : { beginAtZero: true, max: 100, ticks: { callback: v => v+'%', color: 'var(--text-secondary)' }, grid: { color: 'var(--border-color)' } },
          x : { ticks: { color: 'var(--text-secondary)', font: { weight: '600' } }, grid: { display: false } },
        },
      },
    });
  }

  _initPolarChart() {
    const canvas = document.getElementById('crowd-polar');
    if (!canvas || typeof Chart === 'undefined') return;

    this._polarChart = new Chart(canvas, {
      type : 'polarArea',
      data : {
        labels  : this._sections.map(s => s.id),
        datasets: [{
          data           : this._sections.map(s => s.density),
          backgroundColor: this._sections.map(s =>
            s.density >= 90 ? 'rgba(239,68,68,0.6)' :
            s.density >= 75 ? 'rgba(251,146,60,0.6)' :
                              'rgba(16,185,129,0.6)'
          ),
          borderWidth: 1,
          borderColor: this._sections.map(s =>
            s.density >= 90 ? 'rgba(239,68,68,1)' :
            s.density >= 75 ? 'rgba(251,146,60,1)' :
                              'rgba(16,185,129,1)'
          ),
        }],
      },
      options : {
        responsive: true, maintainAspectRatio: false,
        animation : { duration: 1200 },
        scales    : { r: { ticks: { color: 'var(--text-secondary)', backdropColor: 'transparent' }, grid: { color: 'var(--border-color)' } } },
        plugins   : { legend: { position: 'bottom', labels: { color: 'var(--text-secondary)', font: { size: 11 } } } },
      },
    });
  }

  _startTicker() {
    this._ticker = setInterval(() => {
      this._sections.forEach((sec, idx) => {
        const delta = Math.random() > 0.5 ? 2 : -2;
        sec.density = Math.round(Math.min(100, Math.max(30, sec.density + delta)));

        // Update heatmap cell
        const cell = document.getElementById(`cell-${sec.id}`);
        if (cell) {
          const color = sec.density >= 90 ? 'var(--color-error)' :
                        sec.density >= 75 ? 'var(--color-warning)' :
                                            'var(--color-success)';
          const valEl = cell.querySelector('.heatmap-cell-val');
          const barEl = cell.querySelector('.heatmap-cell-bar');
          if (valEl) { valEl.textContent = sec.density + '%'; valEl.style.color = color; }
          if (barEl) { barEl.style.width = sec.density + '%'; barEl.style.background = color; }
          cell.setAttribute('aria-label', `${sec.name}: ${sec.density}% density`);
        }
      });

      // Update charts without full re-render
      if (this._chart) {
        this._chart.data.datasets[0].data = this._sections.map(s => s.density);
        this._chart.data.datasets[0].backgroundColor = this._sections.map(s =>
          s.density >= 90 ? 'rgba(239,68,68,0.85)' :
          s.density >= 75 ? 'rgba(251,146,60,0.85)' :
                            'rgba(16,185,129,0.85)'
        );
        this._chart.update('none');
      }
      if (this._polarChart) {
        this._polarChart.data.datasets[0].data = this._sections.map(s => s.density);
        this._polarChart.update('none');
      }

      const lastUpdate = document.getElementById('crowd-last-update');
      if (lastUpdate) lastUpdate.textContent = `Updated ${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })}`;
    }, 5_000);
  }

  async _runAnalysis() {
    if (this._isAnalysing) return;
    this._isAnalysing = true;

    const card     = document.getElementById('crowd-ai-card');
    const response = document.getElementById('crowd-ai-response');
    if (!card || !response) { this._isAnalysing = false; return; }

    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

    response.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'ai-loading';
    loading.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    const txt = document.createElement('p');
    txt.textContent = 'Analysing crowd data...';
    loading.appendChild(txt);
    response.appendChild(loading);

    const critical = this._sections.filter(s => s.density >= 90).map(s => `${s.name} (${s.density}%)`).join(', ') || 'None';
    const high     = this._sections.filter(s => s.density >= 75 && s.density < 90).map(s => `${s.name} (${s.density}%)`).join(', ') || 'None';

    const prompt = [
      `You are analysing live FIFA World Cup 2026 stadium crowd data at MetLife Stadium (capacity 82,500).`,
      `Match: USA 🇺🇸 vs France 🇫🇷 | Minute: 67 | Attendance: 67,842 (82% capacity)`,
      `This is a high-profile international event with multilingual fans from 50+ nations.`,
      ``,
      `LIVE SECTION DENSITIES:`,
      ...this._sections.map(s => `- ${s.name}: ${s.density}%`),
      ``,
      `Critical sections (≥90%): ${critical}`,
      `High sections (75-89%): ${high}`,
      ``,
      `Provide a structured operational intelligence report:`,
      `1. **🚨 Immediate Actions (NOW)** — numbered steps for operations staff in the next 5 minutes`,
      `2. **🌊 Crowd Flow Recommendations** — re-routing strategies, gate recommendations, steward deployment`,
      `3. **🛡️ Safety Risk Assessment** — overall safety level (Low/Medium/High/Critical) with reasoning`,
      `4. **♿ Inclusion Considerations** — any accessibility or vulnerable fan concerns in high-density zones`,
      `5. **🏁 Post-Match Exit Strategy** — phased exit plan for 67,000+ fans across all transport modes`,
      ``,
      `Be concise (max 280 words). Use clear operational language. Target: stadium command centre.`,
    ].join('\n');

    try {
      const text = await geminiClient.generate(prompt, 'You are a crowd safety expert for FIFA World Cup 2026.', false);
      response.innerHTML = '';
      const textEl = document.createElement('div');
      textEl.className = 'ai-text';
      response.appendChild(textEl);
      _typewrite(textEl, text, 10);
    } catch (err) {
      console.error('[CrowdModule] Gemini error:', err);
      response.innerHTML = '';
      const msgEl = document.createElement('p');
      msgEl.style.color = 'var(--text-muted)';
      msgEl.textContent = GeminiClient?.hasApiKey?.() === false || err.message.includes('API key') || err.message.includes('No API key')
        ? '⚙️ Enter your Gemini API key in Settings (⚙️) to enable live AI crowd analysis.'
        : 'I\'m having trouble connecting right now. Please try again in a moment. 🔄';
      response.appendChild(msgEl);
    } finally {
      this._isAnalysing = false;
    }
  }

  destroy() {
    clearInterval(this._ticker);
    this._chart?.destroy();
    this._polarChart?.destroy();
    this._chart      = null;
    this._polarChart = null;
    this._ticker     = null;
  }
}

export function getCrowdLevel(density) {
  if (density > 80) return "HIGH";
  if (density < 50) return "LOW";
  return "MEDIUM";
}

export function shouldAlert(density, threshold) {
  return density > threshold;
}
