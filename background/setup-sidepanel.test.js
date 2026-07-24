import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupSidePanel } from './setup-sidepanel.js';

function createMockEnv() {
  const actionListeners = [];
  const tabRemovedListeners = [];

  const sidePanel = {
    setPanelBehavior: vi.fn(),
    setOptions: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue(undefined),
  };

  const browser = {
    action: { onClicked: { addListener: (fn) => actionListeners.push(fn) } },
    tabs: {
      onRemoved: { addListener: (fn) => tabRemovedListeners.push(fn) },
      onActivated: { addListener: () => {} },
    },
  };

  const triggerUpload = vi.fn();

  const chrome = { sidePanel };

  return { chrome, browser, sidePanel, triggerUpload, actionListeners, tabRemovedListeners };
}

describe('setupSidePanel', () => {
  let env;

  beforeEach(() => { env = createMockEnv(); });

  it('disables auto-open on action click', () => {
    setupSidePanel(env.browser, env.chrome, env.triggerUpload);
    expect(env.sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
  });

  it('enables and opens panel when clicking icon on disabled tab', async () => {
    setupSidePanel(env.browser, env.chrome, env.triggerUpload);
    const clickHandler = env.actionListeners[0];
    await clickHandler({ id: 42, windowId: 7 });

    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: true });
    expect(env.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
    expect(env.triggerUpload).toHaveBeenCalled();
  });

  it('disables panel when clicking icon on enabled tab', async () => {
    setupSidePanel(env.browser, env.chrome, env.triggerUpload);
    const clickHandler = env.actionListeners[0];
    await clickHandler({ id: 42, windowId: 7 });
    env.sidePanel.setOptions.mockClear();
    env.sidePanel.open.mockClear();
    await clickHandler({ id: 42, windowId: 7 });

    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: false });
    expect(env.sidePanel.open).not.toHaveBeenCalled();
  });

  it('resets setOptions on tab removal if tab was enabled', async () => {
    setupSidePanel(env.browser, env.chrome, env.triggerUpload);
    const clickHandler = env.actionListeners[0];
    await clickHandler({ id: 42, windowId: 7 });
    env.sidePanel.setOptions.mockClear();

    const removeHandler = env.tabRemovedListeners[0];
    await removeHandler(42);

    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: true });
  });

  it('does not reset setOptions on tab removal if tab was not enabled', async () => {
    setupSidePanel(env.browser, env.chrome, env.triggerUpload);
    const removeHandler = env.tabRemovedListeners[0];
    await removeHandler(99);
    expect(env.sidePanel.setOptions).not.toHaveBeenCalled();
  });

  it('treats each tab independently', async () => {
    setupSidePanel(env.browser, env.chrome, env.triggerUpload);
    const clickHandler = env.actionListeners[0];
    await clickHandler({ id: 1, windowId: 7 });
    env.sidePanel.setOptions.mockClear();
    await clickHandler({ id: 2, windowId: 7 });

    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 2, enabled: true });
    expect(env.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
  });
});
