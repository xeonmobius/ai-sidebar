const NOISE_SELECTORS = [
  'script', 'style', 'nav', 'noscript', 'svg', 'iframe',
  'template', 'header', 'footer',
];

export function stripNoise(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const sel of NOISE_SELECTORS) {
    doc.querySelectorAll(sel).forEach((el) => el.remove());
  }
  return doc.body ? doc.body.innerHTML : '';
}
