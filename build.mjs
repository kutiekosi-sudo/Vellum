// Builds Learnr into dist/ (committed, so Netlify only has to serve it).
//
//   node build.mjs          production build  -> dist/
//   node build.mjs --test   offline test build -> .test-tmp/dist  (uses the fake backend, never deployed)

import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const test = process.argv.includes('--test');
const out = path.join(root, test ? '.test-tmp/dist' : 'dist');
const buildId = Date.now().toString(36);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// In the test build the real Firebase backend is swapped for the in-memory fake.
const swapBackend = {
  name: 'swap-backend',
  setup(b) {
    if (!test) return;
    b.onResolve({ filter: /\/real\.js$/ }, (args) => (
      args.importer.endsWith(path.join('src', 'backend', 'index.js'))
        ? { path: path.join(root, 'src/backend/fake.js') }
        : undefined
    ));
  },
};

const result = await build({
  entryPoints: { app: path.join(root, 'src/main.jsx') },
  outdir: out,
  bundle: true,
  format: 'esm',
  target: ['es2020', 'chrome90', 'safari15'],
  jsx: 'automatic',
  minify: !test,
  sourcemap: test ? 'inline' : false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  external: ['https://*'], // Firebase is loaded from Google's CDN at run time
  loader: { '.css': 'css' },
  plugins: [swapBackend],
  metafile: true,
  logLevel: 'info',
});

// Static files (manifest, icons, service worker). The service worker gets this build's id so old caches are dropped.
const pub = path.join(root, 'public');
if (existsSync(pub)) {
  for (const name of await readdir(pub)) await cp(path.join(pub, name), path.join(out, name), { recursive: true });
  const sw = path.join(out, 'sw.js');
  if (existsSync(sw)) await writeFile(sw, (await readFile(sw, 'utf8')).replaceAll('__BUILD_ID__', buildId));
}

// index.html from the template
const tpl = await readFile(path.join(root, 'src/index.template.html'), 'utf8');
await writeFile(path.join(out, 'index.html'), tpl.replaceAll('__BUILD_ID__', buildId));

const size = Object.entries(result.metafile.outputs).filter(([k]) => /\.(js|css)$/.test(k))
  .map(([k, v]) => `${path.basename(k)} ${(v.bytes / 1024).toFixed(0)} KB`).join(', ');
console.log(`Built ${test ? 'TEST ' : ''}Learnr ${buildId} -> ${path.relative(root, out)} (${size})`);
