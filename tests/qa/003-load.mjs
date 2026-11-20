#!/usr/bin/env node
// 003 B6 load test (03-tech-design v1.2 "Sizing on the single instance").
// Not part of test:qa (it runs for minutes). Run after `npm run build`:
//   node tests/qa/003-load.mjs                 # 100 TVs, 3 s polls, 10 minutes
//   LOAD_MINUTES=2 LOAD_TVS=100 node tests/qa/003-load.mjs
// It starts dist/server.cjs (Firestore off) with 5 sites x 1,080 slots and
// 20 displays per site, measures the console (/slots) and the gate
// (entry + exit) for a baseline period with no TVs, then runs the TVs
// (3 s +/- 300 ms, ?v= like the real page) while the same console and gate
// traffic continues and, unless RUN_001=0, the 001 backend suite runs
// alongside. Pass (03): feed p95 < 50 ms; console /slots and gate p95 within
// 20% of baseline (with a 2 ms floor for noise); no 429 for the TVs.
// Writes a JSON summary to stdout (last line) and exits 1 on FAIL.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.PF_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MINUTES = Number(process.env.LOAD_MINUTES || 10);
const TVS = Number(process.env.LOAD_TVS || 100);
const SITES = 5;
const SLOTS_PER_SITE = Number(process.env.LOAD_SLOTS_PER_SITE || 1080);
const BASELINE_S = Number(process.env.LOAD_BASELINE_S || 45);
const RUN_001 = process.env.RUN_001 !== '0';
const PW = 'LoadTest003Password#2026';
const MASTER = 'digisolutions.fm@gmail.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);

const server = path.join(REPO, 'dist', 'server.cjs');
if (!existsSync(server)) { console.error('Run `npm run build` first (dist/server.cjs missing).'); process.exit(2); }
const port = 6100 + Math.floor(Math.random() * 500);
const work = mkdtempSync(path.join(tmpdir(), 'pf-load-'));
const proc = spawn(process.execPath, [server], { cwd: work, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env,
  NODE_ENV: 'production', PORT: String(port), BOOTSTRAP_ADMIN_PASSWORD: PW, SEED_DEMO_USERS: 'false', GEMINI_API_KEY: '', K_SERVICE: '',
  SITE_SCOPE_MODE: '', AUDIT_HMAC_SECRET: 'l'.repeat(64), FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '', GCLOUD_PROJECT: '' } });
let serverErr = ''; proc.stderr.on('data', (d) => { serverErr = (serverErr + d).slice(-4000); });
const base = `http://127.0.0.1:${port}/api/v1`;
const cleanup = () => { try { proc.kill(); } catch {} try { rmSync(work, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

let token = '';
async function call(method, url, { body, site, headers = {} } = {}) {
  const t0 = performance.now();
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'x-session-token': token } : {}), ...(site ? { 'x-site-id': site } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, ms: performance.now() - t0, text, json: () => JSON.parse(text) };
}
const p = (arr, q) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)].toFixed(2); };

