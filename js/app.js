/**
 * @module app
 * @description StadiumIQ — Main application controller
 *
 * Responsibilities:
 *  - Module routing and lifecycle management
 *  - Settings persistence (API key in sessionStorage, venue/theme in localStorage)
 *  - Global keyboard shortcuts
 *  - Theme management (dark/light)
 *  - Toast notification queue
 *  - Accessibility: focus management, ARIA live regions
 *
 * Design patterns:
 *  - Module pattern (ES6 imports)
 *  - Event delegation for performance
 *  - Immutable state updates (Object.freeze)
 */

import { GeminiClient, geminiClient } from './gemini.js';
import { DashboardModule }     from './dashboard.js';
import { NavigationModule }    from './navigation.js';
import { CrowdModule }         from './crowd.js';
import { AssistantModule }     from './assistant.js';
import { AccessibilityModule } from './accessibility.js';
import { TransportModule }     from './transport.js';
import { SustainabilityModule } from './sustainability.js';
import { OperationsModule }    from './operations.js';

/* ─── Module Registry ────────────────────────────────────────────────────── */
const MODULE_REGISTRY = Object.freeze({
  dashboard    : DashboardModule,
  navigation   : NavigationModule,
  crowd        : CrowdModule,
  assistant    : AssistantModule,
  accessibility: AccessibilityModule,
  transport    : TransportModule,
  sustainability: SustainabilityModule,
  operations   : OperationsModule,
});

/* ─── Application State (immutable pattern) ──────────────────────────────── */
let _state = Object.freeze({
  activeModule : 'dashboard',
  theme        : localStorage.getItem('stadiumiq_theme')  ?? 'dark',
  venue        : localStorage.getItem('stadiumiq_venue')  ?? 'metlife',
  role         : localStorage.getItem('stadiumiq_role')   ?? 'fan',
});

export const getState = () => _state;

function setState(partial) {
  _state = Object.freeze({ ..._state, ...partial });
}

let _activeModule = null;

/* ─── Theme ──────────────────────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('stadiumiq_theme', theme);
  const icon = document.getElementById('theme-icon');
  const btn  = document.getElementById('btn-theme');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  if (btn)  btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
}

function toggleTheme() {
  const next = _state.theme === 'dark' ? 'light' : 'dark';
  setState({ theme: next });
  applyTheme(next);
}

/* ─── Toast Notifications ────────────────────────────────────────────────── */
const _toastQueue = [];
let   _toastTimer = null;

/**
 * Display a toast notification in a FIFO queue.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type='info']
 * @param {number} [duration=4000]
 */
export function showToast(message, type = 'info', duration = 4000) {
  _toastQueue.push({ message: String(message).slice(0, 250), type, duration });
  _processToastQueue();
}

function _processToastQueue() {
  if (_toastQueue.length === 0 || _toastTimer) return;
  const { message, type, duration } = _toastQueue.shift();
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };

  const toast   = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconEl  = document.createElement('span');
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = icons[type] ?? 'ℹ️';

  const msgEl   = document.createElement('span');
  msgEl.textContent = message; // textContent — XSS safe

  toast.appendChild(iconEl);
  toast.appendChild(msgEl);
  container.appendChild(toast);

  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('toast-visible')));

  _toastTimer = setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    _toastTimer = null;
    _processToastQueue();
  }, duration);
}

/* ─── Module Routing ─────────────────────────────────────────────────────── */
async function loadModule(moduleName) {
  const ModuleClass = MODULE_REGISTRY[moduleName];
  if (!ModuleClass) { console.warn(`[StadiumIQ] Unknown module: "${moduleName}"`); return; }

  // Tear down current module
  if (_activeModule?.destroy) {
    try { _activeModule.destroy(); } catch (e) { console.error('[StadiumIQ] Destroy error:', e); }
  }
  _activeModule = null;

  const container = document.getElementById('module-container');
  if (!container) return;

  container.setAttribute('aria-busy', 'true');
  container.innerHTML = '';

  // Update nav ARIA
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const active = btn.dataset.module === moduleName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });

  setState({ activeModule: moduleName });

  try {
    _activeModule = new ModuleClass(container, {
      onToast : showToast,
      venue   : _state.venue,
      role    : _state.role,
      theme   : _state.theme,
    });
    await _activeModule.init();
  } catch (err) {
    console.error(`[StadiumIQ] Module "${moduleName}" error:`, err);
    _renderError(container, err.message);
    showToast('Module failed to load — check console.', 'error');
  } finally {
    container.removeAttribute('aria-busy');
    requestAnimationFrame(() => {
      container.querySelector('h1, h2, [tabindex="-1"]')?.focus();
    });
  }
}

