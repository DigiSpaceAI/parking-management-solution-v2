// 003 v1.5 B12: Summary displays (US-19/20, AC-38..AC-47). Backend tests 1-6 of
// 03-tech-design v1.5 "Tests". Owner: backend-dev. node:test + fetch.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { REPO, startServer, client, twoSites, addSlots, slot, deepKeys, sleep, MASTER_EMAIL } from './support/pf003.mjs';

const { countSlots, SUMMARY_TYPES } = await import(pathToFileURL(path.join(REPO, 'src/utils/slotCounts.ts')).href);

let srv; let c; let F;
const sel = (o = {}) => ({ levels: [], areas: [], slotIds: [], vehicleClass: 'ALL', ...o });
const tokenOf = (link) => /#k=([A-Za-z0-9_-]{43})$/.exec(link)[1];
async function mkDisplay(selection, extra = {}, who = 'adminA', site) {
  const r = await c.post(who, '/displays', { name: 'TV', location: 'Main gate', selection, ...extra }, { site: site || F.A.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { id: r.body.display.id, token: tokenOf(r.body.link), row: r.body.display };
}
const feed = (token, q = '') => c.call(null, 'GET', `/screen/feed${q}`, { headers: { 'x-display-token': token } });
const setLayout = (id, layout, who = 'adminA', o = {}) => c.post(who, `/displays/${id}`, { layout }, { site: F.A.id, ...o });

before(async () => {
  srv = await startServer();
  c = client(srv);
  await c.login('master', MASTER_EMAIL);
  F = await twoSites(c, 'sum');
  const e = await c.post('master', '/vehicles/entry', { vehicleNumber: 'MH12AB1234', targetSlotNumber: 'A-B1-P03' }, { site: F.A.id });
  assert.ok(e.body.success, JSON.stringify(e.body));
  for (const [code, status] of [['A-B1-G02', 'RESERVED'], ['A-B2-G02', 'MAINTENANCE']]) {
    const r = await c.post('master', '/slots/update-status', { slotId: F.slotsA[code].id, newStatus: status }, { site: F.A.id });
    assert.ok(r.body.success, JSON.stringify(r.body));
  }
});
after(() => srv?.stop());

test('T1 default unchanged: no layout -> SLOT_CARDS; body = the 9d5596d builder output plus only "layout"', async () => {
  const d = await mkDisplay(sel({ levels: ['B1', 'B2'] }));
  const r = await feed(d.token);
  assert.equal(r.body.layout, 'SLOT_CARDS');
  assert.ok(!('summary' in r.body));
  assert.equal(d.row.layout, 'SLOT_CARDS', 'console row reads the default');
  const run = spawnSync(path.join(REPO, 'node_modules', '.bin', 'tsx'), [path.join(REPO, 'tests/qa/support/legacy/compare-feed.ts')], { encoding: 'utf-8', timeout: 30_000, env: { ...process.env, PF_REPO: REPO } });
  const out = JSON.parse((run.stdout || '').trim().split('\n').pop() || 'null');
  assert.ok(out, run.stderr);
  assert.deepEqual(out.map((o) => o.state).sort(), ['CLOSED', 'EMPTY', 'OPEN', 'OPEN']);
  for (const o of out) {
    assert.equal(o.same, true, `${o.state}: body differs from 9d5596d beyond "layout"`);
    assert.equal(o.hasOne, true);
    assert.equal(o.vDiffers, true, 'v changes only because of the added key');
  }
});

test('T2 [AC-38/47] validation, permissions, audit; same value is a no-op', async () => {
  const d = await mkDisplay(sel({ levels: ['B1'] }));
  for (const bad of ['GRID', '', 'summary', 3, null]) {
    const r = await setLayout(d.id, bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.body.errors.layout, 'Choose a layout.');
  }
  const created = await c.post('adminA', '/displays', { name: 'TV', selection: sel({ levels: ['B1'] }), layout: 'GRID' }, { site: F.A.id });
  assert.equal(created.status, 400);
  assert.equal((await setLayout(d.id, 'SUMMARY', 'adminB', { site: F.B.id })).status, 403, 'Site Admin of another site');
  assert.equal((await setLayout(d.id, 'SUMMARY', 'attA')).status, 403, 'attendant');
  assert.equal((await setLayout(d.id, 'SUMMARY', 'customA')).status, 403, 'custom role');
  const va = await setLayout(d.id, 'SUMMARY', 'master', { headers: { 'x-view-as': F.adminA.id } });
  assert.equal(va.status, 403);
  assert.equal(va.body.errorCode, 'ERR_VIEW_AS_READ_ONLY');
  const audits = async () => (await c.audit('DISPLAY_UPDATED')).filter((a) => a.targetResource === `display/${d.id}`);
  assert.equal((await audits()).length, 0, 'refusals change nothing');
  const ok = await setLayout(d.id, 'SUMMARY');
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.display.layout, 'SUMMARY');
  let a = await audits();
  assert.equal(a.length, 1);
  assert.match(a[0].details, /layout: SLOT_CARDS → SUMMARY/);
  assert.ok(!a[0].details.includes(d.token) && !JSON.stringify(a[0]).includes('127.0.0.1'), 'no token or IP');
  assert.equal((await setLayout(d.id, 'SUMMARY')).status, 200);
  assert.equal((await audits()).length, 1, 'same value: no audit');
  assert.equal((await setLayout(d.id, 'SUMMARY_CARDS', 'master')).status, 200, 'Master');
  a = await audits();
  assert.ok(a.some((x) => /layout: SUMMARY → SUMMARY_CARDS/.test(x.details)));
  const withLayout = await c.post('adminA', '/displays', { name: 'TV2', selection: sel({ levels: ['B2'] }), layout: 'SUMMARY' }, { site: F.A.id });
  assert.equal(withLayout.body.display.layout, 'SUMMARY', 'create accepts a layout');
  assert.equal((await c.post('adminA', `/displays/${d.id}/switch-off`, {}, { site: F.A.id })).status, 200);
  assert.equal((await setLayout(d.id, 'SLOT_CARDS')).status, 409, 'switched off');
});

const SUMMARY_KEYS = new Set(['v', 'serverTime', 'state', 'place', 'siteName', 'hours', 'mode', 'on', 'off', 'pageSeconds', 'override', 'message', 'forcedFull',
  'layout', 'counts', 'free', 'total', 'groups', 'label', 'summary', 'types', 'rows', 'level', 'cells', 'type', 'totals']);

test('T3 [AC-45] SUMMARY: no slots, only the listed keys, no slot code / id / plate; SUMMARY_CARDS = SLOT_CARDS slots + summary', async () => {
  const d = await mkDisplay(sel({ levels: ['B1', 'B2'] }));
  const cards = (await feed(d.token)).body;
  assert.equal((await setLayout(d.id, 'SUMMARY')).status, 200);
  const r = await feed(d.token);
  assert.equal(r.body.layout, 'SUMMARY');
  assert.ok(!('slots' in r.body), 'no slots key');
  for (const k of deepKeys(r.body)) assert.ok(SUMMARY_KEYS.has(k), `key "${k}" not allowed in SUMMARY`);
  assert.ok(!/[A-Z]-B\d-[A-Z]\d{2}/.test(r.text), 'no slot code');
  assert.ok(!/[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}/.test(r.text), 'no plate');
  for (const leak of ['MH12AB1234', F.slotsA['A-B1-P01'].id, F.A.id, 'P01', 'near lift']) assert.ok(!r.text.includes(leak), `leaked ${leak}`);
  assert.deepEqual(r.body.counts, cards.counts, 'counts unchanged');
  assert.equal((await setLayout(d.id, 'SUMMARY_CARDS')).status, 200);
  const sc = (await feed(d.token)).body;
  assert.deepEqual(sc.slots, cards.slots, 'same slots as SLOT_CARDS');
  assert.deepEqual(sc.summary, r.body.summary);
  const extra = [...deepKeys(sc)].filter((k) => !deepKeys(cards).has(k)).sort();
  assert.deepEqual(extra, ['cells', 'rows', 'summary', 'totals', 'types'], 'only the summary keys are added');
});

test('T4 [AC-42] counts: Vacant only, EV under EV, absent types left out, total 0 cells, hidden per display, totals = rows', async () => {
  const d = await mkDisplay(sel({ levels: ['B1', 'B2'] }), { layout: 'SUMMARY' });
  const s = (await feed(d.token)).body.summary;
  // Site A: B1 P01 SEDAN V, P02 EV V, P03 SEDAN O, G01 SEDAN V, G02 SEDAN R; B2 G01 SEDAN V, G02 SEDAN M, W01 2W V
  assert.deepEqual(s.types, ['SEDAN', 'TWO_WHEELER', 'EV'], 'SUV / CSUV absent, order kept');
  const cell = (row, type) => row.cells.find((x) => x.type === type);
  const [b1, b2] = s.rows;
  assert.deepEqual([b1.level, b2.level], ['B1', 'B2']);
  assert.deepEqual(cell(b1, 'SEDAN'), { type: 'SEDAN', free: 2, total: 4 }, 'Occupied and Reserved are not free');
  assert.deepEqual(cell(b1, 'EV'), { type: 'EV', free: 1, total: 1 });
  assert.deepEqual(cell(b1, 'TWO_WHEELER'), { type: 'TWO_WHEELER', free: 0, total: 0 }, 'a level without the type');
  assert.deepEqual(cell(b2, 'SEDAN'), { type: 'SEDAN', free: 1, total: 2 }, 'Maintenance is not free');
  assert.deepEqual([b1.free, b1.total, b2.free, b2.total], [3, 5, 2, 3]);
  for (const t of s.totals) {
    assert.equal(t.free, s.rows.reduce((a, r) => a + cell(r, t.type).free, 0));
    assert.equal(t.total, s.rows.reduce((a, r) => a + cell(r, t.type).total, 0));
  }
  const fb = (await feed(d.token)).body;
  assert.equal(fb.counts.free, s.rows.reduce((a, r) => a + r.free, 0));
  const rules = await c.post('adminA', `/displays/${d.id}/slot-rules`, { hidden: [F.slotsA['A-B2-W01'].id], pinned: [] }, { site: F.A.id });
  assert.equal(rules.status, 200, JSON.stringify(rules.body));
  const hid = (await feed(d.token)).body.summary;
  assert.deepEqual(hid.types, ['SEDAN', 'EV'], 'hidden slot left out on this display');
  assert.equal(hid.rows[1].total, 2);
  const other = await mkDisplay(sel({ levels: ['B1', 'B2'] }), { layout: 'SUMMARY' });
  assert.deepEqual((await feed(other.token)).body.summary, s, 'another display of the same slots still counts it');
});

test('T5 [AC-42] parity: countSlots over GET /slots = Live parking numbers = the display summary, before and after entry/exit', async () => {
  const site = await c.onboard('sumP', 'Parity site');
  const rows = [];
  let n = 0;
  for (const level of ['B1', 'B2', 'B3']) for (const t of SUMMARY_TYPES) for (let k = 0; k < 2; k++) {
    rows.push(slot(`P-${level}-${t.slice(0, 2)}${String(++n).padStart(2, '0')}`, { basement: level, slotType: t, parkingType: 'GROUND', allocation: 'VISITOR' }));
  }
  const map = await addSlots(c, site.id, rows);
  const codes = Object.keys(map).sort();
  for (const [i, code] of codes.entries()) {
    const st = ['VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'VACANT'][i % 5];
    if (st === 'RESERVED' || st === 'MAINTENANCE') {
      assert.ok((await c.post('master', '/slots/update-status', { slotId: map[code].id, newStatus: st }, { site: site.id })).body.success);
    } else if (st === 'OCCUPIED') {
      const r = await c.post('master', '/vehicles/entry', { vehicleNumber: `KA01PY${1000 + i}`, targetSlotNumber: code }, { site: site.id });
      assert.ok(r.body.success, JSON.stringify(r.body));
    }
  }
  const d = await c.post('master', '/displays', { name: 'Gate', selection: sel({ levels: ['B1', 'B2', 'B3'] }), layout: 'SUMMARY' }, { site: site.id });
  assert.equal(d.status, 200, JSON.stringify(d.body));
  const token = tokenOf(d.body.link);
  const asGrid = (counts) => ({
    types: counts.types,
    rows: counts.rows.map((r) => ({ level: r.level, cells: counts.types.map((t) => ({ type: t, free: r.byType[t]?.free || 0, total: r.byType[t]?.total || 0 })), free: r.free, total: r.total })),
    totals: counts.types.map((t) => ({ type: t, free: counts.byType[t]?.free || 0, total: counts.byType[t]?.total || 0 })),
  });
  const check = async (label) => {
    const slots = (await c.get('master', '/slots', { site: site.id })).body.slots;
    const fromSlots = countSlots(slots);
    // Live parking renders each level from the same /slots list through the same helper.
    for (const level of ['B1', 'B2', 'B3']) {
      const lp = countSlots(slots.filter((s) => s.basement === level));
      const row = fromSlots.rows.find((r) => r.level === level);
      assert.deepEqual([lp.free, lp.total], [row.free, row.total], `${label}: Live parking ${level}`);
    }
    await sleep(1100); // past the 1 s feed cache
    const f = (await feed(token)).body;
    assert.deepEqual(f.summary, asGrid(fromSlots), `${label}: display summary = countSlots(/slots)`);
    assert.equal(f.counts.free, fromSlots.free);
    const row = (await c.get('master', '/displays', { site: site.id })).body.displays[0];
    assert.equal(row.freeNow, fromSlots.free, `${label}: Displays row free now`);
    assert.deepEqual(f.summary.types, SUMMARY_TYPES);
    return fromSlots;
  };
  const first = await check('seeded');
  const ev = codes.find((code, i) => map[code].slotType === 'EV' && i % 5 === 0);
  const entry = await c.post('master', '/vehicles/entry', { vehicleNumber: 'KA01PZ0001', targetSlotNumber: ev }, { site: site.id });
  assert.ok(entry.body.success, JSON.stringify(entry.body));
  const mid = await check('after entry');
  assert.equal(mid.free, first.free - 1);
  assert.ok((await c.post('master', '/vehicles/exit', { vehicleNumberOrSlot: 'KA01PZ0001' }, { site: site.id })).body.success);
  assert.equal((await check('after exit')).free, first.free);
});

test('T6 [AC-38] hash and <= 5 s: layout and entry/exit change v; 20 runs seen within 5 s; CLOSED/EMPTY carry layout, no summary', async () => {
  const d = await mkDisplay(sel({ levels: ['B2'] }));
  const layouts = ['SUMMARY', 'SUMMARY_CARDS', 'SLOT_CARDS'];
  let v = (await feed(d.token)).body.v;
  const waits = [];
  for (let i = 0; i < 20; i++) {
    const want = layouts[i % 3];
    const t0 = Date.now();
    assert.equal((await setLayout(d.id, want)).status, 200);
    let seen = null;
    while (Date.now() - t0 < 5000) {
      const r = await feed(d.token, `?v=${v}`);
      if (!r.body.unchanged && r.body.layout === want) { seen = r.body; break; }
      await sleep(250);
    }
    assert.ok(seen, `run ${i + 1}: ${want} not seen within 5 s`);
    assert.notEqual(seen.v, v);
    v = seen.v;
    waits.push(Date.now() - t0);
  }
  console.log(`# T6 layout change seen after max ${Math.max(...waits)} ms`);
  await setLayout(d.id, 'SUMMARY');
  await sleep(1100);
  const s0 = (await feed(d.token)).body;
  const e = await c.post('master', '/vehicles/entry', { vehicleNumber: 'MH12CD5678', targetSlotNumber: 'A-B2-G01' }, { site: F.A.id });
  assert.ok(e.body.success, JSON.stringify(e.body));
  const t0 = Date.now(); let s1;
  while (Date.now() - t0 < 5000) { s1 = (await feed(d.token)).body; if (s1.v !== s0.v) break; await sleep(250); }
  assert.notEqual(s1.v, s0.v, 'an entry changes v');
  assert.equal(s1.summary.rows[0].free, s0.summary.rows[0].free - 1);
  assert.ok((await c.post('master', '/vehicles/exit', { vehicleNumberOrSlot: 'MH12CD5678' }, { site: F.A.id })).body.success);
  const t1 = Date.now(); let s2;
  while (Date.now() - t1 < 5000) { s2 = (await feed(d.token)).body; if (s2.v !== s1.v) break; await sleep(250); }
  assert.equal(s2.v, s0.v, 'an exit changes v back');
  // CLOSED: hours that exclude now (IST)
  const ist = new Date(Date.now() + 330 * 60_000);
  const hh = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const closed = await mkDisplay(sel({ levels: ['B1'] }), { layout: 'SUMMARY', hours: { mode: 'DAILY', on: hh(m + 120), off: hh(m + 180) } });
  const cb = (await feed(closed.token)).body;
  assert.equal(cb.state, 'CLOSED');
  assert.equal(cb.layout, 'SUMMARY');
  assert.ok(!('summary' in cb) && !('slots' in cb));
  const empty = await mkDisplay(sel({ slotIds: [F.slotsA['A-B1-G01'].id] }), { layout: 'SUMMARY_CARDS' });
  assert.equal((await c.post('adminA', `/displays/${empty.id}/slot-rules`, { hidden: [F.slotsA['A-B1-G01'].id], pinned: [] }, { site: F.A.id })).status, 200);
  await sleep(1100);
  const eb = (await feed(empty.token)).body;
  assert.equal(eb.state, 'EMPTY');
  assert.equal(eb.layout, 'SUMMARY_CARDS');
  assert.ok(!('summary' in eb) && !('slots' in eb));
});

test('unit: countSlots isFree hook (003b), level order, empty input', () => {
  const s = (basement, slotType, status) => ({ basement, slotType, status });
  const c1 = countSlots([s('Driveway', 'EV', 'VACANT'), s('B1', 'SUV', 'VACANT'), s('Ground', 'SUV', 'OCCUPIED'), s('B3', 'SEDAN', 'VACANT')]);
  assert.deepEqual(c1.rows.map((r) => r.level), ['B1', 'B3', 'Ground', 'Driveway']);
  assert.deepEqual([c1.free, c1.total], [3, 4]);
  const c2 = countSlots([s('B1', 'SUV', 'VACANT'), s('B2', 'SUV', 'VACANT')], { isFree: (x) => x.status === 'VACANT' && x.basement !== 'B1' });
  assert.deepEqual([c2.free, c2.rows[0].free, c2.byType.SUV], [1, 0, { free: 1, total: 2 }]);
  assert.deepEqual(countSlots([]), { types: [], rows: [], byType: {}, free: 0, total: 0 });
});

test('unit: summaryPages (AC-46): 6 rows a page, in order; no paging at <= 6 rows', async () => {
  const { summaryPages } = await import(pathToFileURL(path.join(REPO, 'src/display/layout.ts')).href);
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ level: `L${i + 1}`, free: i, total: 10 }));
  assert.deepEqual(summaryPages(rows(7)).map((p) => p.length), [6, 1]);
  assert.deepEqual(summaryPages(rows(13)).map((p) => p.length), [6, 6, 1]);
  assert.deepEqual(summaryPages(rows(13)).flat().map((r) => r.level), rows(13).map((r) => r.level), 'order kept');
  assert.equal(summaryPages(rows(5)).length, 1);
  assert.equal(summaryPages(rows(6)).length, 1);
  assert.deepEqual(summaryPages([]), [[]]);
  assert.deepEqual(summaryPages(rows(7), 3).map((p) => p.length), [3, 3, 1]);
});
