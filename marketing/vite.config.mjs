// parkflows.in marketing site (002 T6, tech design "Marketing site parkflows.in").
// Static multi-page build: plain HTML + the shared design-system CSS, fonts and logo
// from src/design-system/. No React, no Tailwind, no new dependency.
//   npm run build:marketing  ->  dist-marketing/
//
// Two small build-time helpers (transformIndexHtml), so the HTML stays plain:
//   <!-- @partial header -->        -> marketing/partials/header.html (shared header / footer)
//   ~ds/brand/x.svg                 -> the right relative path from this page to src/design-system/
//   <i data-icon="mail"></i>        -> the lucide icon of that name as inline SVG, read from the
//                                      already-installed lucide-react package (same icons as the console)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const dsDir = path.resolve(here, '../src/design-system');
const lucideDir = path.resolve(here, '../node_modules/lucide-react/dist/esm/icons');

function lucideSvg(name, extraClass) {
  const file = path.join(lucideDir, `${name}.js`);
  if (!fs.existsSync(file)) throw new Error(`marketing: unknown lucide icon "${name}"`);
  const m = fs.readFileSync(file, 'utf8').match(/const __iconNode = (\[[\s\S]*?\]);\n/);
  if (!m) throw new Error(`marketing: cannot read lucide icon "${name}"`);
  // The icon node is a plain array literal of [tag, attrs] pairs in the installed package.
  const node = new Function(`return ${m[1]};`)();
  const inner = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('');
  const cls = ['pf-icon', extraClass].filter(Boolean).join(' ');
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
}

function marketingHtml() {
  return {
    name: 'parkflows-marketing-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        let out = html.replace(/<!--\s*@partial\s+([\w-]+)\s*-->/g, (_, name) =>
          fs.readFileSync(path.join(here, 'partials', `${name}.html`), 'utf8'));
        const rel = path.relative(path.dirname(ctx.filename), dsDir).split(path.sep).join('/');
        out = out.replaceAll('~ds/', `${rel}/`);
        out = out.replace(/<i data-icon="([\w-]+)"(?: class="([^"]*)")?><\/i>/g, (_, name, cls) => lucideSvg(name, cls));
        return out;
      },
    },
  };
}

export default defineConfig({
  root: here,
  base: '/',
  publicDir: path.join(here, 'public'),
  plugins: [marketingHtml()],
  build: {
    outDir: path.resolve(here, '../dist-marketing'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        home: path.join(here, 'index.html'),
        demo: path.join(here, 'demo/index.html'),
        privacy: path.join(here, 'privacy/index.html'),
      },
    },
  },
  server: { fs: { allow: [path.resolve(here, '..')] } },
});