// ---------------------------------------------------------------- setup
for (let i = 0; i < 240; i++) { try { if ((await (await fetch(base + '/health')).json()).ready) break; } catch {} await sleep(250); }
const login = await call('POST', '/auth/login', { body: { identifier: MASTER, password: PW } });
if (login.status !== 200) { console.error('login failed', login.status, serverErr); process.exit(2); }
token = login.json().token;
const levels = ['B1', 'B2', 'B3', 'Ground'];
const sites = [];
for (let s = 0; s < SITES; s++) {
  const r = (await call('POST', '/sites/onboard', { body: { siteName: `Load ${s}`, siteCode: `LD${s}`, city: 'Pune', totalSlots: SLOTS_PER_SITE } })).json();
  const site = r.site.id;
  const rows = Array.from({ length: SLOTS_PER_SITE }, (_, i) => ({ slotNumber: `S${s}-${levels[i % 4]}-${String(i).padStart(4, '0')}`, basement: levels[i % 4],
    floorLocation: 'Level 1 near lift', slotType: i % 9 === 0 ? 'TWO_WHEELER' : 'SEDAN', height: '2.0m', parkingType: i % 3 === 0 ? 'GROUND' : 'PUZZLE', allocation: 'EMPLOYEE', status: 'VACANT' }));
  for (let i = 0; i < rows.length; i += 120) await call('POST', '/slots/bulk-upload', { site, body: { slots: rows.slice(i, i + 120) } });
  sites.push({ id: site, codes: rows.map((x) => x.slotNumber) });
}
const tvs = [];
for (let i = 0; i < TVS; i++) {
  const site = sites[i % SITES];
  const selection = i % 3 === 0 ? { levels: ['B1', 'B2'], areas: [], slotIds: [], vehicleClass: 'ALL' }
    : i % 3 === 1 ? { levels: [], areas: [{ level: 'B3', parkingType: 'PUZZLE' }], slotIds: [], vehicleClass: '4W' }
      : { levels: ['Ground', 'B3'], areas: [], slotIds: [], vehicleClass: 'ALL' };
  const r = await call('POST', '/displays', { site: site.id, body: { name: `TV ${i}`, location: `Gate ${i}`, selection } });
  if (r.status !== 200) { console.error('display create failed', r.status); process.exit(2); }
  tvs.push({ token: /#k=(.+)$/.exec(r.json().link)[1], v: '' });
}
log(`setup: ${SITES} sites x ${SLOTS_PER_SITE} slots, ${TVS} displays`);

// ---------------------------------------------------------------- traffic
const m = { baseline: { slots: [], gate: [] }, load: { slots: [], gate: [], feed: [], feed429: 0, feedOther: 0, feedOk: 0, unchanged: 0 } };
let phase = 'baseline';
let running = true;
let plate = 0;
const parked = [];
async function consoleLoop() { // a few console users refreshing Live parking
  while (running) {
    const site = sites[Math.floor(Math.random() * SITES)].id;
    const r = await call('GET', '/slots', { site });
    if (r.status === 200) m[phase].slots.push(r.ms);
    await sleep(500);
  }
}
async function gateLoop() { // entries and exits, ~2 per second
  while (running) {
    const site = sites[Math.floor(Math.random() * SITES)];
    let r;
    if (parked.length > 200 || (parked.length > 0 && Math.random() < 0.5)) {
      const v = parked.splice(Math.floor(Math.random() * parked.length), 1)[0];
      r = await call('POST', '/vehicles/exit', { site: v.site, body: { vehicleNumberOrSlot: v.plate } });
    } else {
      const vn = `MH12LT${String(plate++ % 10000).padStart(4, '0')}`;
      r = await call('POST', '/vehicles/entry', { site: site.id, body: { vehicleNumber: vn, targetSlotNumber: site.codes[Math.floor(Math.random() * site.codes.length)] } });
      if (r.status === 200) parked.push({ site: site.id, plate: vn });
    }
    if (r.status === 200) m[phase].gate.push(r.ms);
    await sleep(500);
  }
}
async function tvLoop(tv) {
  await sleep(Math.random() * 3000);
  while (running && phase === 'load') {
    const r = await call('GET', `/screen/feed${tv.v ? `?v=${tv.v}` : ''}`, { headers: { 'x-display-token': tv.token } });
    m.load.feed.push(r.ms);
    if (r.status === 200) { m.load.feedOk++; const t = r.text; if (t.startsWith('{"unchanged":true')) m.load.unchanged++; const mv = /"v":"([0-9a-f]+)"/.exec(t); if (mv) tv.v = mv[1]; }
    else if (r.status === 429) m.load.feed429++;
    else m.load.feedOther++;
    await sleep(3000 + (Math.random() * 600 - 300));
  }
}
const loops = [consoleLoop(), consoleLoop(), gateLoop(), gateLoop()];
log(`baseline ${BASELINE_S}s (console + gate, no TVs)`);
await sleep(BASELINE_S * 1000);
phase = 'load';
let suite = null; let suiteResult = null;
if (RUN_001) {
  suite = spawn(process.execPath, ['--test', path.join(REPO, 'tests', 'qa', '001-backend.api.test.mjs')], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  let out = ''; suite.stdout.on('data', (d) => { out += d; });
  suite.on('exit', (code) => { suiteResult = { exit: code, summary: (out.match(/^# (pass|fail) \d+/gm) || []).join(', ') }; });
}
log(`load ${MINUTES} min: ${TVS} TVs every 3 s +/- 300 ms${RUN_001 ? ' + the 001 backend suite' : ''}`);
const tvLoops = tvs.map(tvLoop);
const end = Date.now() + MINUTES * 60000;
while (Date.now() < end) { await sleep(30000); log(`  feed n=${m.load.feed.length} p95=${p(m.load.feed, 0.95)} ms, 429=${m.load.feed429}`); }
running = false; phase = 'done';
await Promise.allSettled([...loops, ...tvLoops]);
const login2 = await call('POST', '/auth/login', { body: { identifier: MASTER, password: PW } });

// ---------------------------------------------------------------- verdict
const within = (b, l) => b !== null && l !== null && l <= Math.max(b * 1.2, b + 2);
const r = {
  tvs: TVS, minutes: MINUTES, sites: SITES, slotsPerSite: SLOTS_PER_SITE,
  feed: { requests: m.load.feed.length, ok: m.load.feedOk, unchanged: m.load.unchanged, http429: m.load.feed429, otherErrors: m.load.feedOther, p50: p(m.load.feed, 0.5), p95: p(m.load.feed, 0.95), p99: p(m.load.feed, 0.99), ratePerSec: +(m.load.feed.length / (MINUTES * 60)).toFixed(1) },
  consoleSlots: { baselineP95: p(m.baseline.slots, 0.95), loadP95: p(m.load.slots, 0.95), nBaseline: m.baseline.slots.length, nLoad: m.load.slots.length },
  gate: { baselineP95: p(m.baseline.gate, 0.95), loadP95: p(m.load.gate, 0.95), nBaseline: m.baseline.gate.length, nLoad: m.load.gate.length },
  loginAfter: login2.status,
  suite001: RUN_001 ? suiteResult : 'skipped',
};
r.checks = {
  feedP95Under50ms: r.feed.p95 !== null && r.feed.p95 < 50,
  consoleWithin20pct: within(r.consoleSlots.baselineP95, r.consoleSlots.loadP95),
  gateWithin20pct: within(r.gate.baselineP95, r.gate.loadP95),
  no429ForTvs: r.feed.http429 === 0 && r.feed.otherErrors === 0,
  loginOk: login2.status === 200,
};
r.verdict = Object.values(r.checks).every(Boolean) ? 'PASS' : 'FAIL';
if (suite && suiteResult === null) { await new Promise((res) => { suite.on('exit', res); setTimeout(res, 120000); }); r.suite001 = suiteResult; }
console.log(JSON.stringify(r));
cleanup();
process.exit(r.verdict === 'PASS' ? 0 : 1);
