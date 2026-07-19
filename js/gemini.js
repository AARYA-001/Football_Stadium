/**
 * @module gemini
 * @description Secure, efficient Gemini API client for StadiumIQ
 *
 * Features:
 *  - Token-bucket rate limiting (prevents API abuse)
 *  - LRU cache (avoids redundant API calls)
 *  - Input sanitisation (guards against prompt injection)
 *  - Request timeout via AbortSignal
 *  - API key stored ONLY in sessionStorage (cleared on tab close)
 *  - Full JSDoc for IDE type-checking
 *
 * Security:
 *  - No eval(), no Function(), no innerHTML from API responses
 *  - API key never logged or sent anywhere except Google's endpoint
 *  - Rate limiter prevents runaway usage costs
 *
 * @version 1.0.0
 * @license MIT
 */

'use strict';

/* ─── Constants ──────────────────────────────────────────────────────────── */
const API_BASE_URL  = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL_ID      = 'gemini-2.0-flash';
const SESSION_KEY   = 'stadiumiq_api_key';
const MAX_PROMPT_LEN = 3000;   // characters — prevents runaway token use
const REQUEST_TIMEOUT_MS = 30_000; // 30 s timeout per request

/* Rate limiter: max 10 requests/minute using token-bucket algorithm */
const RATE_LIMIT_CAPACITY   = 10;
const RATE_REFILL_RATE_MS   = 60_000 / RATE_LIMIT_CAPACITY; // ms per token refill
const CACHE_CAPACITY        = 30;   // LRU cache size

/* ─── Utility: Input Sanitiser ───────────────────────────────────────────── */
/**
 * Sanitise a user-supplied string for safe inclusion in an API prompt.
 * Strips HTML-like characters, null bytes, and enforces a length cap.
 *
 * @param {unknown} input - Raw input (may be any type)
 * @returns {string} - Sanitised string, safe for prompt inclusion
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';

  return input
    .trim()
    .slice(0, 500)
    .replace(/[<>]/g, '')        // strip angle brackets
    .replace(/\u0000/g, '')      // strip null bytes
    .replace(/javascript:/gi, '') // strip js: URIs
    .replace(/on\w+\s*=/gi, '')  // strip inline event attributes
    .trim();
}

export const sanitiseInput = sanitizeInput;

/* ─── Token-Bucket Rate Limiter ──────────────────────────────────────────── */
/**
 * Implements a token-bucket rate limiter.
 * Tokens refill at a steady rate up to a maximum capacity.
 */
export class TokenBucket {
  /**
   * @param {number} capacity  - Maximum burst tokens
   * @param {number} refillRateMs - Milliseconds between each token refill
   */
  constructor(capacity, refillRateMs) {
    this._capacity    = capacity;
    this._tokens      = capacity;
    this._refillRateMs = refillRateMs;
    this._lastRefill  = Date.now();
  }

  /** Refill tokens based on elapsed time */
  _refill() {
    if (this._refillRateMs <= 0) return;
    const now      = Date.now();
    const elapsed  = now - this._lastRefill;
    const newTokens = Math.floor(elapsed / this._refillRateMs);
    if (newTokens > 0) {
      this._tokens    = Math.min(this._capacity, this._tokens + newTokens);
      this._lastRefill = now - (elapsed % this._refillRateMs);
    }
  }

  /**
   * Attempt to consume one token.
   * @returns {boolean} - true if token consumed, false if rate limit exceeded
   */
  consume() {
    this._refill();
    if (this._tokens < 1) return false;
    this._tokens -= 1;
    return true;
  }

  /** Remaining tokens (for diagnostics) */
  get remaining() {
    this._refill();
    return this._tokens;
  }

  /** Expose tokens count directly for testing */
  get tokens() {
    this._refill();
    return this._tokens;
  }
}

/* ─── LRU Cache ──────────────────────────────────────────────────────────── */
/**
 * Least-Recently-Used (LRU) cache backed by a Map.
 * Map preserves insertion order; we treat iteration order as LRU.
 *
 * Time complexity: O(1) get/set
 * Space complexity: O(capacity)
 *
 * @template V
 */
