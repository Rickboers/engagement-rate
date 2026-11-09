const DEFAULTS = globalThis.__erDefaults;
chrome.storage.sync.get(DEFAULTS, (s) => {
  for (const [k, v] of Object.entries(s)) {
    const el = document.getElementById(k);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
    el.addEventListener('change', () => chrome.storage.sync.set({ [k]: el.type === 'checkbox' ? el.checked : el.value }));
  }
});
