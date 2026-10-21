import path from 'path';
import { defineConfig, type Plugin } from 'vite';

/**
 * 003 F2: the TV page (tv.html -> src/display/main.ts), built on its own for old TV browsers
 * (Tizen 4 / webOS 4, Chromium 53+; 03 "TV browser compatibility").
 *   npm run build:display  ->  dist-display/tv.html + dist-display/assets/*
 *
 * - ES2015 output (esbuild lowers ?., ??, async, object spread);
 * - one classic script: IIFE, no ES modules (Chromium 53 has no <script type="module">),
 *   no module-preload polyfill, no code splitting;
 * - served at /tv (and /display) by server.ts, so assets live under /tv/assets/.
 * No React, no Tailwind, no new dependency. tests/qa/003-tv-client.test.mjs parses the built
 * script with ES2015 as the language limit.
 */
function classicScript(): Plugin {
  return {
    name: 'parkflows-tv-classic-script',
    enforce: 'post',
    transformIndexHtml(html) {
      // <script type="module" crossorigin src="/tv/assets/tv-x.js"> -> <script defer src="/tv/assets/tv-x.js">
      return html.replace(/<script type="module" crossorigin src=/g, '<script defer src=').replace(/<link rel="modulepreload"[^>]*>/g, '');
    },
  };
}

export default defineConfig({
  base: '/tv/',
  plugins: [classicScript()],
  build: {
    outDir: 'dist-display',
    emptyOutDir: true,
    target: 'es2015',
    cssTarget: 'chrome53',
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: path.resolve(__dirname, 'tv.html'),
      output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'assets/tv-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
});
