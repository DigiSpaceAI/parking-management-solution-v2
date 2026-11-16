// Shared helpers for the 006 persistence hotfix suites (backend-dev).
// Boots server.ts (Firestore off) or the cold-start harness (fake Firestore,
// FAKE_DATA_FILE so a test can restart on the same "Firestore"), and gives a
// small JSON client. No dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import net from 'node:net';

export const REPO = process.env.PF_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MASTER_EMAIL = 'digisolutions.fm@gmail.com';
export const PW = 'Hotfix006Password#2026';
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
  const reportPort = fake ? await freePort() : null; // fake Firestore control + report endpoints (harness)
  const workDir = mkdtempSync(path.join(tmpdir(), 'pf-006-'));
  if (prepare) await prepare(workDir); // e.g. put a built dist-display/ beside the server
  const fullEnv = { ...process.env, NODE_ENV: 'production', BOOTSTRAP_ADMIN_PASSWORD: PW, SEED_DEMO_USERS: 'false', GEMINI_API_KEY: '',
    K_SERVICE: '', SITE_SCOPE_MODE: '', AUDIT_HMAC_SECRET: 'd6'.repeat(32), PORT: String(port), PF_REPO: REPO, ...(reportPort ? { FAKE_REPORT_PORT: String(reportPort) } : {}),
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
  const ctl = async (p) => (await fetch(`http://127.0.0.1:${reportPort}${p}`)).json();
  return { origin, base: origin + '/api/v1', proc, workDir, getLog: () => log, rssMb: () => treeRssMb(proc.pid),
    // fake Firestore (harness): report() = writes/commits so far; fail('slots') = the next commit touching slots fails; ...
    report: () => ctl('/report'), ctl, doc: (c, id) => ctl(`/doc?c=${c}&id=${encodeURIComponent(id)}`), count: async (c) => (await ctl(`/count?c=${c}`)).count,
    fail: (collection, n = 1) => ctl(`/fail-commit?n=${n}${collection ? `&collection=${collection}` : ''}`), failGetAll: (n = 1) => ctl(`/fail-getall?n=${n}`),
    dropDoc: (c, id) => ctl(`/delete-doc?c=${c}&id=${encodeURIComponent(id)}`), counters: () => ctl('/counters'),
    stop: () => { proc.kill(); try { rmSync(workDir, { recursive: true, force: true }); } catch {} } };
}

export function client(srv) {
  const tok = {};
  const responses = []; // every response body, for the no-secret scans (T-10)
  async function call(who, method, url, { body, site, headers: extra, raw, absolute } = {}) {
    const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
    if (who) headers['x-session-token'] = tok[who] || who;
    if (site) headers['x-site-id'] = site;
    const res = await fetch((absolute ? srv.origin : srv.base) + url, { method, headers, redirect: 'manual',
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    responses.push(text);
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, text, headers: res.headers };
  }
  const c = {
    tok, call, responses,
    get: (who, url, o) => call(who, 'GET', url, o),
    post: (who, url, body, o = {}) => call(who, 'POST', url, { ...o, body }),
    async login(key, identifier, password = PW, { headers, extra } = {}) {
      const r = await call(null, 'POST', '/auth/login', { body: { identifier, password, ...(extra || {}) }, headers });
      assert.equal(r.status, 200, `login ${identifier}: ${JSON.stringify(r.body)}`);
      tok[key] = r.body.token;
      return r;
    },
    async mkUser(key, roleId, sites, tag = '') {
      await sleep(3);
      const handle = `d4.${tag}${key}`.toLowerCase();
      const email = `${handle}@d4-parkflows.test`;
      const r = await call('master', 'POST', '/rbac/users', { body: {
        username: handle, fullName: `D4 ${key}`, email, roleId,
        siteScopeType: 'SPECIFIC_SITES', assignedSiteIds: sites, status: 'ACTIVE', plainPassword: PW } });
      assert.ok(r.body.success, `create user ${key}: ${JSON.stringify(r.body)}`);
      await c.login(key, email);
      return r.body.user;
    },
    // Account created WITHOUT an admin password (reset-token flow), so it
    // neither counts on the per-admin password limiter nor is flagged.
    async mkUserViaToken(key, roleId, sites, { tag = '', siteScopeType = 'SPECIFIC_SITES', login = true } = {}) {
      await sleep(3);
      const handle = `d4.${tag}${key}`.toLowerCase();
      const email = `${handle}@d4-parkflows.test`;
      const r = await call('master', 'POST', '/rbac/users', { body: {
        username: handle, fullName: `D4 ${key}`, email, roleId, siteScopeType, assignedSiteIds: sites, status: 'ACTIVE' } });
      assert.equal(r.status, 200, `create user ${key}: ${JSON.stringify(r.body)}`);
      assert.ok(r.body.resetToken, 'token flow');
      const sp = await call(null, 'POST', '/auth/set-password', { body: { token: r.body.resetToken, newPassword: PW } });
      assert.equal(sp.status, 200, JSON.stringify(sp.body));
      if (login) await c.login(key, email);
      return { ...r.body.user, email };
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
  height: 'Standard (2.0m)', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT', ...extra });

// One bulk-upload request per row, a few ms apart: on main slot ids are
// slot-<ms>-<n> and a multi-row upload can collide (fixed in 003 R1-2).
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


// A server on the fake Firestore with a data file, so a test can restart on the
// same "Firestore" (a new process reloads everything from it).
export async function persistentServer(env = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pf-006-fs-'));
  const dataFile = path.join(dir, 'firestore.json');
  const all = { FAKE_DATA_FILE: dataFile, EMPTY_FIRESTORE: '1', ...env };
  let srv = await startServer({ fake: true, env: all });
  let c = client(srv);
  await c.login('master', MASTER_EMAIL);
  // The fake rewrites the file on every commit: retry a read that catches it mid-write.
  const read = () => { for (let i = 0; ; i++) { try { return JSON.parse(readFileSync(dataFile, 'utf-8')); } catch (e) { if (i > 20) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); } } };
  return {
    get srv() { return srv; }, get c() { return c; }, dataFile, read,
    ids: (coll) => (read()[coll] || []).map((d) => d.id),
    doc: (coll, id) => (read()[coll] || []).find((d) => d.id === id),
    async restart(extra = {}) { srv.stop(); srv = await startServer({ fake: true, env: { ...all, ...extra } }); c = client(srv); await c.login('master', MASTER_EMAIL); return { srv, c }; },
    stop: () => { srv.stop(); try { rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}