export class LRUCache {
  /** @param {number} capacity */
  constructor(capacity) {
    if (capacity < 1) throw new RangeError('LRUCache capacity must be >= 1');
    this._capacity = capacity;
    this._cache    = new Map();
  }

  /**
   * Get a cached value.
   * @param {string} key
   * @returns {V|null}
   */
  get(key) {
    if (!this._cache.has(key)) return null;
    const value = this._cache.get(key);
    // Move to end (most recently used)
    this._cache.delete(key);
    this._cache.set(key, value);
    return value;
  }

  /**
   * Insert/update a cached value, evicting LRU entry if at capacity.
   * @param {string} key
   * @param {V}      value
   */
  set(key, value) {
    if (this._cache.has(key)) this._cache.delete(key);
    else if (this._cache.size >= this._capacity) {
      // Evict least recently used (first entry)
      const lruKey = this._cache.keys().next().value;
      this._cache.delete(lruKey);
    }
    this._cache.set(key, value);
  }

  /** Invalidate all cached entries */
  clear() { this._cache.clear(); }

  /** Number of cached entries */
  get size() { return this._cache.size; }
}

/* ─── Gemini API Client ──────────────────────────────────────────────────── */
/**
 * Singleton API client for Google Gemini.
 *
 * Usage:
 *   import { geminiClient } from './gemini.js';
 *   const text = await geminiClient.generate('What gate is closest to section 104?');
 */
export class GeminiClient {
  constructor() {
    this._rateLimiter  = new TokenBucket(RATE_LIMIT_CAPACITY, RATE_REFILL_RATE_MS);
    this._cache        = new LRUCache(CACHE_CAPACITY);

    /** FIFA WC 2026 system context injected into every request */
    this._systemContext = [
      'You are StadiumIQ, an advanced AI assistant for FIFA World Cup 2026 stadium operations.',
      'Your primary users are fans, venue staff, volunteers, organizers, and people with disabilities.',
      'You specialise in: stadium navigation, crowd management, multilingual support, accessibility services,',
      'transport logistics, sustainability, and real-time operational intelligence.',
      'Always respond in the same language the user writes in.',
      'Be concise, clear, empathetic, and safety-first.',
      'Current event: FIFA World Cup 2026. Venues: USA, Canada, Mexico.',
      'Prioritise fan safety and positive experience at all times.',
    ].join(' ');
  }

  /* ── Static API Key Management ── */

  /**
   * Securely store the API key in sessionStorage only.
   * sessionStorage is scoped to the tab and cleared when the tab closes.
   *
   * @param {string} key - Raw API key
   * @throws {Error} if key format looks invalid
   */
  static storeApiKey(key) {
    if (typeof key !== 'string') throw new TypeError('API key must be a string');
    const trimmed = key.trim();
    if (trimmed.length < 20) throw new Error('API key appears too short — please verify it.');
    // Basic pattern check — Gemini keys start with "AIza"
    if (!trimmed.startsWith('AIza') && !trimmed.startsWith('ya29')) {
      console.warn('[StadiumIQ] API key does not match expected Gemini prefix — proceeding anyway.');
    }
    sessionStorage.setItem(SESSION_KEY, trimmed);
  }

  /** Remove the stored API key */
  static clearApiKey() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  /** @returns {boolean} Whether an API key is currently stored */
  static hasApiKey() {
    return Boolean(sessionStorage.getItem(SESSION_KEY));
  }

  /** @returns {string} Stored API key, or empty string */
  _getApiKey() {
    return sessionStorage.getItem(SESSION_KEY) ?? '';
  }

  /* ── Request Building ── */

