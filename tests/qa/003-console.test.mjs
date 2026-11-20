// 003 console (F4–F7): the editor's draft preview (03 feed rules) and the DISPLAYS role defaults.
// Node built-ins plus the repo's esbuild to compile the TypeScript; no server, nothing installed.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const esbuild = createRequire(join(ROOT, 'package.json'))('esbuild');
const mod = {};
before(async () => {
  const out = mkdtempSync(join(tmpdir(), 'pf-console-'));
  const entries = { draft: 'src/screens/Displays/draft.ts', rbac: 'src/utils/rbac.ts', api: 'src/screens/Displays/api.ts', status: 'src/screens/Displays/status.ts' };
  await esbuild.build({ entryPoints: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, join(ROOT, v)])), bundle: true, format: 'esm', platform: 'neutral', outdir: out, logLevel: 'silent' });
  for (const k of Object.keys(entries)) mod[k] = await import(pathToFileURL(join(out, `${k}.js`)).href);
});

const s = (id, slotNumber, basement, parkingType, status, extra = {}) => ({ id, slotNumber, basement, parkingType, status, slotType: 'SEDAN', allocation: 'EMPLOYEE', floorLocation: 'Level 1 near lift', height: '2.0m', ...extra });
const SLOTS = [
  s('1', 'B1-010', 'B1', 'GROUND', 'OCCUPIED', { currentVehicle: 'KA01AB1234', heightM: 2.1 }),
  s('2', 'B1-002', 'B1', 'GROUND', 'VACANT'),
  s('3', 'B1-P01-S1', 'B1', 'PUZZLE', 'RESERVED', { puzzleNumber: 'B1-P01', palletLevel: 1 }),
  s('4', 'B1-001', 'B1', 'GROUND', 'MAINTENANCE'),
  s('5', 'B2-P02-S1', 'B2', 'PUZZLE', 'VACANT', { puzzleNumber: 'B2-P02', palletLevel: 1, slotType: 'EV' }),
  s('6', 'B2-007', 'B2', 'GROUND', 'VACANT', { slotType: 'TWO_WHEELER' }),
  s('7', 'B2-003', 'B2', 'GROUND', 'OCCUPIED', { currentVehicle: 'MH12CD9999' }),
];
const sel = (o = {}) => ({ levels: [], areas: [], slotIds: [], vehicleClass: 'ALL', ...o });
const feedOf = (selection, extra = {}) => mod.draft.draftFeed({ slots: SLOTS, selection, place: 'Gate 1', hours: { mode: 'ALWAYS' }, pageSeconds: 8, ...extra });

test('draft preview: vacant first, then occupied, reserved, maintenance; each by slot code (AC-07)', () => {
  const f = feedOf(sel({ levels: ['B1', 'B2'] }));
  assert.deepEqual(f.slots.map((x) => x.code), ['B1-002', 'B2-007', 'B2-P02-S1', 'B1-010', 'B2-003', 'B1-P01-S1', 'B1-001']);
  assert.deepEqual(f.counts, { free: 3, total: 7, groups: [{ label: 'Basement B1', free: 1, total: 4 }, { label: 'Basement B2', free: 2, total: 3 }] });
});

test('draft preview: plate only on occupied slots, no ids or entry times (NFR-5 shape)', () => {
  const f = feedOf(sel({ levels: ['B1', 'B2'] }));
  for (const x of f.slots) {
    assert.equal('plate' in x, x.status === 'OCCUPIED', x.code);
    for (const k of Object.keys(x)) assert.ok(['code', 'level', 'area', 'type', 'ev', 'parkingType', 'puzzleNumber', 'palletLevel', 'status', 'heightM', 'lengthM', 'plate', 'pinned'].includes(k), k);
  }
  assert.equal(f.slots.find((x) => x.code === 'B2-P02-S1').ev, true, 'a vacant EV slot is shown with EV and counts as free');
});

test('draft preview: union of levels, zones (level + parking type) and single slots, filtered by vehicle type (AC-02)', () => {
  const zone = feedOf(sel({ areas: [{ level: 'B2', parkingType: 'PUZZLE' }], slotIds: ['1'] }));
  assert.deepEqual(zone.slots.map((x) => x.code).sort(), ['B1-010', 'B2-P02-S1']);
  assert.deepEqual(zone.counts.groups.map((g) => g.label), ['B2 · Puzzles', 'Basement B1']);
  assert.deepEqual(feedOf(sel({ levels: ['B2'], vehicleClass: '2W' })).slots.map((x) => x.code), ['B2-007']);
  assert.ok(!feedOf(sel({ levels: ['B2'], vehicleClass: '4W' })).slots.some((x) => x.type === 'TWO_WHEELER'));
  assert.equal(feedOf(sel({ levels: ['B3'] })).state, 'EMPTY');
  assert.equal(mod.draft.isEmptySelection(sel()), true, 'an empty selection can’t be saved');
});

