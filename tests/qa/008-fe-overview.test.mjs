// 008 F5 (frontend-dev): Overview per vehicle group. Pure rules tested directly; ZonesBlock rendered from the real file (esbuild, static HTML).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { overviewUrl, freshOverview, groupHasNoSlots, emptyGroupCopy, showsGroupOnlyTiles, zoneLabel } from '../../src/utils/overviewGroup.ts';
import { requestZonesView, takeZonesViewRequest } from '../../src/utils/groupState.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const src = (p) => readFileSync(path.join(root, p), 'utf8');
let R;

before(async () => {
  const dir = path.join(root, 'node_modules', '.cache', 'pf-008-overview');
  mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, 'entry.tsx');
  writeFileSync(entry, `export { ZonesBlock } from ${JSON.stringify(path.join(root, 'src/screens/Overview.tsx'))};`);
  const out = path.join(dir, 'out.mjs');
  await build({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', resolveExtensions: ['.tsx', '.ts', '.js'], loader: { '.svg': 'dataurl', '.css': 'empty' }, logLevel: 'silent', absWorkingDir: root });
  const mod = await import(pathToFileURL(out).href);
  const React = (await import(pathToFileURL(path.join(root, 'node_modules/react/index.js')).href)).default;
  const { renderToStaticMarkup } = await import(pathToFileURL(path.join(root, 'node_modules/react-dom/server.node.js')).href);
  R = { zones: (props) => renderToStaticMarkup(React.createElement(mod.ZonesBlock, props)) };
});

const OV = (over) => ({ siteId: 's1', group: '2W', total: 413, groups: { '4W': { occupied: 212, free: 146, total: 358 }, '2W': { occupied: 146, free: 267, total: 413 } }, ...over });

test('T-F5 the Overview asks for its group and only accepts the answer for this site and group', () => {
  assert.equal(overviewUrl('2W'), '/api/v1/overview?group=2W');
  assert.equal(overviewUrl('4W'), '/api/v1/overview?group=4W');
  const d = OV();
  assert.equal(freshOverview(d, 's1', '2W'), d);
  assert.equal(freshOverview(d, 's1', '4W'), null, 'the other group is never shown under this switch position');
  assert.equal(freshOverview(d, 's2', '2W'), null, 'another site is never shown');
  assert.equal(freshOverview(null, 's1', '2W'), null);
  assert.equal(freshOverview(OV({ group: undefined }), 's1', '2W'), null, 'an answer without a group (old shape) is not used');
});

test('T-F5 AC-08: a group with no slots shows its empty state; a site with no slots at all keeps the page as it is', () => {
  assert.equal(groupHasNoSlots(OV({ total: 0, groups: { '4W': { occupied: 1, free: 1, total: 2 }, '2W': { occupied: 0, free: 0, total: 0 } } }), '2W'), true);
  assert.equal(groupHasNoSlots(OV({ total: 0, groups: { '4W': { occupied: 0, free: 0, total: 0 }, '2W': { occupied: 0, free: 0, total: 0 } } }), '2W'), false);
  assert.equal(groupHasNoSlots(OV(), '2W'), false);
  assert.equal(groupHasNoSlots({ siteId: 's1', total: 0 }, '2W'), false, 'no groups in the answer: no empty state');
  assert.deepEqual(emptyGroupCopy('2W'), { title: 'No two-wheeler slots in this site', text: 'Add two-wheeler slots in Inventory to see them here.' });
  assert.equal(emptyGroupCopy('4W').title, 'No four-wheeler slots in this site');
});

test('T-F5 pass requests and open alerts belong to the 4-wheeler view only', () => {
  assert.equal(showsGroupOnlyTiles('4W'), true);
  assert.equal(showsGroupOnlyTiles('2W'), false);
});

test('T-F5 zone labels and the Zones view request', () => {
  assert.equal(zoneLabel({ level: 'B1', zone: 'Z1' }), 'B1 · Zone Z1');
  assert.equal(zoneLabel({ level: 'Ground', zone: null }), 'Ground · Unzoned');
  assert.equal(takeZonesViewRequest(), false);
  requestZonesView();
  assert.equal(takeZonesViewRequest(), true);
  assert.equal(takeZonesViewRequest(), false, 'one shot');
});

const ZONES = [
  { level: 'B1', zone: 'Z1', id: 'B1-Z1', free: 12, total: 40 },
  { level: 'B1', zone: 'Z2', id: 'B1-Z2', free: 0, total: 20 },
  { level: 'Ground', zone: null, id: 'Ground-unzoned', free: 5, total: 10 },
];

test('T-F5 the Zones block lists every zone with "n free / total", Unzoned last, and links to Live parking', () => {
  const html = R.zones({ zones: ZONES, href: '#/live-parking', onOpen() {} });
  assert.match(html, /<h\d[^>]*>Zones</);
  assert.match(html, /B1 · Zone Z1<\/a>/); assert.match(html, /12 free \/ 40/);
  assert.match(html, /B1 · Zone Z2<\/a>/); assert.match(html, /0 free \/ 20/);
  assert.match(html, /Ground · Unzoned<\/a>/); assert.match(html, /5 free \/ 10/);
  assert.ok(html.indexOf('Zone Z1') < html.indexOf('Zone Z2') && html.indexOf('Zone Z2') < html.indexOf('Unzoned'));
  assert.match(html, /role="meter"/);
  assert.match(html, /href="#\/live-parking"/);
  assert.doesNotMatch(html, /Zones are not set/, 'there are real zones');
});

test('T-F5 without permission to open Live parking the rows are plain text (L-5)', () => {
  const html = R.zones({ zones: ZONES });
  assert.doesNotMatch(html, /<a /);
  assert.match(html, /B1 · Zone Z1/);
});

test('T-F5 only Unzoned pallets: the banner points to Inventory (AC-12)', () => {
  const html = R.zones({ zones: [ZONES[2]], href: '#/live-parking', inventoryHref: '#/inventory' });
  assert.match(html, /Zones are not set for these slots\./);
  assert.match(html, /<a [^>]*href="#\/inventory"[^>]*>Set a zone in Inventory\.<\/a>/);
  assert.match(R.zones({ zones: [ZONES[2]] }), /Zones are not set for these slots\. Set a zone in Inventory\./);
});

test('T-F5 static: Overview sends the group, refetches on a group change, shows Zones for 2W only, gates the empty-state link', () => {
  const o = src('src/screens/Overview.tsx');
  assert.match(o, /fetch\(overviewUrl\(group\)\)/);
  assert.match(o, /\[siteId, group\]/);
  assert.match(o, /group === '2W' && d && !loading[\s\S]*<ZonesBlock/);
  assert.match(o, /showsGroupOnlyTiles\(group\) && <KpiCard\s+label="Pending pass requests"/);
  assert.match(o, /showsGroupOnlyTiles\(group\) && <KpiCard\s+label="Open alerts"/);
  assert.match(o, /canOpen\('inventory'\) \? <a className="pf-btn" href=\{hrefFor\('inventory'\)\}>Open Inventory<\/a>/);
  assert.match(o, /\{switcher\}/, 'the switcher stays on the error and empty states');
  assert.doesNotMatch(o, /fetch\('\/api\/v1\/overview'\)/);
});
