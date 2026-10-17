// parkflows.in marketing site (002 T6, tech design "Marketing site parkflows.in").
// Static multi-page build: plain HTML + the shared design-system CSS, fonts and logo
// from src/design-system/. No React, no Tailwind, no new dependency.
//   npm run build:marketing  ->  dist-marketing/
//
// Two small build-time helpers (transformIndexHtml), so the HTML stays plain:
//   <!-- @partial header -->        -> marketing/partials/header.html (shared header / footer)
//   ~ds/brand/x.svg                 -> the right relative path from this page to src/design-system/
//   <i data-icon="mail"></i>        -> the lucide icon of that name as inline SVG, read from the
//                                      already-installed lucide-react package (same icons as the console); each
//                                      icon module exports its __iconNode, so it is imported, not parsed (05 m-7)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * R1a build flag (01 v1.3): the Book-a-demo form ships switched OFF until B6 (/api/v1/demo-requests) and the
 * D1 hosting rewrite are live. Off (default): /demo/ is built with the email + phone contact panel only, and
 * demo.js is neither bundled nor loaded. On: the form page exactly as specified in AC-32 / 05 M-1.
 *   PF_DEMO_FORM=1 npm run build:marketing      (also accepts on / true / yes)
 * In the HTML: <!-- @if demo-form --> … <!-- @else --> … <!-- @endif --> (no nesting).
 */
export const DEMO_FORM = /^(1|on|true|yes)$/i.test(process.env.PF_DEMO_FORM ?? '');
const FLAGS = { 'demo-form': DEMO_FORM };
const IF_BLOCK = /<!--\s*@if\s+([\w-]+)\s*-->([\s\S]*?)(?:<!--\s*@else\s*-->([\s\S]*?))?<!--\s*@endif\s*-->/g;

function applyFlags(html, file) {
  const out = html.replace(IF_BLOCK, (_, flag, yes, no = '') => {
    if (!(flag in FLAGS)) throw new Error(`marketing: unknown build flag "${flag}" in ${file}`);
    return FLAGS[flag] ? yes : no;
  });
  if (/<!--\s*@(if|else|endif)\b/.test(out)) throw new Error(`marketing: unbalanced @if/@else/@endif in ${file}`);
  return out;
}
const dsDir = path.resolve(here, '../src/design-system');
const lucideDir = path.resolve(here, '../node_modules/lucide-react/dist/esm/icons');

async function lucideSvg(name, extraClass) {
  const file = path.join(lucideDir, `${name}.js`);
  if (!fs.existsSync(file)) throw new Error(`marketing: unknown lucide icon "${name}"`);
  const { __iconNode: node } = await import(pathToFileURL(file).href);
  if (!Array.isArray(node)) throw new Error(`marketing: lucide icon "${name}" has no __iconNode export`);
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
      async handler(html, ctx) {
        let out = html.replace(/<!--\s*@partial\s+([\w-]+)\s*-->/g, (_, name) =>
          fs.readFileSync(path.join(here, 'partials', `${name}.html`), 'utf8'));
        out = applyFlags(out, ctx.filename);
        const rel = path.relative(path.dirname(ctx.filename), dsDir).split(path.sep).join('/');
        out = out.replaceAll('~ds/', `${rel}/`);
        const ICON = /<i data-icon="([\w-]+)"(?: class="([^"]*)")?><\/i>/g;
        const svgs = await Promise.all([...out.matchAll(ICON)].map((m) => lucideSvg(m[1], m[2])));
        let i = 0;
        return out.replace(ICON, () => svgs[i++]);
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
