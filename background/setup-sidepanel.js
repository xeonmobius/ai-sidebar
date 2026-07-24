const PANEL_PATH = 'sidebar/sidebar.html';

export function setupSidePanel(browser, chrome, triggerUpload) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const enabledTabs = new Set();

  browser.storage.session.get('enabledTabs').then((data) => {
    if (data.enabledTabs) {
      for (const id of data.enabledTabs) enabledTabs.add(id);
    }
  }).catch(() => {});

  function persistTabs() {
    browser.storage.session.set({ enabledTabs: [...enabledTabs] }).catch(() => {});
  }

  browser.action.onClicked.addListener((tab) => {
    if (enabledTabs.has(tab.id)) {
      enabledTabs.delete(tab.id);
      persistTabs();
      chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false });
    } else {
      enabledTabs.add(tab.id);
      persistTabs();
      chrome.sidePanel.setOptions({ tabId: tab.id, path: PANEL_PATH, enabled: true });
      triggerUpload();
    }
  });

  browser.tabs.onActivated.addListener((activeInfo) => {
    if (enabledTabs.size === 0) return;
    if (enabledTabs.has(activeInfo.tabId)) {
      chrome.sidePanel.setOptions({ tabId: activeInfo.tabId, path: PANEL_PATH, enabled: true });
    } else {
      chrome.sidePanel.setOptions({ tabId: activeInfo.tabId, enabled: false });
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    if (enabledTabs.has(tabId)) {
      enabledTabs.delete(tabId);
      persistTabs();
    }
  });
}
