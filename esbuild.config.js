import esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const ENTRY_POINTS = [
  { in: 'background/sw.js', out: 'background/sw.js' },
  { in: 'content/extractor.entry.js', out: 'content/extractor.bundle.js' },
  { in: 'content/gemini-injector.entry.js', out: 'content/gemini-injector.bundle.js' },
  { in: 'sidebar/sidebar.entry.js', out: 'sidebar/sidebar.bundle.js' },
  { in: 'options/options.entry.js', out: 'options/options.bundle.js' },
];

const STATIC_ASSETS = [
  'sidebar/sidebar.html',
  'sidebar/sidebar.css',
  'options/options.html',
  'rules/remove_headers.json',
];

const ICON_SIZES = [16, 48, 128];

rmSync('dist', { recursive: true, force: true });

const chromeManifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

const firefoxManifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
delete firefoxManifest.background.service_worker;
firefoxManifest.background.scripts = ['background/sw.js'];
firefoxManifest.permissions = firefoxManifest.permissions.filter((p) => p !== 'sidePanel');
// Keep browser_specific_settings for Firefox (gecko ID + strict_min_version)

function buildFor(target, manifest) {
  const outDir = `dist/${target}`;
  mkdirSync(outDir, { recursive: true });

  for (const ep of ENTRY_POINTS) {
    esbuild.buildSync({
      entryPoints: [ep.in],
      bundle: true,
      outfile: `${outDir}/${ep.out}`,
      format: 'iife',
      target: [target === 'chrome' ? 'chrome120' : 'firefox128'],
      legalComments: 'none',
    });
  }

  for (const p of STATIC_ASSETS) {
    cpSync(p, `${outDir}/${p}`);
  }

  mkdirSync(`${outDir}/icons`, { recursive: true });
  for (const sz of ICON_SIZES) {
    if (existsSync(`icons/icon-${sz}.png`)) {
      cpSync(`icons/icon-${sz}.png`, `${outDir}/icons/icon-${sz}.png`);
    }
  }

  writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
}

buildFor('chrome', chromeManifest);
buildFor('firefox', firefoxManifest);

console.log('Build complete → dist/chrome/ and dist/firefox/');
