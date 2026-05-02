(() => {
  if (window.__TMT_BRIDGE_LENS_V10__) return;
  window.__TMT_BRIDGE_LENS_V10__ = true;

  const runtime = typeof browser !== 'undefined' ? browser : chrome;
  const SKIP_SELECTOR = [
    'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'video', 'audio',
    'input', 'textarea', 'select', 'option', 'button', 'code', 'pre', 'kbd', 'samp',
    'iframe', '[contenteditable="true"]', '.tmt-v10-panel', '.tmt-v10-wrap'
  ].join(',');

  const LANG_LABEL = { en: 'English', ne: 'Nepali', tmg: 'Tamang' };
  const state = {
    records: [],
    panel: null,
    status: null,
    body: null,
    progress: null,
    running: false,
    maxNodes: 650
  };

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      runtime.runtime.sendMessage(message, response => {
        const err = runtime.runtime.lastError;
        if (err) return reject(new Error(err.message));
        if (!response) return reject(new Error('Extension worker did not respond.'));
        if (response.ok === false) return reject(new Error(response.error || 'Translation failed.'));
        resolve(response);
      });
    });
  }

  function direction(settings) {
    return `${LANG_LABEL[settings.srcLang] || settings.srcLang} → ${LANG_LABEL[settings.tgtLang] || settings.tgtLang}`;
  }

  function hasLetters(text) {
    return /[A-Za-z\u0900-\u097F]/.test(text || '');
  }

  function normalizeSpace(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function ensureStyles() {
    if (document.getElementById('tmt-v10-styles')) return;
    const style = document.createElement('style');
    style.id = 'tmt-v10-styles';
    style.textContent = `
      .tmt-v10-panel {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: min(390px, calc(100vw - 32px));
        max-height: min(560px, calc(100vh - 36px));
        display: flex;
        flex-direction: column;
        overflow: hidden;
        color: #0f172a;
        background: rgba(255,255,255,.96);
        border: 1px solid rgba(148,163,184,.35);
        border-radius: 18px;
        box-shadow: 0 22px 70px rgba(15,23,42,.22);
        font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(12px);
      }
      .tmt-v10-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(148,163,184,.24);
      }
      .tmt-v10-title { font-weight: 800; letter-spacing: -.02em; }
      .tmt-v10-status { color: #64748b; font-size: 12px; margin-top: 2px; }
      .tmt-v10-close {
        appearance: none;
        border: 1px solid rgba(148,163,184,.35);
        background: #f8fafc;
        border-radius: 999px;
        width: 30px;
        height: 30px;
        cursor: pointer;
        color: #0f172a;
        font-weight: 800;
      }
      .tmt-v10-progress { height: 3px; background: rgba(37,99,235,.12); }
      .tmt-v10-progress > span { display: block; width: 0%; height: 100%; background: #2563eb; transition: width .18s ease; }
      .tmt-v10-body { padding: 12px 14px 14px; overflow: auto; white-space: normal; }
      .tmt-v10-card {
        border: 1px solid rgba(148,163,184,.28);
        border-radius: 14px;
        padding: 10px 11px;
        margin-top: 8px;
        background: #f8fafc;
      }
      .tmt-v10-label { display: block; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
      .tmt-v10-text { white-space: pre-wrap; word-break: break-word; }
      .tmt-v10-wrap {
        background: rgba(37,99,235,.075);
        border-radius: .45em;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }
      .tmt-v10-trans {
        color: #1d4ed8;
        font-weight: 700;
      }
      .tmt-v10-trans::before { content: ' '; }
      .tmt-v10-block-trans {
        display: block;
        margin-top: .25em;
        padding: .35em .55em;
        color: #1d4ed8;
        font-weight: 700;
        background: rgba(37,99,235,.08);
        border-left: 3px solid #2563eb;
        border-radius: .35em;
      }
      @media (prefers-color-scheme: dark) {
        .tmt-v10-panel { color: #e5e7eb; background: rgba(15,23,42,.96); border-color: rgba(71,85,105,.8); }
        .tmt-v10-status, .tmt-v10-label { color: #94a3b8; }
        .tmt-v10-close, .tmt-v10-card { color: #e5e7eb; background: #020617; border-color: rgba(71,85,105,.8); }
        .tmt-v10-trans, .tmt-v10-block-trans { color: #93c5fd; }
        .tmt-v10-block-trans { background: rgba(37,99,235,.18); }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function ensurePanel() {
    ensureStyles();
    if (state.panel?.isConnected) return state.panel;

    const panel = document.createElement('aside');
    panel.className = 'tmt-v10-panel';
    panel.innerHTML = `
      <div class="tmt-v10-head">
        <div>
          <div class="tmt-v10-title">TMT Bridge Lens</div>
          <div class="tmt-v10-status">Ready</div>
        </div>
        <button class="tmt-v10-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="tmt-v10-progress"><span></span></div>
      <div class="tmt-v10-body">Select text or translate the page from the extension popup.</div>
    `;
    panel.querySelector('.tmt-v10-close').addEventListener('click', () => panel.remove());
    document.documentElement.appendChild(panel);
    state.panel = panel;
    state.status = panel.querySelector('.tmt-v10-status');
    state.body = panel.querySelector('.tmt-v10-body');
    state.progress = panel.querySelector('.tmt-v10-progress > span');
    return panel;
  }

  function setPanelStatus(message, progress = null) {
    ensurePanel();
    state.status.textContent = message;
    if (progress !== null) state.progress.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }

  function showPanelCards({ settings, original, translated, note = '' }) {
    ensurePanel();
    state.status.textContent = `${direction(settings)}${note ? ` · ${note}` : ''}`;
    state.progress.style.width = '100%';
    state.body.innerHTML = '';
    const originalCard = document.createElement('div');
    originalCard.className = 'tmt-v10-card';
    originalCard.innerHTML = `<span class="tmt-v10-label">Original</span><div class="tmt-v10-text"></div>`;
    originalCard.querySelector('.tmt-v10-text').textContent = original || '';

    const translatedCard = document.createElement('div');
    translatedCard.className = 'tmt-v10-card';
    translatedCard.innerHTML = `<span class="tmt-v10-label">Translation</span><div class="tmt-v10-text"></div>`;
    translatedCard.querySelector('.tmt-v10-text').textContent = translated || '';

    state.body.append(originalCard, translatedCard);
  }

  function isVisibleNode(node) {
    const parent = node.parentElement;
    if (!parent) return false;
    const style = window.getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = parent.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function shouldTranslateNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;
    const text = normalizeSpace(node.nodeValue);
    if (!text || text.length < 2 || !hasLetters(text)) return false;
    if (/^[\d\W_]+$/u.test(text)) return false;
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP_SELECTOR)) return false;
    return isVisibleNode(node);
  }

  function viewportDistance(node) {
    const rect = node.parentElement?.getBoundingClientRect?.();
    if (!rect) return Number.MAX_SAFE_INTEGER;
    if (rect.bottom >= 0 && rect.top <= window.innerHeight) return 0;
    if (rect.top > window.innerHeight) return rect.top - window.innerHeight;
    return Math.abs(rect.bottom);
  }

  function collectTextNodes() {
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldTranslateNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.sort((a, b) => viewportDistance(a) - viewportDistance(b));
    return nodes.slice(0, state.maxNodes);
  }

  function splitText(text) {
    const source = String(text || '');
    if (!source.trim()) return [];

    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
        const items = Array.from(segmenter.segment(source), item => item.segment);
        if (items.length) return items;
      } catch (_) {}
    }
    return source.match(/[^.!?।\n]+[.!?।]?|\n+/g) || [source];
  }

  function splitPadding(piece) {
    const match = String(piece).match(/^(\s*)([\s\S]*?)(\s*)$/);
    return { lead: match?.[1] || '', core: match?.[2] || '', tail: match?.[3] || '' };
  }

  function buildPlan(node) {
    const original = node.nodeValue || '';
    const parts = splitText(original).map(piece => {
      const { lead, core, tail } = splitPadding(piece);
      const text = normalizeSpace(core);
      return { piece, lead, core, tail, text, translatable: Boolean(text && hasLetters(text)) };
    });
    return { node, original, parts, sentences: parts.filter(part => part.translatable).map(part => part.text) };
  }

  function reconstruct(plan, map) {
    return plan.parts.map(part => {
      if (!part.translatable) return part.piece;
      return `${part.lead}${map.get(part.text) || part.core}${part.tail}`;
    }).join('');
  }

  function isBlockLike(element) {
    const display = window.getComputedStyle(element).display;
    return display === 'block' || display === 'list-item' || display === 'flex' || display === 'grid' || display === 'table-cell';
  }

  function applyTranslation(plan, translated, mode) {
    const node = plan.node;
    if (!node.parentNode || !translated || translated === plan.original) return false;

    if (mode === 'replace') {
      state.records.push({ type: 'replace', node, original: plan.original });
      node.nodeValue = translated;
      return true;
    }

    const parent = node.parentElement;
    const wrapper = document.createElement('span');
    wrapper.className = 'tmt-v10-wrap';

    if (parent && isBlockLike(parent) && normalizeSpace(plan.original).length > 42) {
      wrapper.appendChild(document.createTextNode(plan.original));
      const translation = document.createElement('span');
      translation.className = 'tmt-v10-block-trans';
      translation.textContent = translated;
      wrapper.appendChild(translation);
    } else {
      wrapper.appendChild(document.createTextNode(plan.original));
      const translation = document.createElement('span');
      translation.className = 'tmt-v10-trans';
      translation.textContent = translated;
      wrapper.appendChild(translation);
    }

    node.parentNode.replaceChild(wrapper, node);
    state.records.push({ type: 'bilingual', wrapper, original: plan.original });
    return true;
  }

  function restorePage() {
    for (let index = state.records.length - 1; index >= 0; index -= 1) {
      const record = state.records[index];
      if (record.type === 'replace' && record.node?.isConnected) {
        record.node.nodeValue = record.original;
      }
      if (record.type === 'bilingual' && record.wrapper?.isConnected) {
        record.wrapper.replaceWith(document.createTextNode(record.original));
      }
    }
    state.records = [];
    setPanelStatus('Original page restored', 100);
    return { ok: true, restored: true };
  }

  async function translatePage(settings) {
    if (state.running) throw new Error('A page translation is already running.');
    state.running = true;
    ensurePanel();
    restorePage();
    setPanelStatus(`Scanning page · ${direction(settings)}`, 5);

    try {
      const nodes = collectTextNodes();
      if (!nodes.length) {
        setPanelStatus('No visible translatable text found', 100);
        return { ok: true, translatedNodes: 0 };
      }

      const plans = nodes.map(buildPlan).filter(plan => plan.sentences.length);
      const allSentences = [...new Set(plans.flatMap(plan => plan.sentences))];
      const translations = new Map();
      const batchSize = 18;
      let translatedNodes = 0;

      for (let i = 0; i < allSentences.length; i += batchSize) {
        const slice = allSentences.slice(i, i + batchSize);
        const progress = 10 + Math.round((i / Math.max(1, allSentences.length)) * 70);
        setPanelStatus(`Translating ${Math.min(i + batchSize, allSentences.length)} / ${allSentences.length} sentences`, progress);
        const batch = await sendMessage({ type: 'TMT_TRANSLATE_BATCH', payload: { texts: slice, settings } });
        for (const item of batch.items || []) translations.set(item.input, item.output);
      }

      for (const plan of plans) {
        const translated = reconstruct(plan, translations);
        if (applyTranslation(plan, translated, settings.mode)) translatedNodes += 1;
      }

      setPanelStatus(`Done · ${translatedNodes} chunks translated`, 100);
      state.body.innerHTML = `<div class="tmt-v10-card"><span class="tmt-v10-label">Page translation</span><div class="tmt-v10-text">${translatedNodes} visible text chunks translated. Use Restore page to go back.</div></div>`;
      return { ok: true, translatedNodes };
    } finally {
      state.running = false;
    }
  }

  async function translateSelection(settings, selectedText = '') {
    const text = String(selectedText || window.getSelection()?.toString() || '').trim();
    if (!text) {
      ensurePanel();
      setPanelStatus('No text selected', 100);
      state.body.textContent = 'Highlight text on the webpage, then click Translate selection.';
      return { ok: true, translated: false };
    }
    setPanelStatus(`Translating selection · ${direction(settings)}`, 30);
    const result = await sendMessage({ type: 'TMT_TRANSLATE_BLOCK', payload: { text, settings } });
    showPanelCards({ settings, original: text, translated: result.output || '', note: 'selection' });
    return { ok: true, translated: true };
  }

  runtime.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      if (message?.type === 'TMT_PING') return { ok: true };
      if (message?.type !== 'TMT_CONTENT_ACTION') return { ok: false, error: 'Unknown content message.' };

      const payload = message.payload || {};
      const settings = payload.settings || { srcLang: 'en', tgtLang: 'tmg', mode: 'bilingual' };
      if (settings.srcLang === settings.tgtLang) throw new Error('Choose different source and destination languages.');

      if (payload.action === 'page') return translatePage(settings);
      if (payload.action === 'selection') return translateSelection(settings, payload.selectedText || '');
      if (payload.action === 'restore') return restorePage();
      throw new Error(`Unknown page action: ${payload.action}`);
    })().then(sendResponse).catch(error => {
      ensurePanel();
      setPanelStatus(error.message || String(error), 100);
      sendResponse({ ok: false, error: error.message || String(error) });
    });
    return true;
  });
})();
