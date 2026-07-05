import TurndownService from 'turndown';
import * as turndownPluginGfm from 'turndown-plugin-gfm';

export function buildTurndownService() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
  });
  td.use(turndownPluginGfm.gfm);
  return td;
}
