/**
 * @file tests/setup.js
 * @description Mocks browser globals for Node.js test environment before module loading
 */

'use strict';

globalThis.window = {
  matchMedia: () => ({ matches: false }),
  innerWidth: 1024,
  location: { href: 'http://localhost/' },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true
};

globalThis.document = {
  readyState: 'complete',
  addEventListener: () => {},
  documentElement: {
    setAttribute: () => {}
  },
  body: {
    setAttribute: () => {},
    classList: { add: () => {}, remove: () => {} }
  },
  getElementById: () => {
    return {
      addEventListener: () => {},
      removeAttribute: () => {},
      setAttribute: () => {},
      appendChild: () => {},
      remove: () => {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      querySelector: () => null,
      querySelectorAll: () => []
    };
  },
  querySelector: () => {
    return {
      addEventListener: () => {},
      appendChild: () => {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} }
    };
  },
  querySelectorAll: () => [],
  createElement: () => {
    return {
      className: '',
      textContent: '',
      innerHTML: '',
      setAttribute: () => {},
      removeAttribute: () => {},
      appendChild: () => {},
      append: () => {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      addEventListener: () => {}
    };
  }
};

globalThis.sessionStorage = {
  _store: {},
  getItem(key) { return this._store[key] || null; },
  setItem(key, value) { this._store[key] = String(value); },
  removeItem(key) { delete this._store[key]; },
  clear() { this._store = {}; }
};

globalThis.localStorage = {
  _store: {},
  getItem(key) { return this._store[key] || null; },
  setItem(key, value) { this._store[key] = String(value); },
  removeItem(key) { delete this._store[key]; },
  clear() { this._store = {}; }
};

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text: 'Mock Response' }] } }] })
});

globalThis.AbortSignal = {
  timeout: () => {}
};

globalThis.Chart = class Chart {
  constructor() {}
  update() {}
  destroy() {}
};

globalThis.L = {
  map: () => ({ addLayer: () => {}, remove: () => {} }),
  tileLayer: () => ({ addTo: () => {} }),
  marker: () => ({ addTo: () => ({ bindPopup: () => {} }) }),
  divIcon: () => ({})
};

globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