test('DISPLAYS: on for Master Admin and Site Facility Manager, off for other system roles and every custom role (AC-19)', () => {
  const { isModulePermitted, getModuleRights } = mod.rbac;
  const user = (roleId, roleName) => ({ id: 'u', roleId, roleName });
  assert.equal(isModulePermitted(user('role-master-admin', 'Platform Master Admin'), undefined, 'DISPLAYS'), true);
  assert.equal(getModuleRights(user('role-site-manager', 'Site Facility Manager'), undefined, 'DISPLAYS').canEdit, true);
  for (const id of ['role-gate-attendant', 'role-employee-pass', 'role-valet-supervisor', 'role-mis-auditor']) assert.equal(isModulePermitted(user(id, 'x'), undefined, 'DISPLAYS'), false, id);
  // A custom role with no DISPLAYS entry: off, even when its name would match a role-name guess.
  const custom = { roleId: 'role-custom-1', modulePermissions: { HOME: { enabled: true } } };
  assert.equal(isModulePermitted(user('role-custom-1', 'Site Master Admin helper'), custom, 'DISPLAYS'), false);
  // A stored Master role without a DISPLAYS entry still gets the default (read-time, no migration).
  assert.equal(isModulePermitted(user('role-master-admin', 'Platform Master Admin'), { roleId: 'role-master-admin', modulePermissions: { HOME: { enabled: true } } }, 'DISPLAYS'), true);
});

test('display status words and hours (UX C1)', () => {
  const { displayState, hoursText } = mod.api;
  const row = (o) => ({ status: 'ACTIVE', online: false, setUp: false, ...o });
  assert.equal(displayState(row({ online: true, setUp: true, lastSeenAt: 'x' })), 'ONLINE');
  assert.equal(displayState(row({ setUp: true, lastSeenAt: 'x' })), 'OFFLINE');
  assert.equal(displayState(row({})), 'NOT_SET_UP');
  // The backend issues the credential at create (setUp: true) before any screen polls: still "Not set up".
  assert.equal(displayState(row({ setUp: true, lastSeenAt: null })), 'NOT_SET_UP');
  assert.equal(displayState(row({ status: 'SWITCHED_OFF', online: true })), 'SWITCHED_OFF');
  assert.equal(hoursText({ mode: 'DAILY', on: '07:00', off: '23:00' }), '07:00–23:00');
  assert.equal(hoursText({ mode: 'ALWAYS' }), 'Always on');
});

test('"Shows" summary in UX words (C1)', () => {
  const { selectionText } = mod.status;
  const sel = (o) => ({ levels: [], areas: [], slotIds: [], vehicleClass: 'ALL', ...o });
  assert.equal(selectionText({ selection: sel({ levels: ['B1', 'B2'], vehicleClass: '4W' }), slotCount: 120 }), 'B1, B2 · 4-wheelers · 120 slots');
  assert.equal(selectionText({ selection: sel({ areas: [{ level: 'B1', parkingType: 'PUZZLE' }], slotIds: ['a', 'b', 'c'] }), slotCount: 40 }), 'B1 · Puzzles, 3 single slots · 40 slots');
  assert.equal(selectionText({ selection: sel({ slotIds: ['a'], vehicleClass: '2W' }), slotCount: 1 }), '1 single slot · 2-wheelers · 1 slot');
});

test('override summary lines: what · who · until, IST (UX C8, AC-29)', () => {
  const { overrideLines, hasOverride, untilLabel } = mod.status;
  const now = Date.parse('2026-10-21T04:30:00Z'); // 10:00 IST
  const o = { message: { id: 'm', mode: 'BANNER', text: 'x', by: 'Priya Nair', until: '2026-10-21T14:00:00+05:30' }, forcedFull: { by: 'Arjun Rao', until: null }, hidden: 0, pinned: 0 };
  assert.deepEqual(overrideLines(o, now), ['Banner message · Priya Nair · until 14:00', 'Forced Parking full · Arjun Rao · until cleared']);
  assert.equal(untilLabel('2026-10-22T09:00:00+05:30', now), 'until 22 Oct, 09:00');
  assert.equal(hasOverride({ hidden: 3, pinned: 1 }), false, 'hidden/pinned alone is not an "Override active" badge');
  assert.equal(hasOverride(o), true);
});

