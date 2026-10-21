/**
 * TV page entry (admin.parkflows.in/tv, alias /display). Plain TypeScript and DOM, no React,
 * built to ES2015 as a classic script for Tizen 4 / webOS 4 (Chromium 53+). See 03 F2.
 */
import './display.css';
import { TvApp, type TvEnv } from './app';
import { monoNow, safeStorage, xhrJson } from './env';
import { createRenderer } from './render';

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
  const app = new TvApp(env, createRenderer(root));
  app.start();
  window.setInterval(() => app.tick(), 1000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
