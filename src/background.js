/*
 * TMT Bridge Lens v10 — background service worker
 * ------------------------------------------------
 * Fast path: content scripts ask this worker for sentence batches.
 * Safety path: the private team token stays in chrome.storage.local and is
 * never exposed to webpage scripts.
 */

const usesBrowserPromises = typeof browser !== 'undefined';
const runtime = usesBrowserPromises ? browser : chrome;

const DEFAULTS = Object.freeze({
  apiUrl: 'https://tmt.ilprl.ku.edu.np/lang-translate',
  srcLang: 'en',
  tgtLang: 'tmg',
  mode: 'bilingual',
  requestDelayMs: 80,
  maxConcurrentRequests: 3,
  cacheLimit: 1800
});

const LANG = Object.freeze({
  en: { label: 'English', api: 'en' },
  ne: { label: 'Nepali', api: 'ne' },
  tmg: { label: 'Tamang', api: 'tmg' }
});

const cache = new Map();
const inflight = new Map();
const queue = [];
let running = 0;
let lastStartAt = 0;
let cacheLoaded = false;
let persistTimer = null;

function storageGet(area, keys) {
  if (usesBrowserPromises) return runtime.storage[area].get(keys);
  return new Promise(resolve => runtime.storage[area].get(keys, resolve));
}

function storageSet(area, value) {
  if (usesBrowserPromises) return runtime.storage[area].set(value);
  return new Promise(resolve => runtime.storage[area].set(value, resolve));
}

function normalizeLang(value, fallback = 'en') {
  const lang = String(value || '').trim().toLowerCase();
  if (lang === 'english' || lang === 'eng') return 'en';
  if (lang === 'nepali' || lang === 'nep') return 'ne';
  if (lang === 'tamang') return 'tmg';
  return LANG[lang] ? lang : fallback;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cacheKey(text, srcLang, tgtLang) {
  return `${srcLang}\u001f${tgtLang}\u001f${text}`;
}

async function getSettings(override = {}) {
  const stored = await storageGet('sync', Object.keys(DEFAULTS));
  const settings = { ...DEFAULTS, ...stored, ...override };
  settings.srcLang = normalizeLang(settings.srcLang, DEFAULTS.srcLang);
  settings.tgtLang = normalizeLang(settings.tgtLang, DEFAULTS.tgtLang);
  if (settings.srcLang === settings.tgtLang) settings.tgtLang = settings.srcLang === 'en' ? 'tmg' : 'en';
  settings.mode = settings.mode === 'replace' ? 'replace' : 'bilingual';
  settings.apiUrl = String(settings.apiUrl || DEFAULTS.apiUrl).trim() || DEFAULTS.apiUrl;
  settings.maxConcurrentRequests = Math.max(1, Math.min(4, Number(settings.maxConcurrentRequests) || DEFAULTS.maxConcurrentRequests));
  settings.requestDelayMs = Math.max(0, Number(settings.requestDelayMs) || DEFAULTS.requestDelayMs);
  settings.cacheLimit = Math.max(100, Math.min(5000, Number(settings.cacheLimit) || DEFAULTS.cacheLimit));
  return settings;
}

async function getToken() {
  const data = await storageGet('local', ['tmtApiToken']);
  return String(data.tmtApiToken || '').trim();
}

async function ensureCacheLoaded() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  const data = await storageGet('local', ['tmtSentenceCacheV10']);
  const saved = data.tmtSentenceCacheV10;
  if (!saved || typeof saved !== 'object') return;
  for (const [key, value] of Object.entries(saved)) {
    if (value && typeof value.output === 'string') cache.set(key, value);
  }
}

function trimCache(limit) {
  while (cache.size > limit) {
    cache.delete(cache.keys().next().value);
  }
}

function schedulePersist(limit) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    trimCache(limit);
    await storageSet('local', { tmtSentenceCacheV10: Object.fromEntries(cache.entries()) });
  }, 250);
}

function enqueue(job, settings) {
  return new Promise((resolve, reject) => {
    queue.push({ job, resolve, reject, settings });
    pumpQueue();
  });
}

function pumpQueue() {
  if (!queue.length) return;
  const next = queue[0];
  if (running >= next.settings.maxConcurrentRequests) return;

  queue.shift();
  running += 1;
  const waitMs = Math.max(0, next.settings.requestDelayMs - (Date.now() - lastStartAt));

  setTimeout(async () => {
    lastStartAt = Date.now();
    try {
      next.resolve(await next.job());
    } catch (error) {
      next.reject(error);
    } finally {
      running -= 1;
      pumpQueue();
      if (queue.length) pumpQueue();
    }
  }, waitMs);
}

async function callTmtApi({ text, srcLang, tgtLang, settings }) {
  const token = await getToken();
  if (!token) throw new Error('Add your TMT team token in Options first.');

  const response = await fetch(settings.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ text, src_lang: srcLang, tgt_lang: tgtLang })
  });

  let data;
  try {
    data = await response.json();
  } catch (_) {
    throw new Error(`TMT API returned non-JSON response (${response.status}).`);
  }

  if (data.message_type === 'SUCCESS') {
    return {
      input: text,
      output: String(data.output || ''),
      srcLang,
      tgtLang,
      srcLabel: LANG[srcLang].label,
      tgtLabel: LANG[tgtLang].label,
      timestamp: data.timestamp || new Date().toISOString(),
      cached: false
    };
  }

  throw new Error(data.message || `Translation failed (${response.status}).`);
}

