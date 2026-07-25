import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupSidePanel } from './setup-sidepanel.js';

function createMockEnv() {
  const actionListeners = [];
  const tabRemovedListeners = [];
  const tabActivatedListeners = [];
  const sessionStore = {};

  const sidePanel = {
    setPanelBehavior: vi.fn(),
    setOptions: vi.fn().mockResolvedValue(undefined),
  };

  const browser = {
    action: { onClicked: { addListener: (fn) => actionListeners.push(fn) } },
    tabs: {
      onRemoved: { addListener: (fn) => tabRemovedListeners.push(fn) },
      onActivated: { addListener: (fn) => tabActivatedListeners.push(fn) },
    },
    storage: {
      session: {
        get: vi.fn((key) => Promise.resolve(sessionStore[key] ? { [key]: sessionStore[key] } : {})),
        set: vi.fn((obj) => { Object.assign(sessionStore, obj); return Promise.resolve(); }),
      },
    },
  };

  const chrome = { sidePanel };
  return { chrome, browser, sidePanel, actionListeners, tabRemovedListeners, tabActivatedListeners };
}

describe('setupSidePanel', () => {
  let env;
  beforeEach(() => { env = createMockEnv(); });

  it('enables openPanelOnActionClick', () => {
    setupSidePanel(env.browser, env.chrome);
    expect(env.sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });

  it('enables tab on first click', () => {
    setupSidePanel(env.browser, env.chrome);
    env.actionListeners[0]({ id: 42, windowId: 1 });
    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, path: 'sidebar/sidebar.html', enabled: true });
  });

  it('disables tab on second click (toggle off)', () => {
    setupSidePanel(env.browser, env.chrome);
    env.actionListeners[0]({ id: 42, windowId: 1 });
    env.sidePanel.setOptions.mockClear();
    env.actionListeners[0]({ id: 42, windowId: 1 });
    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, path: 'sidebar/sidebar.html', enabled: false });
  });

  it('hides panel on switch to non-enabled tab (with path set)', () => {
    setupSidePanel(env.browser, env.chrome);
    env.tabActivatedListeners[0]({ tabId: 99 });
    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 99, path: 'sidebar/sidebar.html', enabled: false });
  });

  it('shows panel on switch to enabled tab', () => {
    setupSidePanel(env.browser, env.chrome);
    env.actionListeners[0]({ id: 42, windowId: 1 });
    env.sidePanel.setOptions.mockClear();
    env.tabActivatedListeners[0]({ tabId: 42 });
    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, path: 'sidebar/sidebar.html', enabled: true });
  });

  it('sets path even when no tabs are enabled', () => {
    setupSidePanel(env.browser, env.chrome);
    env.tabActivatedListeners[0]({ tabId: 1 });
    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 1, path: 'sidebar/sidebar.html', enabled: false });
  });
});
