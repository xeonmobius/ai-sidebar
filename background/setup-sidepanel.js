export function setupSidePanel(browser, chrome, triggerUpload) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  const enabledTabs = new Set();

  browser.action.onClicked.addListener(async (tab) => {
    const wasEnabled = enabledTabs.has(tab.id);
    if (wasEnabled) {
      enabledTabs.delete(tab.id);
      await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false });
    } else {
      enabledTabs.add(tab.id);
      await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: true });
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
    triggerUpload();
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    if (enabledTabs.has(tabId)) {
      enabledTabs.delete(tabId);
      await chrome.sidePanel.setOptions({ tabId, enabled: true }).catch(() => {});
    }
  });
}
