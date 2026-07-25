import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupCopyWebsite } from './copy-website.js';

function createMockEnv() {
  const messageListeners = [];
  const activeTab = { id: 42, url: 'https://example.com/page' };

  const browser = {
    tabs: {
      query: vi.fn().mockResolvedValue([activeTab]),
    },
    scripting: {
      executeScript: vi.fn().mockResolvedValue(undefined),
    },
    runtime: {
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  };

  const chrome = {};
  return { browser, chrome, messageListeners, activeTab };
}

describe('setupCopyWebsite', () => {
  let env;
  beforeEach(() => { env = createMockEnv(); });

  it('injects extractor on EXTRACT_PAGE message', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(env.browser.tabs.query).toHaveBeenCalledWith({ active: true });
    expect(env.browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['content/extractor.bundle.js'],
      world: 'ISOLATED',
    });
  });

  it('forwards EXTRACT_RESULT to sidebar', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    const result = { title: 'Test', markdown: '# Test\ncontent', url: 'https://example.com' };
    await handler({ type: 'EXTRACT_RESULT', result });

    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT_RESULT', result });
  });

  it('forwards EXTRACT_RESULT errors', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_RESULT', error: 'boom' });

    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT_RESULT', error: 'boom' });
  });

  it('ignores unrelated messages', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'SOMETHING_ELSE' });

    expect(env.browser.scripting.executeScript).not.toHaveBeenCalled();
    expect(env.browser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('skips extraction on chrome:// URLs', async () => {
    env.browser.tabs.query = vi.fn().mockResolvedValue([{ id: 42, url: 'chrome://newtab/' }]);
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(env.browser.scripting.executeScript).not.toHaveBeenCalled();
    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT_RESULT', error: 'No extractable page found' });
  });

  it('skips extraction on chrome-extension:// URLs', async () => {
    env.browser.tabs.query = vi.fn().mockResolvedValue([{ id: 42, url: 'chrome-extension://abc123/popup.html' }]);
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(env.browser.scripting.executeScript).not.toHaveBeenCalled();
    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT_RESULT', error: 'No extractable page found' });
  });

  it('skips extraction on about: URLs', async () => {
    env.browser.tabs.query = vi.fn().mockResolvedValue([{ id: 42, url: 'about:blank' }]);
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(env.browser.scripting.executeScript).not.toHaveBeenCalled();
    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT_RESULT', error: 'No extractable page found' });
  });

  it('picks first extractable tab when multiple active tabs exist', async () => {
    env.browser.tabs.query = vi.fn().mockResolvedValue([
      { id: 1, url: 'chrome://newtab/' },
      { id: 2, url: 'https://example.com/page' },
      { id: 3, url: 'chrome-extension://xyz/popup.html' },
    ]);
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(env.browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 2 },
      files: ['content/extractor.bundle.js'],
      world: 'ISOLATED',
    });
  });

  it('detects PDF URL and injects fetch script (not extractor)', async () => {
    env.browser.tabs.query = vi.fn().mockResolvedValue([{ id: 99, url: 'https://example.com/doc.pdf' }]);
    const executeScriptMock = vi.fn().mockResolvedValue([{ result: { base64: 'JVBERi0=', filename: 'doc.pdf', mimeType: 'application/pdf' } }]);
    env.browser.scripting.executeScript = executeScriptMock;
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(executeScriptMock).toHaveBeenCalled();
    const call = executeScriptMock.mock.calls[0][0];
    expect(call.func).toBeDefined();
    expect(call.world).toBe('ISOLATED');
    expect(call.target.tabId).toBe(99);
    expect(call.files).toBeUndefined();
  });

  it('detects file:// PDF URL', async () => {
    env.browser.tabs.query = vi.fn().mockResolvedValue([{ id: 99, url: 'file:///home/user/doc.pdf' }]);
    const executeScriptMock = vi.fn().mockResolvedValue([{ result: { base64: 'JVBERi0=', filename: 'doc.pdf', mimeType: 'application/pdf' } }]);
    env.browser.scripting.executeScript = executeScriptMock;
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(executeScriptMock).toHaveBeenCalled();
    const call = executeScriptMock.mock.calls[0][0];
    expect(call.func).toBeDefined();
    expect(call.files).toBeUndefined();
  });

  it('sends PDF result to sidebar', async () => {
    env.browser.tabs.query = vi.fn().mockResolvedValue([{ id: 99, url: 'https://example.com/doc.pdf' }]);
    const executeScriptMock = vi.fn().mockResolvedValue([{ result: { base64: 'JVBERi0=', filename: 'doc.pdf', mimeType: 'application/pdf' } }]);
    env.browser.scripting.executeScript = executeScriptMock;
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'EXTRACT_RESULT',
      pdf: { base64: 'JVBERi0=', filename: 'doc.pdf', mimeType: 'application/pdf' }
    });
  });
});