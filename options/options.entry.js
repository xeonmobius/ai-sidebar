import browser from 'webextension-polyfill';

const DEFAULTS = { autoAttach: true, maxChars: 500000, preferFileType: 'md', tempChat: false };

const el = {
  auto: document.getElementById('auto-attach'),
  temp: document.getElementById('temp-chat'),
  max: document.getElementById('max-chars'),
  type: document.getElementById('file-type'),
  save: document.getElementById('save'),
  saved: document.getElementById('saved'),
};

(async () => {
  const result = await browser.storage.local.get('prefs');
  const prefs = { ...DEFAULTS, ...result.prefs };
  el.auto.checked = !!prefs.autoAttach;
  el.temp.checked = !!prefs.tempChat;
  el.max.value = prefs.maxChars;
  el.type.value = prefs.preferFileType;
})();

el.save.addEventListener('click', async () => {
  const prefs = {
    autoAttach: el.auto.checked,
    tempChat: el.temp.checked,
    maxChars: Number(el.max.value) || DEFAULTS.maxChars,
    preferFileType: el.type.value,
  };
  await browser.storage.local.set({ prefs });
  el.saved.textContent = 'Saved.';
  setTimeout(() => (el.saved.textContent = ''), 1500);
});
