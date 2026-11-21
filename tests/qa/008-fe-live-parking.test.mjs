// 008 F6 (frontend-dev): Live parking per vehicle group: level tabs from the inventory, Zones pallets, tiles. Pure rules + the real ZonesView rendered to static HTML.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { levelTabs, effectiveLevel, zonePallets, tileNumber, statusInitial, plateTail, tileAriaLabel, palletTitle, levelLabel } from '../../src/utils/liveZones.ts';
import { inGroup } from '../../src/utils/vehicleGroup.ts';
import { countSlots } from '../../src/utils/slotCounts.ts';
import { zonesOf } from '../../src/utils/zones.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const src = (p) => readFileSync(path.join(root, p), 'utf8');
let R;

before(async () => {
  const dir = path.join(root, 'node_modules', '.cache', 'pf-008-live');
  mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, 'entry.tsx');
  writeFileSync(entry, `export { ZonesView } from ${JSON.stringify(path.join(root, 'src/screens/LiveParking/ZonesView.tsx'))};`);
  const out = path.join(dir, 'out.mjs');
  await build({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', resolveExtensions: ['.tsx', '.ts', '.js'], loader: { '.svg': 'dataurl', '.css': 'empty' }, logLevel: 'silent', absWorkingDir: root });
  const mod = await import(pathToFileURL(out).href);
  const React = (await import(pathToFileURL(path.join(root, 'node_modules/react/index.js')).href)).default;
  const { renderToStaticMarkup } = await import(pathToFileURL(path.join(root, 'node_modules/react-dom/server.node.js')).href);
  R = { zones: (props) => renderToStaticMarkup(React.createElement(mod.ZonesView, props)) };
});

let n = 0;
const sl = (basement, slotType, status = 'VACANT', slotNumber, puzzleNumber, extra = {}) => ({ id: `s${++n}`, basement, slotType, status, slotNumber: slotNumber || `${basement}-X-${String(n).padStart(3, '0')}`, ...(puzzleNumber ? { puzzleNumber } : {}), ...extra });
const FOUR = [sl('B1', 'SUV'), sl('B1', 'SEDAN', 'OCCUPIED'), sl('Driveway', 'SUV'), sl('Ground', 'EV', 'OCCUPIED'), sl('Ground', 'CSUV'), sl('B3', 'HATCHBACK', 'MAINTENANCE')];
const TWO = [
  sl('B1', 'TWO_WHEELER', 'VACANT', 'B1-Z1-001', 'B1-Z1'), sl('B1', 'TWO_WHEELER', 'OCCUPIED', 'B1-Z1-002', 'B1-Z1', { currentVehicle: 'KA01AB1234' }),
  sl('B1', 'TWO_WHEELER', 'RESERVED', 'B1-Z1-010', 'B1-Z1'), sl('B1', 'TWO_WHEELER', 'VACANT', 'B1-Z2-001', 'B1-Z2'),
  sl('B2', 'TWO_WHEELER', 'MAINTENANCE', 'B2-2W-01'), // old name, no zone: Unzoned
  sl('Ground', 'TWO_WHEELER', 'VACANT', 'GROUND-Z9-001', 'GROUND-Z9'),
];
const ALL = [...FOUR, ...TWO];

test('T-F6 AC-04 level tabs: the levels of the group, inventory order, Ground and Driveway separate, counts follow the group', () => {
  const four = levelTabs(ALL.filter((s) => inGroup(s, '4W')));
  assert.deepEqual(four.map((t) => t.id), ['ALL', 'B1', 'B3', 'Ground', 'Driveway'], 'no B2 tab: B2 has only 2-wheelers');
  assert.deepEqual(four.map((t) => [t.free, t.total]), [[3, 6], [1, 2], [0, 1], [1, 2], [1, 1]]);
  const two = levelTabs(ALL.filter((s) => inGroup(s, '2W')));
  assert.deepEqual(two.map((t) => t.id), ['ALL', 'B1', 'B2', 'Ground']);
  assert.deepEqual(two.map((t) => [t.free, t.total]), [[3, 6], [2, 4], [0, 1], [1, 1]]);
  assert.equal(four[0].label, 'All');
  assert.equal(levelLabel('B1'), 'Basement B1'); assert.equal(levelLabel('Ground'), 'Ground'); assert.equal(levelLabel('Roof'), 'Roof');
});

test('T-F6 a level that has no slots in the new group falls back to All', () => {
  const tabs = levelTabs(ALL.filter((s) => inGroup(s, '4W')));
  assert.equal(effectiveLevel(tabs, 'B3'), 'B3');
  assert.equal(effectiveLevel(tabs, 'B2'), 'ALL');
  assert.equal(effectiveLevel(tabs, 'ALL'), 'ALL');
});

test('T-F6 AC-05 one counter: the tab counts, the summary and the Overview numbers are the same countSlots result', () => {
  const two = ALL.filter((s) => inGroup(s, '2W'));
  const c = countSlots(two);
  const all = levelTabs(two)[0];
  assert.equal(all.total, c.total); assert.equal(all.free, c.free);
  const four = ALL.filter((s) => inGroup(s, '4W'));
  assert.equal(levelTabs(four)[0].total + all.total, ALL.length, '4W + 2W = all');
  // pallet counts are zonesOf (what /overview?group=2W sends), tab counts are countSlots: they add up
  const sum = (key) => zonesOf(two).filter((z) => z.level === 'B1').reduce((a, z) => a + z[key], 0);
  assert.equal(sum('free'), levelTabs(two).find((t) => t.id === 'B1').free);
  assert.equal(sum('total'), levelTabs(two).find((t) => t.id === 'B1').total);
});

test('T-F6 AC-03 Zones: one pallet per zone, level then zone, Unzoned last, tiles in slot order, counts over the whole zone', () => {
  const two = ALL.filter((s) => inGroup(s, '2W'));
  const p = zonePallets(two, two);
  assert.deepEqual(p.map((x) => x.id), ['B1-Z1', 'B1-Z2', 'B2-unzoned', 'Ground-Z9']);
  assert.deepEqual(p[0].slots.map((s) => s.slotNumber), ['B1-Z1-001', 'B1-Z1-002', 'B1-Z1-010'], 'numeric order');
  assert.deepEqual([p[0].free, p[0].total], [1, 3]);
  assert.equal(p[2].zone, null);
  // a status filter shows fewer tiles but the header keeps the zone's own count
  const vacantOnly = zonePallets(two, two.filter((s) => s.status === 'VACANT'));
  assert.deepEqual(vacantOnly.map((x) => x.id), ['B1-Z1', 'B1-Z2', 'Ground-Z9'], 'a pallet with no tile left collapses');
  assert.equal(vacantOnly[0].slots.length, 1);
  assert.deepEqual([vacantOnly[0].free, vacantOnly[0].total], [1, 3]);
  // 4-wheelers never make a pallet
  assert.deepEqual(zonePallets(ALL, FOUR), []);
});

test('T-F6 tiles: number only, initial, plate tail, accessible name', () => {
  assert.equal(tileNumber(TWO[0]), '001');
  assert.equal(tileNumber(TWO[2]), '010');
  assert.equal(tileNumber(TWO[4]), 'B2-2W-01', 'an unzoned slot keeps its whole name');
  assert.deepEqual(['VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'].map(statusInitial), ['V', 'O', 'R', 'M']);
  assert.equal(plateTail('KA01AB1234'), '1234'); assert.equal(plateTail('KA 01 ab-12'), 'AB12'); assert.equal(plateTail(null), '');
  assert.equal(tileAriaLabel({ slotNumber: 'B1-Z1-004', status: 'VACANT' }), 'Slot B1-Z1-004, vacant');
  assert.equal(palletTitle({ level: 'B1', zone: 'Z1' }), 'B1 · Zone Z1'); assert.equal(palletTitle({ level: 'B2', zone: null }), 'B2 · Unzoned');
});

test('T-F6 the Zones view renders pallets under level headings with free / total, tiles, initials and plate tail', () => {
  const two = ALL.filter((s) => inGroup(s, '2W'));
  const html = R.zones({ pallets: zonePallets(two, two), allUnzoned: false, onOpen() {}, onClearFilters() {} });
  assert.match(html, /<h3 class="pf-zones-level">B1<\/h3>/);
  assert.match(html, /<h4>B1 · Zone Z1<\/h4>/); assert.match(html, /1 free \/ 3/);
  assert.match(html, /<h4>B2 · Unzoned<\/h4>/);
  assert.match(html, /aria-label="Slot B1-Z1-001, vacant"[^>]*>(?:<span>)?001 <b aria-hidden="true">V<\/b>/);
  assert.match(html, /title="B1-Z1-002"/, 'the full name on hover');
  assert.match(html, /pf-tile--occupied[\s\S]*?<small>1234<\/small>/);
  assert.match(html, /pf-tile--reserved/); assert.match(html, /pf-tile--maintenance/);
  assert.doesNotMatch(html, /Zones are not set/);
});

test('T-F6 Zones view: only unzoned slots get the banner; no match gets the empty state with Clear filters', () => {
  const unz = [sl('B2', 'TWO_WHEELER', 'VACANT', 'B2-2W-01')];
  const html = R.zones({ pallets: zonePallets(unz, unz), allUnzoned: true, onOpen() {}, onClearFilters() {} });
  assert.match(html, /Zones are not set for these slots\. Set a zone in Inventory\./);
  const none = R.zones({ pallets: [], allUnzoned: false, onOpen() {}, onClearFilters() {} });
  assert.match(none, /No slots match these filters/); assert.match(none, /Clear filters/);
});

test('T-F6 static: Live parking filters by group, builds its tabs from the inventory, has All slots | Zones for 2W and keeps Puzzle for 4W', () => {
  const idx = src('src/screens/LiveParking/index.tsx');
  assert.match(idx, /allSlots\.filter\(\(s\) => inGroup\(s, group\)\)/);
  assert.match(idx, /levelTabs\(slots\)/);
  assert.doesNotMatch(idx, /summary\.ground|slotInLevel|Ground \/ driveway/, 'the clubbed summary levels are gone');
  assert.match(idx, /label: 'All slots'[\s\S]*label: 'Zones'/);
  assert.match(idx, /label: 'Puzzle wise status'/);
  assert.match(idx, /takeZonesViewRequest\(\)/, 'an Overview Zones row opens the Zones view');
  assert.match(idx, /group === '4W' && \(\s*<Select\s+label="Slot type"/, 'no slot type filter on the 2-wheeler page');
  assert.match(idx, /canOpen\?\.\('inventory'\) \? <a className="pf-btn" href=\{hrefFor\('inventory'\)\}>Open Inventory<\/a>/);
  assert.match(src('src/App.tsx'), /<LiveParking siteId=\{siteId\} onChanged=\{[^}]*\} canOpen=/);
  assert.match(src('src/screens/LiveParking/SlotsView.tsx'), /slotType === 'TWO_WHEELER' \? '' : cardDecode\(s\)/);
});