async function translateSentence(text, requestedSettings = {}) {
  await ensureCacheLoaded();
  const settings = await getSettings(requestedSettings);
  const srcLang = normalizeLang(settings.srcLang, 'en');
  const tgtLang = normalizeLang(settings.tgtLang, 'tmg');
  const normalizedText = cleanText(text);

  if (!normalizedText) return { input: '', output: '', srcLang, tgtLang, cached: true };
  if (srcLang === tgtLang) throw new Error('Source and target languages must be different.');

  const key = cacheKey(normalizedText, srcLang, tgtLang);
  if (cache.has(key)) return { ...cache.get(key), cached: true };
  if (inflight.has(key)) return { ...(await inflight.get(key)), shared: true };

  const promise = enqueue(() => callTmtApi({ text: normalizedText, srcLang, tgtLang, settings }), settings);
  inflight.set(key, promise);

  try {
    const result = await promise;
    cache.set(key, result);
    schedulePersist(settings.cacheLimit);
    return result;
  } finally {
    inflight.delete(key);
  }
}

function splitIntoSentences(text) {
  const source = String(text || '');
  if (!source.trim()) return [];

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
      const parts = Array.from(segmenter.segment(source), item => cleanText(item.segment)).filter(Boolean);
      if (parts.length) return parts;
    } catch (_) {}
  }

  return (source.match(/[^.!?।\n]+[.!?।]?/g) || [source]).map(cleanText).filter(Boolean);
}

async function translateBatch(payload = {}) {
  const settings = await getSettings(payload.settings || payload);
  const inputTexts = Array.isArray(payload.texts) ? payload.texts : [];
  const unique = [];
  const seen = new Set();

  for (const raw of inputTexts) {
    const text = cleanText(raw);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    unique.push(text);
  }

  const translated = await Promise.all(unique.map(text => translateSentence(text, settings)));
  return {
    ok: true,
    items: translated,
    total: unique.length,
    fromCache: translated.filter(item => item.cached).length,
    cacheSize: cache.size
  };
}

async function translateBlock(payload = {}) {
  const text = String(payload.text || '');
  const parts = splitIntoSentences(text);
  if (!parts.length) return { ok: true, input: text, output: '' };

  const batch = await translateBatch({ texts: parts, settings: payload.settings || payload });
  const map = new Map(batch.items.map(item => [item.input, item.output]));
  let output = text;

  // Replace longest first to avoid partial replacements.
  [...parts].sort((a, b) => b.length - a.length).forEach(part => {
    const translated = map.get(part);
    if (!translated) return;
    output = output.split(part).join(translated);
  });

  return { ok: true, input: text, output, cacheSize: cache.size };
}

async function getActiveTab() {
  const query = { active: true, currentWindow: true };
  const tabs = usesBrowserPromises
    ? await runtime.tabs.query(query)
    : await new Promise(resolve => runtime.tabs.query(query, resolve));
  const tab = tabs && tabs[0];
  if (!tab || !tab.id) throw new Error('No active tab found.');
  return tab;
}

async function sendTabMessage(tabId, message) {
  const response = usesBrowserPromises
    ? await runtime.tabs.sendMessage(tabId, message)
    : await new Promise((resolve, reject) => {
      runtime.tabs.sendMessage(tabId, message, result => {
        const err = runtime.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve(result);
      });
    });
  if (response && response.ok === false) throw new Error(response.error || 'Page action failed.');
  return response || { ok: true };
}

async function ensureContentScript(tabId) {
  try {
    await sendTabMessage(tabId, { type: 'TMT_PING' });
    return;
  } catch (_) {
    await runtime.scripting.executeScript({ target: { tabId }, files: ['src/content.js'] });
  }
}

async function runPageAction(payload = {}) {
  const tab = await getActiveTab();
  const settings = await getSettings(payload.settings || {});
  await ensureContentScript(tab.id);
  return sendTabMessage(tab.id, { type: 'TMT_CONTENT_ACTION', payload: { ...payload, settings } });
}

async function clearCache() {
  cache.clear();
  await storageSet('local', { tmtSentenceCacheV10: {} });
  return { ok: true, cacheSize: 0 };
}

async function createContextMenu() {
  if (!runtime.contextMenus) return;
  try {
    if (usesBrowserPromises) {
      await runtime.contextMenus.removeAll();
    } else {
      await new Promise(resolve => runtime.contextMenus.removeAll(resolve));
    }
    runtime.contextMenus.create({
      id: 'tmt-translate-selection',
      title: 'Translate selected text with TMT',
      contexts: ['selection']
    });
  } catch (_) {}
}

runtime.runtime.onInstalled.addListener(createContextMenu);
createContextMenu();

runtime.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'tmt-translate-selection' || !tab?.id) return;
  try {
    const settings = await getSettings();
    await ensureContentScript(tab.id);
    await sendTabMessage(tab.id, {
      type: 'TMT_CONTENT_ACTION',
      payload: { action: 'selection', selectedText: info.selectionText || '', settings }
    });
  } catch (_) {}
});

runtime.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    const type = message?.type;
    if (type === 'TMT_GET_STATUS') {
      await ensureCacheLoaded();
      const settings = await getSettings();
      const token = await getToken();
      return { ok: true, settings, hasToken: Boolean(token), cacheSize: cache.size };
    }
    if (type === 'TMT_RUN_ACTION') return runPageAction(message.payload || {});
    if (type === 'TMT_TRANSLATE_BATCH') return translateBatch(message.payload || {});
    if (type === 'TMT_TRANSLATE_BLOCK') return translateBlock(message.payload || {});
    if (type === 'TMT_CLEAR_CACHE') return clearCache();
    if (type === 'TMT_TEST_TOKEN') {
      const result = await translateSentence('Good morning.', { srcLang: 'en', tgtLang: 'tmg' });
      return { ok: true, result };
    }
    return { ok: false, error: `Unknown message type: ${type}` };
  })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});
