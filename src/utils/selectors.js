export function waitForSelector(selectors, { timeout = 8000, root = document, interval = 100 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      for (const sel of selectors) {
        const el = root.querySelector(sel);
        if (el) return resolve(el);
      }
      if (Date.now() - start >= timeout) {
        return reject(new Error('selector not found'));
      }
      setTimeout(tick, interval);
    };
    tick();
  });
}