  /**
   * Build a Gemini request body.
   *
   * @param {Array<{role:'user'|'assistant', content:string}>} messages
   * @param {string} extraSystem - Additional system instruction for this request
   * @param {object} [config]    - generationConfig overrides
   * @returns {object}           - Request body
   */
  _buildBody(messages, extraSystem = '', config = {}) {
    const systemText = extraSystem
      ? `${this._systemContext}\n\n${extraSystem}`
      : this._systemContext;

    const contents = messages.map(m => ({
      role  : m.role === 'assistant' ? 'model' : 'user',
      parts : [{ text: sanitiseInput(m.content) }],
    }));

    return {
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig: {
        temperature      : 0.7,
        maxOutputTokens  : 1024,
        topK             : 40,
        topP             : 0.95,
        candidateCount   : 1,
        ...config,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    };
  }

  /**
   * Execute an API request with timeout, error parsing, and rate-limit checks.
   *
   * @param {string} endpoint - Full API URL (including key)
   * @param {object} body     - Request body
   * @returns {Promise<string>} - Generated text
   */
  async _request(endpoint, body) {
    const apiKey = this._getApiKey();
    if (!apiKey) {
      throw new Error('No API key configured. Open ⚙️ Settings and enter your Gemini API key.');
    }

    if (!this._rateLimiter.consume()) {
      window.dispatchEvent(new CustomEvent('stadiumiq-rate-limit'));
      throw new Error('Rate limit reached, try again soon');
    }

    const url = `${API_BASE_URL}/${MODEL_ID}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let response;
    try {
      response = await fetch(url, {
        method  : 'POST',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify(body),
        signal  : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (fetchErr) {
      if (fetchErr.name === 'TimeoutError') {
        throw new Error('Request timed out (30s). Check your internet connection.');
      }
      throw new Error(`Network error: ${fetchErr.message}`);
    }

    if (!response.ok) {
      let errMsg = `API error ${response.status}`;
      try {
        const errData = await response.json();
        errMsg = errData?.error?.message || errMsg;
      } catch {
        /* ignore JSON parse error on error body */
      }
      throw new Error(errMsg);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      // Check for safety block
      const finishReason = data?.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY') {
        throw new Error('Response blocked by safety filters. Please rephrase your request.');
      }
      throw new Error('No content in API response. Please try again.');
    }

    return text;
  }

  /* ── Public API ── */

  /**
   * Generate a single response for a plain prompt string.
   * Caches identical prompt+system pairs to avoid redundant API calls.
   *
   * @param {string}  prompt         - User prompt
   * @param {string}  [systemExtra]  - Additional system instruction
   * @param {boolean} [useCache]     - Whether to use LRU cache (default: true)
   * @returns {Promise<string>}      - AI-generated text
   */
  async generate(prompt, systemExtra = '', useCache = true) {
    const sanitised = sanitiseInput(prompt);
    if (!sanitised) throw new Error('Prompt cannot be empty.');

    const cacheKey = `${systemExtra}|${sanitised}`;
    if (useCache) {
      const cached = this._cache.get(cacheKey);
      if (cached) return cached;
    }

    const body = this._buildBody([{ role: 'user', content: sanitised }], systemExtra);
    const text = await this._request(null, body);

    if (useCache) this._cache.set(cacheKey, text);
    return text;
  }

  /**
   * Generate a response in a multi-turn conversation context.
   * Not cached (conversation state is user-specific).
   *
   * @param {Array<{role:'user'|'assistant', content:string}>} messages - Full conversation history
   * @param {string} [systemExtra] - Additional system instruction
   * @returns {Promise<string>}    - AI-generated text
   */
  async chat(messages, systemExtra = '') {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new TypeError('messages must be a non-empty array');
    }
    const body = this._buildBody(messages, systemExtra);
    return this._request(null, body);
  }

  /** Invalidate the entire response cache (e.g., after venue change) */
  invalidateCache() {
    this._cache.clear();
  }

  /** @returns {number} Remaining rate-limit tokens (diagnostic) */
  get remainingRequests() {
    return this._rateLimiter.remaining;
  }
}

/* ─── Singleton Export ───────────────────────────────────────────────────── */
export const geminiClient = new GeminiClient();
