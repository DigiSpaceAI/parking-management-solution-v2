// Shared helpers for the 003 Live Parking Display suites (backend-dev).
// Boots server.ts (Firestore off) or the cold-start harness (fake Firestore,
// FAKE_DATA_FILE so a test can restart on the same "Firestore"), and gives a
// small JSON client. No dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

export const REPO = process.env.PF_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MASTER_EMAIL = 'digisolutions.fm@gmail.com';
export const PW = 'Display003Password#2026';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TSX = path.join(REPO, 'node_modules', '.bin', 'tsx');

// A port the OS says is free (a random pick could land on another test's server).
const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
});

// Resident memory (MB) of a process and all its descendants (tsx runs the
// server in a child process). Linux /proc only; null elsewhere.
export function treeRssMb(pid) {
  const kids = (p) => { try { return readFileSync(`/proc/${p}/task/${p}/children`, 'utf-8').trim().split(/\s+/).filter(Boolean).map(Number); } catch { return []; } };
  const rss = (p) => { try { const m = /VmRSS:\s+(\d+) kB/.exec(readFileSync(`/proc/${p}/status`, 'utf-8')); return m ? Number(m[1]) / 1024 : 0; } catch { return null; } };
  if (rss(pid) === null) return null;
  let total = 0; const todo = [pid];
  while (todo.length) { const p = todo.pop(); total += rss(p) || 0; todo.push(...kids(p)); }
  return total;
}

export async function startServer({ fake = false, env = {}, waitReady = true, prepare } = {}) {
  const port = await freePort();
  const workDir = mkdtempSync(path.join(tmpdir(), 'pf-003-'));
  if (prepare) await prepare(workDir); // e.g. put a built dist-display/ beside the server
  const fullEnv = { ...process.env, NODE_ENV: 'production', BOOTSTRAP_ADMIN_PASSWORD: PW, SEED_DEMO_USERS: 'false', GEMINI_API_KEY: '',
    K_SERVICE: '', SITE_SCOPE_MODE: '', AUDIT_HMAC_SECRET: 'd3'.repeat(32), PORT: String(port), PF_REPO: REPO,
    FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '', GCLOUD_PROJECT: '', ...env };
  const args = fake ? [path.join(REPO, 'tests', 'qa', 'support', 'coldstart-harness.mjs'), 'server'] : [path.join(REPO, 'server.ts')];
  const proc = spawn(TSX, args, { cwd: workDir, env: fullEnv, stdio: 'pipe' });
  let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  let exited = null; proc.on('exit', (c) => (exited = c));
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    if (exited !== null) break;
    try { const h = await fetch(origin + '/api/v1/health'); if (h.ok && (!waitReady || (await h.json()).ready !== false)) break; } catch {}
    await sleep(250);
  }
  if (exited !== null) throw new Error('server exited:\n' + log.slice(-2000));
  return { origin, base: origin + '/api/v1', proc, workDir, getLog: () => log, rssMb: () => treeRssMb(proc.pid),
    stop: () => { proc.kill(); try { rmSync(workDir, { recursive: true, force: true }); } catch {} } };
}

