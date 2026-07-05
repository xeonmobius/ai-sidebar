import browser from 'webextension-polyfill';

// On sidebar load, tell background to extract the active tab and upload to Gemini.
// Wait a bit for the Gemini iframe to load, then trigger.
async function init() {
  // Give the Gemini iframe time to load so the injector is ready
  await new Promise((r) => setTimeout(r, 2000));
  try {
    await browser.runtime.sendMessage({ type: 'TRIGGER_UPLOAD' });
  } catch {
    // background might not be ready yet; retry once
    await new Promise((r) => setTimeout(r, 2000));
    await browser.runtime.sendMessage({ type: 'TRIGGER_UPLOAD' }).catch(() => {});
  }
}

init();
