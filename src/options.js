const usesBrowserPromises = typeof browser !== 'undefined';
const runtime = usesBrowserPromises ? browser : chrome;

const PROFILE = {
  fast: { maxConcurrentRequests: 3, requestDelayMs: 80 },
  balanced: { maxConcurrentRequests: 2, requestDelayMs: 140 },
  gentle: { maxConcurrentRequests: 1, requestDelayMs: 260 }
};

const DEFAULTS = {
  apiUrl: 'https://tmt.ilprl.ku.edu.np/lang-translate',
  cacheLimit: 1800,
  maxConcurrentRequests: 3,
  requestDelayMs: 80
};

const els = {
  form: document.getElementById('settings'),
  token: document.getElementById('token'),
  toggleToken: document.getElementById('toggle-token'),
  apiUrl: document.getElementById('api-url'),
  profile: document.getElementById('profile'),
  cacheLimit: document.getElementById('cache-limit'),
  testApi: document.getElementById('test-api'),
  clearCache: document.getElementById('clear-cache'),
  status: document.getElementById('status')
};

function storageGet(area, keys) {
  if (usesBrowserPromises) return runtime.storage[area].get(keys);
  return new Promise(resolve => runtime.storage[area].get(keys, resolve));
}
function storageSet(area, value) {
  if (usesBrowserPromises) return runtime.storage[area].set(value);
  return new Promise(resolve => runtime.storage[area].set(value, resolve));
}
async function sendMessage(message) {
  const response = usesBrowserPromises
    ? await runtime.runtime.sendMessage(message)
    : await new Promise((resolve, reject) => {
      runtime.runtime.sendMessage(message, result => {
        const err = runtime.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve(result);
      });
    });
  if (!response) throw new Error('Extension worker did not respond.');
  if (response.ok === false) throw new Error(response.error || 'Action failed.');
  return response;
}
function setStatus(text) { els.status.textContent = text; }

function profileFromSettings(settings) {
  return Object.entries(PROFILE).find(([, value]) => (
    value.maxConcurrentRequests === Number(settings.maxConcurrentRequests) &&
    value.requestDelayMs === Number(settings.requestDelayMs)
  ))?.[0] || 'fast';
}

async function load() {
  const sync = await storageGet('sync', ['apiUrl', 'cacheLimit', 'maxConcurrentRequests', 'requestDelayMs']);
  const local = await storageGet('local', ['tmtApiToken']);
  els.apiUrl.value = sync.apiUrl || DEFAULTS.apiUrl;
  els.cacheLimit.value = sync.cacheLimit || DEFAULTS.cacheLimit;
  els.profile.value = profileFromSettings({ ...DEFAULTS, ...sync });
  els.token.value = local.tmtApiToken || '';
  setStatus(local.tmtApiToken ? 'Token loaded. Settings ready.' : 'Paste your team token, then save.');
}

async function save() {
  const profile = PROFILE[els.profile.value] || PROFILE.fast;
  const settings = {
    apiUrl: els.apiUrl.value.trim() || DEFAULTS.apiUrl,
    cacheLimit: Math.max(100, Math.min(5000, Number(els.cacheLimit.value) || DEFAULTS.cacheLimit)),
    ...profile
  };
  await storageSet('sync', settings);
  await storageSet('local', { tmtApiToken: els.token.value.trim() });
  setStatus(`Saved. ${els.profile.options[els.profile.selectedIndex].textContent}.`);
}

els.form.addEventListener('submit', async event => {
  event.preventDefault();
  try { await save(); } catch (error) { setStatus(error.message); }
});

els.toggleToken.addEventListener('click', () => {
  const show = els.token.type === 'password';
  els.token.type = show ? 'text' : 'password';
  els.toggleToken.textContent = show ? 'Hide' : 'Show';
});

els.testApi.addEventListener('click', async () => {
  try {
    setStatus('Saving and testing API…');
    await save();
    const result = await sendMessage({ type: 'TMT_TEST_TOKEN' });
    setStatus(`API works. Sample output: ${result.result?.output || '(empty)'}`);
  } catch (error) {
    setStatus(`Test failed: ${error.message}`);
  }
});

els.clearCache.addEventListener('click', async () => {
  try {
    const result = await sendMessage({ type: 'TMT_CLEAR_CACHE' });
    setStatus(`Cache cleared (${result.cacheSize || 0} items).`);
  } catch (error) {
    setStatus(error.message);
  }
});

load().catch(error => setStatus(error.message));
