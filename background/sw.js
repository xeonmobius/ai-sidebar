import browser from 'webextension-polyfill';
import { setupSidePanel } from './setup-sidepanel.js';
import { setupCopyWebsite } from './copy-website.js';

async function setupSessionRules() {
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) return;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1],
      addRules: [{
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'X-Frame-Options', operation: 'remove' },
            { header: 'Content-Security-Policy', operation: 'remove' },
            { header: 'Content-Security-Policy-Report-Only', operation: 'remove' },
          ],
        },
        condition: {
          urlFilter: '||gemini.google.com',
          resourceTypes: ['sub_frame'],
        },
      }],
    });
    console.log('[gemini-sidebar] session DNR rules registered');
  } catch (e) {
    console.warn('[gemini-sidebar] session DNR setup failed:', e);
  }
}

setupSessionRules();
setupCopyWebsite(browser, chrome);

const hasSidePanel = typeof chrome !== 'undefined' && chrome?.sidePanel;

if (hasSidePanel) {
  setupSidePanel(browser, chrome);
} else {
  browser.action.onClicked.addListener(() => {
    browser.sidebarAction.open();
  });
}
