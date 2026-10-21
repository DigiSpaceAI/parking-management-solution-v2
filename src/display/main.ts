/**
 * TV page entry (admin.parkflows.in/tv, alias /display). Plain TypeScript and DOM, no React,
 * built to ES2015 as a classic script for Tizen 4 / webOS 4 (Chromium 53+). See 03 F2.
 */
import './display.css';
import { TvApp, type TvEnv } from './app';
import { monoNow, safeStorage, xhrJson } from './env';
import { createRenderer } from './render';
import type { DisplayFeed } from './types';

function boot(): void {
  const root = document.getElementById('tv');
  if (!root) return;
  const env: TvEnv = {
    mono: monoNow,
    wall: () => Date.now(),
    random: () => Math.random(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
    request: xhrJson,
    store: safeStorage,
    hash: () => window.location.hash,
    reload: () => window.location.reload(),
  };
  // ?preview=1: the console's live preview (an iframe on the same origin). It never reads or
  // stores a credential and never polls; it shows the feeds the console posts to it.
  const preview = /(^|[?&])preview=1(&|$)/.test(window.location.search.replace(/^\?/, ''));
  if (preview) env.store = { get: () => null, set: () => undefined, remove: () => undefined };
  const app = new TvApp(env, createRenderer(root, window.location.host));
  if (preview) {
    app.startPreview();
    window.addEventListener('message', (e: MessageEvent) => {
      const d = e.data as { type?: string; feed?: unknown } | null;
      if (e.origin !== window.location.origin || !d || d.type !== 'pf-tv-preview') return;
      app.showFeed((d.feed as DisplayFeed) || null);
    });
    // Tell the console the preview is ready for its first feed.
    if (window.parent !== window) window.parent.postMessage({ type: 'pf-tv-preview-ready' }, window.location.origin);
  } else app.start();
  window.setInterval(() => app.tick(), 1000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
