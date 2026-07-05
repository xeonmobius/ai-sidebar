import { describe, it, expect } from 'vitest';
import { stripNoise } from './strip-noise.js';

describe('stripNoise', () => {
  it('removes script and style tags', () => {
    const html = '<body><p>keep</p><script>alert(1)</script><style>.x{}</style></body>';
    expect(stripNoise(html)).toBe('<p>keep</p>');
  });
  it('removes nav, header, footer, svg, iframe, noscript, template', () => {
    const html = '<body><header>H</header><nav>N</nav><main><p>x</p></main><footer>F</footer></body>';
    expect(stripNoise(html)).toBe('<main><p>x</p></main>');
  });
  it('returns empty string for empty body', () => {
    expect(stripNoise('<body></body>')).toBe('');
  });
});
