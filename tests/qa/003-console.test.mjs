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
  const entries = { draft: 'src/screens/Displays/draft.ts', rbac: 'src/utils/rbac.ts', api: 'src/screens/Displays/api.ts' };
  await esbuild.build({ entryPoints: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, join(ROOT, v)])), bundle: true, format: 'esm', platform: 'neutral', outdir: out, logLevel: 'silent' });
  for (const k of Object.keys(entries)) mod[k] = await import(pathToFileURL(join(out, `${k}.js`)).href);
});

const s = (id, slotNumber, basement, parkingType, status, extra = {}) => ({ id, slotNumber, basement, parkingType, status, slotType: 'SEDAN', allocation: 'EMPLOYEE', floorLocation: '', height: '2.0m', ...extra });
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
  assert.equal(displayState(row({ status: 'SWITCHED_OFF', online: true })), 'SWITCHED_OFF');
  assert.equal(hoursText({ mode: 'DAILY', on: '07:00', off: '23:00' }), '07:00–23:00');
  assert.equal(hoursText({ mode: 'ALWAYS' }), 'Always on');
});
