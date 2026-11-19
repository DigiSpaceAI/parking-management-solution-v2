// 008 F4 (frontend-dev): the 4-wheeler | 2-wheeler switcher and its context.
// Pure state is tested directly; the real component is bundled with esbuild (already a dev dependency) and rendered to static HTML.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { choose, groupFor, DEFAULT_GROUP, groupName, otherGroup, groupSummary, groupAnnouncement } from '../../src/utils/groupState.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const src = (p) => readFileSync(path.join(root, p), 'utf8');
let R;

before(async () => {
  const dir = path.join(root, 'node_modules', '.cache', 'pf-008-switch');
  mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, 'entry.tsx');
  writeFileSync(entry, `export { VehicleGroupSwitch } from ${JSON.stringify(path.join(root, 'src/components/VehicleGroupSwitch.tsx'))};`);
  const out = path.join(dir, 'out.mjs');
  await build({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', resolveExtensions: ['.tsx', '.ts', '.js'], loader: { '.svg': 'dataurl', '.css': 'empty' }, logLevel: 'silent', absWorkingDir: root });
  const mod = await import(pathToFileURL(out).href);
  const React = (await import(pathToFileURL(path.join(root, 'node_modules/react/index.js')).href)).default;
  const { renderToStaticMarkup } = await import(pathToFileURL(path.join(root, 'node_modules/react-dom/server.node.js')).href);
  R = { h: (props) => renderToStaticMarkup(React.createElement(mod.VehicleGroupSwitch, props)) };
});

const COUNTS = { '4W': { occupied: 212, total: 358 }, '2W': { occupied: 146, total: 413 } };

test('T-F4 the choice starts as 4-wheeler and is kept for the same site on both pages', () => {
  assert.equal(DEFAULT_GROUP, '4W');
  const c = choose('site-a', '2W');
  assert.equal(groupFor(c, 'site-a'), '2W', 'Overview and Live parking read the same choice');
  assert.equal(groupFor(choose('site-a', '4W'), 'site-a'), '4W');
});

test('T-F4 another site, or no site, reads as 4-wheeler (reset on site change)', () => {
  const c = choose('site-a', '2W');
  assert.equal(groupFor(c, 'site-b'), '4W');
  assert.equal(groupFor(c, null), '4W');
  assert.equal(groupFor(choose(null, '2W'), 'site-a'), '4W');
});

test('T-F4 copy: names, summary line and screen reader text follow the UX', () => {
  assert.equal(groupName('4W'), '4-wheeler');
  assert.equal(groupName('2W'), '2-wheeler');
  assert.equal(otherGroup('4W'), '2W');
  assert.equal(groupSummary('2W', { occupied: 146, total: 413 }), '2-wheeler: 146 / 413 occupied');
  assert.equal(groupAnnouncement('2W', 413), 'Showing 2-wheeler, 413 slots');
  assert.equal(groupSummary('4W', { occupied: 1200, total: 3000 }), '4-wheeler: 1,200 / 3,000 occupied');
});

test('T-F4 the switcher is a radiogroup with both totals and the other group summarised', () => {
  const html = R.h({ counts: COUNTS, group: '4W', onChange() {} });
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /aria-label="Vehicle type"/);
  assert.match(html, /role="radio"[^>]*aria-checked="true"[^>]*>4-wheeler<span class="pf-num">\(358\)/);
  assert.match(html, /role="radio"[^>]*aria-checked="false"[^>]*>2-wheeler<span class="pf-num">\(413\)/);
  assert.match(html, /2-wheeler: 146 \/ 413 occupied/);
  assert.doesNotMatch(html, /4-wheeler: 212/, 'only the other group gets the summary line');
  assert.match(html, /role="status"[^>]*>Showing 4-wheeler, 358 slots</);
  const two = R.h({ counts: COUNTS, group: '2W', onChange() {} });
  assert.match(two, /role="radio"[^>]*aria-checked="true"[^>]*>2-wheeler/);
  assert.match(two, /4-wheeler: 212 \/ 358 occupied/);
  assert.match(two, /Showing 2-wheeler, 413 slots/);
});

test('T-F4 loading disables the control; an error (no numbers) leaves it usable and shows no totals', () => {
  const loading = R.h({ counts: null, loading: true, group: '4W', onChange() {} });
  assert.equal((loading.match(/disabled=""/g) || []).length, 2);
  const failed = R.h({ counts: null, group: '4W', onChange() {} });
  assert.doesNotMatch(failed, /disabled=""/);
  assert.doesNotMatch(failed, /pf-num|occupied/);
});

test('T-F4 static: the provider wraps the app by site; both pages show the switcher; nothing is stored', () => {
  assert.match(src('src/App.tsx'), /<VehicleGroupProvider siteId=\{currentSiteId\}>[\s\S]*<AppShell[\s\S]*<\/VehicleGroupProvider>/);
  assert.match(src('src/screens/Overview.tsx'), /<VehicleGroupSwitch /);
  assert.match(src('src/screens/LiveParking/index.tsx'), /<VehicleGroupSwitch /);
  const comp = src('src/components/VehicleGroupSwitch.tsx');
  assert.doesNotMatch(comp, /localStorage|sessionStorage/, 'in memory only (UX: resets when the site changes)');
  assert.match(comp, /if \(choice\.siteId !== siteId\) setChoice\(choose\(siteId, DEFAULT_GROUP\)\)/, 'a site change forgets the choice for good');
});
