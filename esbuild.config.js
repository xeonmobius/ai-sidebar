import esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';

const ENTRY_POINTS = [
  { in: 'background/sw.js', out: 'background/sw.js' },
  { in: 'content/extractor.entry.js', out: 'content/extractor.bundle.js' },
  { in: 'content/gemini-injector.entry.js', out: 'content/gemini-injector.bundle.js' },
  { in: 'sidebar/sidebar.entry.js', out: 'sidebar/sidebar.bundle.js' },
  { in: 'options/options.entry.js', out: 'options/options.bundle.js' },
];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

for (const ep of ENTRY_POINTS) {
  esbuild.buildSync({
    entryPoints: [ep.in],
    bundle: true,
    outfile: `dist/${ep.out}`,
    format: 'iife',
    target: ['chrome120', 'firefox128'],
    legalComments: 'none',
  });
}

for (const p of [
  'manifest.json',
  'sidebar/sidebar.html',
  'sidebar/sidebar.css',
  'options/options.html',
  'rules/remove_headers.json',
]) {
  cpSync(p, `dist/${p}`);
}

mkdirSync('dist/icons', { recursive: true });
for (const sz of [16, 48, 128]) {
  if (existsSync(`icons/icon-${sz}.png`)) {
    cpSync(`icons/icon-${sz}.png`, `dist/icons/icon-${sz}.png`);
  }
}

console.log('Build complete → dist/');
