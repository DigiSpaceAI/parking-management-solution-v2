// 003, security review 07 S3-4: /tv (and /display) get their own strict CSP,
// and the built TV page works under it: one same-origin script, same-origin
// styles and fonts, no inline script or style, no eval, no outside hosts.
// Owner: backend-dev. Runner: node:test + global fetch; builds the TV bundle
// with the repo's own vite (no new dependency).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { REPO, startServer, client } from './support/pf003.mjs';

const TV_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
let build; let srv; let c;
before(async () => {
  build = mkdtempSync(path.join(tmpdir(), 'pf-tv-csp-'));
  const r = spawnSync(process.execPath, [path.join(REPO, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.display.config.ts', '--outDir', path.join(build, 'dist-display'), '--emptyOutDir'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  srv = await startServer({ prepare: (dir) => cpSync(path.join(build, 'dist-display'), path.join(dir, 'dist-display'), { recursive: true }) });
  c = client(srv);
});
after(() => { srv?.stop(); try { rmSync(build, { recursive: true, force: true }); } catch {} });

test('S3-4: /tv, /tv/, /display and /display/ (and the TV assets) are served with the strict TV CSP', async () => {
  for (const url of ['/tv', '/tv/', '/display', '/display/', '/tv?preview=dsp-0000000000000000']) {
    const r = await c.call(null, 'GET', url, { absolute: true });
    assert.equal(r.status, 200, url);
    assert.equal(r.headers.get('content-security-policy'), TV_CSP, url);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer', url);
    assert.match(r.text, /<div id="tv"/);
  }
  const html = (await c.call(null, 'GET', '/tv', { absolute: true })).text;
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(assets.length >= 2);
  for (const a of assets) {
    assert.ok(a.startsWith('/tv/assets/'), `same-origin asset: ${a}`);
    const r = await c.call(null, 'GET', a, { absolute: true });
    assert.equal(r.status, 200, a); assert.equal(r.headers.get('content-security-policy'), TV_CSP, a);
  }
  // The console and the API keep the platform CSP.
  const api = await c.call(null, 'GET', '/health');
  assert.notEqual(api.headers.get('content-security-policy'), TV_CSP);
});

test('S3-4: the built TV page fits the CSP: no inline script or style, no event handlers, no eval, nothing from outside', () => {
  const dist = path.join(build, 'dist-display');
  const html = readFileSync(path.join(dist, 'tv.html'), 'utf-8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1, 'one script');
  for (const [, attrs, body] of scripts) { assert.match(attrs, /\bsrc="\/tv\/assets\/[^"]+\.js"/, 'external, same-origin'); assert.equal(body.trim(), '', 'no inline code'); }
  assert.ok(!/<style\b/i.test(html), 'no <style> element');
  assert.ok(!/\sstyle\s*=/i.test(html), 'no style attribute');
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'no inline event handler');
  assert.ok(!/javascript:/i.test(html));
  const files = readdirSync(path.join(dist, 'assets'));
  const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(path.join(dist, 'assets', f), 'utf-8')).join('\n');
  const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(path.join(dist, 'assets', f), 'utf-8')).join('\n');
  assert.ok(js.length > 1000 && css.length > 100);
  for (const bad of [/\beval\s*\(/, /new\s+Function\s*\(/, /setTimeout\s*\(\s*["'`]/, /setInterval\s*\(\s*["'`]/, /setAttribute\(\s*["']style["']/, /\.innerHTML\s*=/, /insertAdjacentHTML/, /document\.write/]) {
    assert.ok(!bad.test(js), `TV script uses ${bad}`);
  }
  const urls = [...js.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(urls)].filter((u) => u !== 'http://www.w3.org/2000/svg'), [], 'no outside host (the SVG namespace is not a request)');
  const cssUrls = [...css.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]);
  assert.ok(cssUrls.length > 0);
  for (const u of cssUrls) assert.ok(u.startsWith('/tv/assets/') || u.startsWith('data:image/'), `CSS url ${u} must be same-origin (fonts) or a data: image`);
  assert.ok(!/@import\s+url\(\s*["']?https?:/i.test(css), 'no outside stylesheet');
});