export function client(srv) {
  const tok = {};
  async function call(who, method, url, { body, site, headers: extra, raw, absolute } = {}) {
    const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
    if (who) headers['x-session-token'] = tok[who] || who;
    if (site) headers['x-site-id'] = site;
    const res = await fetch((absolute ? srv.origin : srv.base) + url, { method, headers, redirect: 'manual',
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, text, headers: res.headers };
  }
  const c = {
    tok, call,
    get: (who, url, o) => call(who, 'GET', url, o),
    post: (who, url, body, o = {}) => call(who, 'POST', url, { ...o, body }),
    async login(key, identifier, password = PW) {
      const r = await call(null, 'POST', '/auth/login', { body: { identifier, password } });
      assert.equal(r.status, 200, `login ${identifier}: ${JSON.stringify(r.body)}`);
      tok[key] = r.body.token;
    },
    async mkUser(key, roleId, sites, tag = '') {
      await sleep(3);
      const handle = `d3.${tag}${key}`.toLowerCase();
      const email = `${handle}@d3-parkflows.test`;
      const r = await call('master', 'POST', '/rbac/users', { body: {
        username: handle, fullName: `D3 ${key}`, email, roleId,
        siteScopeType: 'SPECIFIC_SITES', assignedSiteIds: sites, status: 'ACTIVE', plainPassword: PW } });
      assert.ok(r.body.success, `create user ${key}: ${JSON.stringify(r.body)}`);
      await c.login(key, email);
      return r.body.user;
    },
    async onboard(code, name) {
      await sleep(3);
      const r = await call('master', 'POST', '/sites/onboard', { body: { siteName: name, siteCode: code, city: 'Pune', totalSlots: 4,
        pricing: { hourlyRate: 40, dailyMaxRate: 300, monthlyPassRate: 2500, currency: 'INR', taxPercentage: 18 } } });
      assert.ok(r.body.success, JSON.stringify(r.body));
      return r.body.site;
    },
    async slots(siteId) { return (await call('master', 'GET', '/slots', { site: siteId })).body.slots; },
    async audit(action) {
      const r = await call('master', 'GET', '/security/audit-logs?limit=1000');
      return r.body.logs.filter((l) => !action || l.action === action);
    },
  };
  return c;
}

export const slot = (num, extra = {}) => ({ slotNumber: num, basement: 'B1', floorLocation: 'Level 1 near lift', slotType: 'SEDAN',
  height: 'Standard (2.0m)', parkingType: 'PUZZLE', allocation: 'EMPLOYEE', status: 'VACANT', ...extra });

// Bulk-uploads `rows` at the site and returns slotNumber -> slot.
// One request per row, a few ms apart. (Written when slot ids were
// slot-<ms>-<0..999> and could collide; since R1-2 they are UUIDs, and
// 003-slot-ids tests a single 400-row upload.)
export async function addSlots(c, siteId, rows) {
  for (const row of rows) {
    const r = await c.post('master', '/slots/bulk-upload', { slots: [row] }, { site: siteId });
    assert.ok(r.body.success, JSON.stringify(r.body));
    await sleep(3);
  }
  const all = await c.slots(siteId);
  assert.equal(new Set(all.map((s) => s.id)).size, all.length, 'fixture: slot ids are unique');
  return Object.fromEntries(all.map((s) => [s.slotNumber, s]));
}

// A server on the fake Firestore whose data file can be edited between restarts.
export async function seededServer(mutate, env = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pf-003-fs-'));
  const dataFile = path.join(dir, 'firestore.json');
  const boot = await startServer({ fake: true, env: { EMPTY_FIRESTORE: '1', FAKE_DATA_FILE: dataFile } });
  boot.stop();
  assert.ok(existsSync(dataFile), 'seed file written');
  const data = JSON.parse(readFileSync(dataFile, 'utf-8'));
  mutate(data);
  writeFileSync(dataFile, JSON.stringify(data));
  const s = await startServer({ fake: true, env: { FAKE_DATA_FILE: dataFile, ...env } });
  const cl = client(s);
  await cl.login('master', MASTER_EMAIL);
  return { srv: s, c: cl, dataFile, readData: () => { for (let i = 0; ; i++) { try { return JSON.parse(readFileSync(dataFile, 'utf-8')); } catch (e) { if (i > 20) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); } } }, // the fake rewrites the file on each commit
    async restart(extraEnv = {}) { s.stop(); const s2 = await startServer({ fake: true, env: { FAKE_DATA_FILE: dataFile, ...env, ...extraEnv } }); const c2 = client(s2); await c2.login('master', MASTER_EMAIL); return { srv: s2, c: c2 }; },
    stop: () => { s.stop(); try { rmSync(dir, { recursive: true, force: true }); } catch {} } };
}

// Keys anywhere in a JSON value (deep), for allow-list scans.
export function deepKeys(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => deepKeys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); deepKeys(x, out); }
  return out;
}

// The standard two-site fixture: Site A with 4W/2W slots on B1 (puzzles + open
// bays) and B2, Site B with its own slots, and the users AC-18/19/30 need.
export async function twoSites(c, prefix) {
  const F = {};
  F.A = await c.onboard(`${prefix}A`, `${prefix} Site A`);
  F.B = await c.onboard(`${prefix}B`, `${prefix} Site B`);
  F.slotsA = await addSlots(c, F.A.id, [
    slot('A-B1-P01', { puzzleNumber: 'P01' }), slot('A-B1-P02', { puzzleNumber: 'P01', slotType: 'EV' }), slot('A-B1-P03', { puzzleNumber: 'P02' }),
    slot('A-B1-G01', { parkingType: 'GROUND' }), slot('A-B1-G02', { parkingType: 'GROUND' }),
    slot('A-B2-G01', { basement: 'B2', parkingType: 'GROUND' }), slot('A-B2-G02', { basement: 'B2', parkingType: 'GROUND' }),
    slot('A-B2-W01', { basement: 'B2', parkingType: 'GROUND', slotType: 'TWO_WHEELER' }),
  ]);
  F.slotsB = await addSlots(c, F.B.id, [slot('B-B1-P01'), slot('B-B3-G01', { basement: 'B3', parkingType: 'GROUND' })]);
  F.adminA = await c.mkUser('adminA', 'role-site-manager', [F.A.id], prefix);
  F.adminB = await c.mkUser('adminB', 'role-site-manager', [F.B.id], prefix);
  F.attA = await c.mkUser('attA', 'role-gate-attendant', [F.A.id], prefix);
  F.misA = await c.mkUser('misA', 'role-mis-auditor', [F.A.id], prefix);
  const role = await c.post('master', '/rbac/roles', { roleName: `${prefix} custom`, roleCode: 'CUSTOM' });
  assert.ok(role.body.success, JSON.stringify(role.body));
  F.customA = await c.mkUser('customA', role.body.role.id, [F.A.id], prefix);
  return F;
}
