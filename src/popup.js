const runtime = typeof browser !== 'undefined' ? browser : chrome;

const LANG_LABEL = { en: 'English', ne: 'Nepali', tmg: 'Tamang' };
const els = {
  src: document.getElementById('src-lang'),
  tgt: document.getElementById('tgt-lang'),
  swap: document.getElementById('swap'),
  translatePage: document.getElementById('translate-page'),
  translateSelection: document.getElementById('translate-selection'),
  restore: document.getElementById('restore'),
  quickText: document.getElementById('quick-text'),
  quickTranslate: document.getElementById('quick-translate'),
  quickOutput: document.getElementById('quick-output'),
  tokenWarning: document.getElementById('token-warning'),
  openOptions: document.getElementById('open-options'),
  openOptionsTop: document.getElementById('open-options-top'),
  status: document.getElementById('status')
};

function storageSet(area, value) {
  return new Promise(resolve => runtime.storage[area].set(value, resolve));
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    runtime.runtime.sendMessage(message, response => {
      const err = runtime.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!response) return reject(new Error('Extension worker did not respond.'));
      if (response.ok === false) return reject(new Error(response.error || 'Action failed.'));
      resolve(response);
    });
  });
}

function setStatus(message) {
  els.status.textContent = message;
}

function getMode() {
  return document.querySelector('input[name="mode"]:checked')?.value || 'bilingual';
}

function setMode(mode) {
  const input = document.querySelector(`input[name="mode"][value="${mode}"]`);
  if (input) input.checked = true;
}

function settings() {
  return { srcLang: els.src.value, tgtLang: els.tgt.value, mode: getMode() };
}

function directionText() {
  return `${LANG_LABEL[els.src.value]} → ${LANG_LABEL[els.tgt.value]}`;
}

function ensureValidPair() {
  if (els.src.value !== els.tgt.value) return;
  els.tgt.value = els.src.value === 'en' ? 'tmg' : 'en';
}

async function saveSettings() {
  ensureValidPair();
  const s = settings();
  await storageSet('sync', s);
  return s;
}

async function load() {
  try {
    const status = await sendMessage({ type: 'TMT_GET_STATUS' });
    const s = status.settings || {};
    els.src.value = s.srcLang || 'en';
    els.tgt.value = s.tgtLang || 'tmg';
    setMode(s.mode || 'bilingual');
    ensureValidPair();
    els.tokenWarning.classList.toggle('hidden', Boolean(status.hasToken));
    setStatus(status.hasToken ? `${directionText()} · ${status.cacheSize || 0} cached` : 'Add token to start');
  } catch (error) {
    setStatus(error.message);
  }
}

async function run(action) {
  const s = await saveSettings();
  return sendMessage({ type: 'TMT_RUN_ACTION', payload: { action, settings: s } });
}

[els.src, els.tgt, ...document.querySelectorAll('input[name="mode"]')].forEach(input => {
  input.addEventListener('change', async () => {
    try {
      await saveSettings();
      setStatus(`${directionText()} saved`);
    } catch (error) {
      setStatus(error.message);
    }
  });
});

els.swap.addEventListener('click', async () => {
  const oldSrc = els.src.value;
  els.src.value = els.tgt.value;
  els.tgt.value = oldSrc;
  await saveSettings();
  setStatus(`Swapped: ${directionText()}`);
});

els.translatePage.addEventListener('click', async () => {
  try {
    setStatus(`Translating page: ${directionText()}…`);
    const result = await run('page');
    setStatus(`Done · ${result.translatedNodes || 0} text chunks`);
  } catch (error) {
    setStatus(error.message);
  }
});

els.translateSelection.addEventListener('click', async () => {
  try {
    setStatus(`Translating selection: ${directionText()}…`);
    await run('selection');
    setStatus('Selection translated');
  } catch (error) {
    setStatus(error.message);
  }
});

els.restore.addEventListener('click', async () => {
  try {
    await run('restore');
    setStatus('Original page restored');
  } catch (error) {
    setStatus(error.message);
  }
});

els.quickTranslate.addEventListener('click', async () => {
  try {
    const text = els.quickText.value.trim();
    if (!text) {
      setStatus('Type a sentence first.');
      return;
    }
    const s = await saveSettings();
    els.quickOutput.textContent = 'Translating…';
    const result = await sendMessage({ type: 'TMT_TRANSLATE_BLOCK', payload: { text, settings: s } });
    els.quickOutput.textContent = result.output || '(empty translation)';
    setStatus('Text translated');
  } catch (error) {
    els.quickOutput.textContent = error.message;
    setStatus(error.message);
  }
});

function openOptions() {
  runtime.runtime.openOptionsPage();
}

els.openOptions.addEventListener('click', openOptions);
els.openOptionsTop.addEventListener('click', openOptions);
load();