function _renderError(container, detail = '') {
  const section = document.createElement('section');
  section.className = 'error-state';
  section.setAttribute('role', 'alert');

  const icon  = document.createElement('div');   icon.className = 'error-icon'; icon.setAttribute('aria-hidden','true'); icon.textContent = '⚠️';
  const title = document.createElement('h2');    title.textContent = 'Module failed to load';
  const desc  = document.createElement('p');     desc.textContent = detail || 'An unexpected error occurred.';
  const btn   = document.createElement('button');
  btn.className = 'btn-secondary';
  btn.textContent = '↻ Retry';
  btn.addEventListener('click', () => loadModule(_state.activeModule));

  section.append(icon, title, desc, btn);
  container.appendChild(section);
}

/* ─── Settings Modal ─────────────────────────────────────────────────────── */
function openSettings() {
  const modal   = document.getElementById('settings-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  const apiInput    = document.getElementById('api-key-input');
  const venueSelect = document.getElementById('venue-select');
  const roleSelect  = document.getElementById('role-select');

  if (apiInput)    apiInput.value    = GeminiClient.hasApiKey() ? '•'.repeat(24) : '';
  if (venueSelect) venueSelect.value = _state.venue;
  if (roleSelect)  roleSelect.value  = _state.role;

  modal.removeAttribute('hidden');
  overlay.removeAttribute('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => apiInput?.focus());
}

function closeSettings() {
  const modal   = document.getElementById('settings-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;
  modal.setAttribute('hidden', '');
  overlay.setAttribute('hidden', '');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  document.getElementById('btn-settings')?.focus();
}

function saveSettings() {
  const apiInput    = document.getElementById('api-key-input');
  const venueSelect = document.getElementById('venue-select');
  const roleSelect  = document.getElementById('role-select');

  const rawKey = (apiInput?.value ?? '').trim();
  if (rawKey && !rawKey.startsWith('•')) {
    if (rawKey.length > 500) {
      showToast('API key is too long (max 500 characters).', 'error');
      apiInput?.focus();
      return;
    }
    try {
      GeminiClient.storeApiKey(rawKey);
      geminiClient.invalidateCache();
      showToast('API key saved for this session.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
      apiInput?.focus();
      return;
    }
  }

  const venue = venueSelect?.value ?? 'metlife';
  const role  = roleSelect?.value  ?? 'fan';
  localStorage.setItem('stadiumiq_venue', venue);
  localStorage.setItem('stadiumiq_role',  role);
  setState({ venue, role });
  closeSettings();
  showToast('Settings saved ✓', 'success');
}

/* ─── Modal Focus Trap (WCAG 2.1 SC 2.1.2) ──────────────────────────────── */
function _handleFocusTrap(e) {
  const modal = document.getElementById('settings-modal');
  if (!modal || modal.hasAttribute('hidden')) return;
  const focusable = Array.from(
    modal.querySelectorAll('input, select, button, [tabindex]:not([tabindex="-1"])')
  ).filter(el => !el.disabled);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.key === 'Tab') {
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

/* ─── Global Keyboard Shortcuts ──────────────────────────────────────────── */
function handleKeydown(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('settings-modal');
    if (modal && !modal.hasAttribute('hidden')) { closeSettings(); return; }
  }

  _handleFocusTrap(e);
  if (!e.altKey) return;

  const modules = Object.keys(MODULE_REGISTRY);
  if (e.key >= '1' && e.key <= '8') {
    e.preventDefault();
    const m = modules[parseInt(e.key, 10) - 1];
    if (m) loadModule(m);
    return;
  }
  if (e.key === 's' || e.key === 'S') { e.preventDefault(); openSettings(); }
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); toggleTheme(); }
}

/* ─── Bootstrap ──────────────────────────────────────────────────────────── */
function init() {
  applyTheme(_state.theme);

  // Navigation — single delegated listener
  document.querySelector('.app-nav')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-module]');
    if (btn?.dataset.module) loadModule(btn.dataset.module);
  });

  document.getElementById('btn-settings')       ?.addEventListener('click', openSettings);
  document.getElementById('btn-close-settings') ?.addEventListener('click', closeSettings);
  document.getElementById('btn-cancel-settings')?.addEventListener('click', closeSettings);
  document.getElementById('btn-save-settings')  ?.addEventListener('click', saveSettings);
  document.getElementById('modal-overlay')      ?.addEventListener('click', closeSettings);
  document.getElementById('btn-theme')          ?.addEventListener('click', toggleTheme);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('stadiumiq-rate-limit', () => {
    showToast('Rate limit reached, try again soon', 'error');
  });

  // System theme preference
  if (!localStorage.getItem('stadiumiq_theme')) {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setState({ theme: dark ? 'dark' : 'light' });
    applyTheme(_state.theme);
  }

  loadModule('dashboard');
  setTimeout(() => showToast('Welcome to StadiumIQ — FIFA World Cup 2026 🏟️', 'info', 5000), 800);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