test('end times are sent as the IST wall time with +05:30; the date list starts today in IST (03 v1.2)', () => {
  const { istIso, istDays } = mod.api;
  assert.equal(istIso('2026-10-21', '14:00'), '2026-10-21T14:00:00+05:30');
  assert.equal(Date.parse(istIso('2026-10-21', '14:00')), Date.parse('2026-10-21T08:30:00Z'));
  const late = Date.parse('2026-10-21T19:00:00Z'); // 00:30 IST on 22 Oct
  const days = istDays(3, late);
  assert.equal(days[0].value, '2026-10-22');
  assert.match(days[0].label, /^Today, 22 Oct 2026$/);
  assert.match(days[1].label, /^Tomorrow, 23 Oct 2026$/);
  assert.equal(istDays(31).length, 31, 'up to 31 days ahead');
});

// ---- 003 v1.5 F10 (US-19/20, AC-38, AC-42, AC-45) ------------------------------------------
test('F10 draft preview: layout is sent; Summary carries counts only, Summary + slot cards both (AC-38, AC-45)', () => {
  const base = feedOf(sel({ levels: ['B1', 'B2'] }));
  assert.equal(base.layout, 'SLOT_CARDS', 'default slot cards');
  assert.equal(base.summary, undefined);
  const sum = feedOf(sel({ levels: ['B1', 'B2'] }), { layout: 'SUMMARY' });
  assert.equal(sum.layout, 'SUMMARY');
  assert.equal('slots' in sum, false, 'no slots key at all');
  assert.ok(!/B1-0|B2-0|KA01|MH12/.test(JSON.stringify(sum)), 'no slot code or plate anywhere');
  assert.deepEqual(sum.summary.types, ['SEDAN', 'TWO_WHEELER', 'EV']);
  assert.deepEqual(sum.summary.rows.map((r) => [r.level, r.free, r.total]), [['B1', 1, 4], ['B2', 2, 3]]);
  assert.deepEqual(sum.summary.rows[0].cells, [{ type: 'SEDAN', free: 1, total: 4 }, { type: 'TWO_WHEELER', free: 0, total: 0 }, { type: 'EV', free: 0, total: 0 }]);
  assert.deepEqual(sum.summary.totals, [{ type: 'SEDAN', free: 1, total: 5 }, { type: 'TWO_WHEELER', free: 1, total: 1 }, { type: 'EV', free: 1, total: 1 }]);
  const both = feedOf(sel({ levels: ['B1', 'B2'] }), { layout: 'SUMMARY_CARDS' });
  assert.deepEqual(both.slots, base.slots);
  assert.deepEqual(both.summary, sum.summary);
  assert.deepEqual(both.counts, base.counts, 'counts unchanged by the layout');
  const hidden = feedOf(sel({ levels: ['B2'] }), { layout: 'SUMMARY', hidden: ['6'] });
  assert.deepEqual(hidden.summary.types, ['SEDAN', 'EV'], 'a hidden slot is left out of the summary (and its type column)');
});

test('F10 the console preview summary equals the server feed summary (one countSlots, AC-42)', async () => {
  const out = mkdtempSync(join(tmpdir(), 'pf-console-srv-'));
  await esbuild.build({ entryPoints: [join(ROOT, 'src/server/displayFeed.ts')], bundle: true, format: 'esm', platform: 'node', packages: 'external', outfile: join(out, 'feed.mjs'), logLevel: 'silent' });
  const { feedSummary } = await import(pathToFileURL(join(out, 'feed.mjs')).href);
  for (const pick of [SLOTS, SLOTS.slice(0, 4), SLOTS.filter((x) => x.basement === 'B2')]) assert.deepEqual(mod.draft.summaryOf(pick), feedSummary(pick));
});

test('F10 Displays "Shows" line names a non-default layout (UX E1)', () => {
  const { showsText } = mod.status;
  const d = { selection: sel({ levels: ['B1', 'B2'] }), slotCount: 360 };
  assert.equal(showsText(d), 'B1, B2 · 360 slots', 'slot cards (default) reads as before');
  assert.equal(showsText({ ...d, layout: 'SLOT_CARDS' }), 'B1, B2 · 360 slots');
  assert.equal(showsText({ ...d, layout: 'SUMMARY' }), 'Summary · B1, B2 · 360 slots');
  assert.equal(showsText({ ...d, layout: 'SUMMARY_CARDS' }), 'Summary + slot cards · B1, B2 · 360 slots');
});
