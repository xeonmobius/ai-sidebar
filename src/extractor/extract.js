import { stripNoise } from './strip-noise.js';
import { buildTurndownService } from './turndown-config.js';
import { truncate } from '../utils/truncate.js';

const MIN_MEANINGFUL_MD = 50;
const DEFAULT_MAX_CHARS = 500000;

export function extractMarkdown({ html, title, url, fallbackText = '', maxChars = DEFAULT_MAX_CHARS }) {
  const cleanTitle = (title && title.trim()) || 'page';
  let md = '';
  try {
    md = buildTurndownService().turndown(stripNoise(html));
  } catch {
    md = '';
  }
  if (!md || md.trim().length < MIN_MEANINGFUL_MD) {
    md = fallbackText || '';
  }
  const header = `# ${cleanTitle}\nSource: ${url || ''}\n\n`;
  return {
    title: cleanTitle,
    url: url || '',
    markdown: truncate(header + md, maxChars),
  };
}
