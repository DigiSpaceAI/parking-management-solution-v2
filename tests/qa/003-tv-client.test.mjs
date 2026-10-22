// 003 TV client (03 F2/F5/F7 "003-tv-client unit tests"). Node built-ins plus the repo's own
// esbuild and vite (already dev dependencies) to compile src/display; nothing is installed.
//   node --test tests/qa/003-tv-client.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'package.json'));
const esbuild = require('esbuild');

const MODULES = ['app', 'poll', 'hours', 'time', 'credential', 'reload', 'layout', 'decide', 'override'];
const mod = {};

before(async () => {
  const out = mkdtempSync(join(tmpdir(), 'pf-tv-'));
  await esbuild.build({
    entryPoints: MODULES.map((m) => join(ROOT, 'src/display', `${m}.ts`)),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outdir: out,
    logLevel: 'silent',
  });
  for (const m of MODULES) mod[m] = await import(pathToFileURL(join(out, `${m}.js`)).href);
});

// ---- fakes ------------------------------------------------------------------------------
/** IST wall time → ISO (UTC). */
const ist = (y, mo, d, h, mi, s = 0) => new Date(Date.UTC(y, mo - 1, d, h, mi, s) - 330 * 60000).toISOString();

function fakeEnv({ wall = Date.UTC(2000, 0, 1), hash = '' } = {}) {
  let mono = 1000;
  const timers = [];
  let seq = 0;
  const data = new Map();
  const env = {
    requests: [],
    reloads: 0,
    respond: null, // (req) => { status, body }
    mono: () => mono,
    wall: () => wall,
    random: () => 0.5,
    setTimeout: (fn, ms) => {
      const t = { id: ++seq, at: mono + ms, fn, ms };
      timers.push(t);
      return t.id;
    },
    clearTimeout: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    request: (method, url, headers, body, timeoutMs, done) => {
      const req = { method, url, headers, body, timeoutMs };
      env.requests.push(req);
      const r = env.respond ? env.respond(req) : { status: 0, body: null };
      done(r);
    },
    store: { get: (k) => (data.has(k) ? data.get(k) : null), set: (k, v) => data.set(k, v), remove: (k) => data.delete(k) },
    data,
    hash: () => hash,
    reload: () => {
      env.reloads += 1;
    },
    /** Move the monotonic clock, running due timers in order. */
    advance(ms) {
      const end = mono + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > end) break;
        timers.shift();
        mono = t.at;
        t.fn();
      }
      mono = end;
    },
    pending: () => timers.map((t) => t.ms),
    setWall: (w) => {
      wall = w;
    },
  };
  return env;
}

const TOKEN = 'A'.repeat(43);
const feed = (over = {}) => ({
  v: 'v1',
  serverTime: ist(2026, 10, 21, 9, 14, 32),
  state: 'OPEN',
  place: 'Main entrance',
  hours: { mode: 'ALWAYS' },
  pageSeconds: 8,
  counts: { free: 1, total: 2, groups: [{ label: 'Basement B1', free: 1, total: 2 }] },
  slots: [
    { code: 'B1-001', level: 'B1', area: 'B1 · Open bays', type: 'SEDAN', ev: false, parkingType: 'GROUND', status: 'VACANT' },
    { code: 'B1-002', level: 'B1', area: 'B1 · Open bays', type: 'SEDAN', ev: false, parkingType: 'GROUND', status: 'OCCUPIED', plate: 'MH12AB1234' },
  ],
  ...over,
});
const renders = () => {
  const frames = [];
  return { frames, render: (m) => frames.push(m) };
};
function start(env, respond) {
  env.respond = respond;
  const r = renders();
  const app = new mod.app.TvApp(env, r);
  app.start();
  return { app, r, last: () => r.frames[r.frames.length - 1] };
}

// ---- polling rules ------------------------------------------------------------------------
test('poll interval: 3 s ± 300 ms while open, 30 s while closed', () => {
  const { nextDelayMs } = mod.poll;
  assert.equal(nextDelayMs({ kind: 'ok', closed: false }, 0, 0), 2700);
  assert.equal(nextDelayMs({ kind: 'ok', closed: false }, 0, 0.5), 3000);
  assert.equal(nextDelayMs({ kind: 'ok', closed: false }, 0, 0.9999), 3300);
  assert.equal(nextDelayMs({ kind: 'ok', closed: true }, 0, 0.5), 30000);
});

test('backoff: 3 s doubling, capped at 15 s; 401/410 stop', () => {
  const { nextDelayMs, outcomeOf } = mod.poll;
  const r = { kind: 'retry' };
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((n) => nextDelayMs(r, n, 0.5)), [3000, 6000, 12000, 15000, 15000, 15000]);
  assert.deepEqual(outcomeOf(401, false), { kind: 'stop', reason: 'INVALID' });
  assert.deepEqual(outcomeOf(410, false), { kind: 'stop', reason: 'OFF' });
  for (const s of [0, 429, 500, 502, 503]) assert.equal(outcomeOf(s, false).kind, 'retry', String(s));
  assert.equal(nextDelayMs(outcomeOf(410, false), 0, 0.5), null);
});

test('stale thresholds: > 30 s stale, > 120 s unavailable', () => {
  const { freshness } = mod.poll;
  assert.equal(freshness(30000), 'LIVE');
  assert.equal(freshness(30001), 'STALE');
  assert.equal(freshness(120000), 'STALE');
  assert.equal(freshness(120001), 'UNAVAILABLE');
});

// ---- the app ------------------------------------------------------------------------------
test('credential: #k= wins and is remembered; a reload uses the remembered one; junk is ignored', () => {
  const env = fakeEnv({ hash: `#k=${TOKEN}` });
  const { app } = start(env, () => ({ status: 200, body: feed() }));
  assert.equal(app.credential, 'OK');
  assert.equal(env.requests[0].headers['x-display-token'], TOKEN);
  assert.doesNotMatch(env.requests[0].url, new RegExp(TOKEN), 'the token never goes in a URL');
  assert.equal(env.data.get(mod.credential.TOKEN_KEY), TOKEN);
  assert.equal(mod.credential.readCredential('', env.store), TOKEN);
  assert.equal(mod.credential.tokenFromHash('#k=<script>'), null);
  assert.equal(mod.credential.tokenFromHash('#x=1&k=' + TOKEN), TOKEN);
  const none = fakeEnv();
  const s = start(none, () => ({ status: 200, body: feed() }));
  assert.equal(s.last().view, 'PAIRING');
  assert.equal(none.requests.filter((r) => r.url.indexOf('/screen/feed') >= 0).length, 0, 'no credential: no feed request, pairing instead');
});

test('live → stale after 30 s → unavailable after 120 s, on the monotonic clock only', () => {
  const env = fakeEnv({ hash: `#k=${TOKEN}` });
  let up = true;
  const { app } = start(env, () => (up ? { status: 200, body: feed() } : { status: 0, body: null }));
  assert.equal(app.model().view, 'LIVE');
  up = false;
  env.setWall(Date.UTC(2031, 5, 1)); // the TV clock jumps years: no effect
  env.advance(30000);
  assert.equal(app.model().view, 'LIVE');
  assert.equal(app.model().stale, false);
  env.advance(1500);
  assert.equal(app.model().view, 'LIVE');
  assert.equal(app.model().stale, true);
  env.advance(90000);
  assert.equal(app.model().view, 'UNAVAILABLE');
  assert.ok(app.model().feed, 'data is kept, only hidden');
  up = true;
  env.advance(15000); // the next retry is at most 15 s away
  assert.equal(app.model().view, 'LIVE', 'recovers by itself (AC-16)');
  assert.equal(app.model().stale, false);
});

test('network failures back off 3, 6, 12, 15, 15 s; success resets to 3 s', () => {
  const env = fakeEnv({ hash: `#k=${TOKEN}` });
  let up = false;
  start(env, () => (up ? { status: 200, body: feed() } : { status: 503, body: { errorCode: 'ERR_STARTING' } }));
  const gaps = [];
  for (let i = 0; i < 5; i++) {
    gaps.push(env.pending()[0]);
    env.advance(env.pending()[0]);
  }
  assert.deepEqual(gaps, [3000, 6000, 12000, 15000, 15000]);
  up = true;
  env.advance(env.pending()[0]);
  assert.equal(env.pending()[0], 3000);
});

test('410 stops polling and drops slot data (switched off); 401 = link not valid', () => {
  const env = fakeEnv({ hash: `#k=${TOKEN}` });
  let status = 200;
  const { app } = start(env, () => (status === 200 ? { status, body: feed() } : { status, body: { errorCode: 'ERR_SCREEN_OFF' } }));
  status = 410;
  env.advance(3000);
  assert.equal(app.model().view, 'OFF');
  assert.equal(app.model().feed, null);
  const n = env.requests.length;
  env.advance(10 * 60000);
  assert.equal(env.requests.length, n, 'no more polls');
  assert.deepEqual(env.pending(), []);
  const e2 = fakeEnv({ hash: `#k=${TOKEN}` });
  const s2 = start(e2, () => ({ status: 401, body: { errorCode: 'ERR_SCREEN_TOKEN' } }));
  assert.equal(s2.last().view, 'INVALID');
  assert.deepEqual(e2.pending(), []);
});

test('?v= is sent; an unchanged answer keeps the slots and refreshes the time', () => {
  const env = fakeEnv({ hash: `#k=${TOKEN}` });
  let n = 0;
  const { app } = start(env, () => {
    n += 1;
    return n === 1 ? { status: 200, body: feed() } : { status: 200, body: { unchanged: true, v: 'v1', serverTime: ist(2026, 10, 21, 9, 14, 35), state: 'OPEN' } };
  });
  env.advance(3000);
  assert.match(env.requests[1].url, /\?v=v1$/);
  assert.equal(app.model().feed.slots.length, 2);
  assert.equal(app.model().feed.serverTime, ist(2026, 10, 21, 9, 14, 35));
});

test('closed: polls every 30 s; the TV closes and opens by itself from the server offset when unreachable', () => {
  const hours = { mode: 'DAILY', on: '07:00', off: '23:00' };
  // Open at 22:59:30 IST, then the network goes; the TV's own clock says the year 2000.
  const env = fakeEnv({ hash: `#k=${TOKEN}`, wall: Date.UTC(2000, 0, 1) });
  let up = true;
  const { app } = start(env, () => (up ? { status: 200, body: feed({ hours, serverTime: ist(2026, 10, 21, 22, 59, 30) }) } : { status: 0, body: null }));
  assert.equal(app.model().view, 'LIVE');
  up = false;
  env.advance(29000); // 22:59:59
  assert.equal(app.model().view, 'LIVE');
  env.advance(7000); // 23:00:06, last answer 36 s old: the TV's own rule
  assert.equal(app.model().view, 'CLOSED');
  // A CLOSED answer is trusted while current, and polling slows to 30 s.
  const e2 = fakeEnv({ hash: `#k=${TOKEN}` });
  const s2 = start(e2, () => ({ status: 200, body: feed({ hours, state: 'CLOSED', slots: undefined, counts: { free: 0, total: 0, groups: [] }, serverTime: ist(2026, 10, 22, 6, 59, 0) }) }));
  assert.equal(s2.app.model().view, 'CLOSED');
  assert.deepEqual(e2.pending(), [30000]);
  // Opening time passes with no network: the TV opens by itself and, with no slot data yet, waits.
  e2.respond = () => ({ status: 0, body: null });
  e2.advance(70000); // 07:00:10
  assert.notEqual(s2.app.model().view, 'CLOSED');
});

test('hours rule: daytime and overnight windows, IST', () => {
  const { isOpenAt } = mod.hours;
  const at = (h, m) => Date.parse(ist(2026, 10, 21, h, m));
  const day = { mode: 'DAILY', on: '07:00', off: '23:00' };
  assert.equal(isOpenAt(day, at(6, 59)), false);
  assert.equal(isOpenAt(day, at(7, 0)), true);
  assert.equal(isOpenAt(day, at(22, 59)), true);
  assert.equal(isOpenAt(day, at(23, 0)), false);
  const night = { mode: 'DAILY', on: '18:00', off: '02:00' };
  assert.equal(isOpenAt(night, at(17, 59)), false);
  assert.equal(isOpenAt(night, at(23, 30)), true);
  assert.equal(isOpenAt(night, at(1, 59)), true);
  assert.equal(isOpenAt(night, at(2, 0)), false);
  assert.equal(isOpenAt({ mode: 'ALWAYS' }, at(3, 0)), true);
  assert.equal(mod.time.fmtTime(at(9, 5)), '09:05');
});

test('daily reload: once, 04:00–04:30 IST, only when closed or up more than 20 h', () => {
  const { shouldReload, pickReloadMinute } = mod.reload;
  const m = pickReloadMinute(0.5); // 04:15
  assert.equal(m, 255);
  const at = (h, mi) => Date.parse(ist(2026, 10, 21, h, mi));
  const base = { reloadMinute: m, uptimeMs: 0, closed: true, lastReloadDay: null };
  assert.equal(shouldReload({ ...base, nowMs: at(4, 14) }), false);
  assert.equal(shouldReload({ ...base, nowMs: at(4, 15) }), true);
  assert.equal(shouldReload({ ...base, nowMs: at(4, 30) }), false);
  assert.equal(shouldReload({ ...base, nowMs: at(4, 20), closed: false }), false);
  assert.equal(shouldReload({ ...base, nowMs: at(4, 20), closed: false, uptimeMs: 21 * 3600e3 }), true);
  assert.equal(shouldReload({ ...base, nowMs: at(4, 20), lastReloadDay: '2026-10-21' }), false);
});

// ---- F3: which cards, paging, full, just freed, pairing ----------------------------------------
const slot = (code, status, extra = {}) => ({ code, level: code.slice(0, 2), area: 'x', type: 'SEDAN', ev: false, parkingType: 'GROUND', status, ...(status === 'OCCUPIED' ? { plate: 'KA01AB1234' } : {}), ...extra });
const many = (prefix, n, status) => Array.from({ length: n }, (_, i) => slot(`${prefix}-${String(i + 1).padStart(3, '0')}`, status));

test('vacant first: one page → vacant then taken in feed order, as many as fit (AC-07)', () => {
  const { gridLayout } = mod.layout;
  const slots = [...many('B1', 5, 'VACANT'), ...many('B2', 6, 'OCCUPIED'), slot('B1-R', 'RESERVED'), slot('B1-M', 'MAINTENANCE')];
  const g = gridLayout(slots, 12, 0, {});
  assert.equal(g.mode, 'MIXED');
  assert.equal(g.cards.length, 12);
  assert.deepEqual(g.cards.map((c) => c.status), [...Array(5).fill('VACANT'), ...Array(6).fill('OCCUPIED'), 'RESERVED']);
});

test('more vacant than fit: vacant-only pages; the last page is filled with taken slots; a taken card never takes a vacant place (AC-12)', () => {
  const { gridLayout } = mod.layout;
  const slots = [...many('B1', 30, 'VACANT'), ...many('B2', 20, 'OCCUPIED')];
  const p1 = gridLayout(slots, 12, 0, {});
  assert.equal(p1.mode, 'PAGING');
  assert.deepEqual([p1.page, p1.pages, p1.vacant], [1, 3, 30]);
  assert.ok(p1.cards.every((c) => c.status === 'VACANT'));
  const p3 = gridLayout(slots, 12, 2, {});
  assert.equal(p3.cards.length, 12);
  assert.deepEqual(p3.cards.slice(0, 6).map((c) => c.code), many('B1', 30, 'VACANT').slice(24).map((c) => c.code));
  assert.ok(p3.cards.slice(6).every((c) => c.status === 'OCCUPIED'));
  assert.equal(gridLayout(slots, 12, 3, {}).page, 1, 'wraps');
  assert.equal(gridLayout(slots, 8, 0, {}).pages, 4, '8 per page under a banner');
});

test('Parking full: occupied cards only, no paging, reserved and maintenance left out (AC-10)', () => {
  const { gridLayout, footerText } = mod.layout;
  const slots = [...many('B1', 20, 'OCCUPIED'), slot('B1-R', 'RESERVED'), slot('B1-M', 'MAINTENANCE')];
  const g = gridLayout(slots, 12, 5, {});
  assert.equal(g.mode, 'FULL');
  assert.equal(g.cards.length, 12);
  assert.ok(g.cards.every((c) => c.status === 'OCCUPIED'));
  assert.equal(footerText(g, 22, { banner: false, forced: false }), 'Every slot is taken · showing occupied slots only');
  const one = gridLayout([...slots, slot('B9-001', 'VACANT')], 12, 0, {});
  assert.equal(one.mode, 'MIXED');
  assert.equal(one.cards[0].code, 'B9-001', 'a freed slot comes first, even from the full state (AC-09)');
});

test('footer copy', () => {
  const { gridLayout, footerText, groupIndian, joinLabels } = mod.layout;
  assert.equal(footerText(gridLayout([...many('B1', 46, 'VACANT')], 12, 1, {}), 1080, { banner: false, forced: false }), 'Vacant slots only · 46 vacant on 4 pages');
  assert.equal(footerText(gridLayout([...many('B1', 3, 'VACANT'), ...many('B2', 20, 'OCCUPIED')], 12, 0, {}), 1080, { banner: false, forced: false }), 'Vacant first, then occupied, reserved, maintenance · showing 12 of 1,080 slots');
  assert.equal(groupIndian(1234567), '12,34,567');
  assert.equal(joinLabels(['Basement B1', 'Basement B2']), 'Basement B1 and B2');
  assert.equal(joinLabels(['Basement B1', 'B2 · Puzzles'], 'or'), 'Basement B1 or B2 · Puzzles');
});

test('just freed: from two feeds only, first among the vacant cards for 10 s; nothing after a reload', () => {
  const env = fakeEnv({ hash: `#k=${TOKEN}` });
  let body = feed({ v: 'a', slots: [slot('B1-001', 'VACANT'), slot('B1-002', 'VACANT'), slot('B1-009', 'OCCUPIED')] });
  const { app } = start(env, () => ({ status: 200, body }));
  assert.deepEqual(app.model().justFreed, {}, 'nothing is "just freed" on the first feed');
  body = feed({ v: 'b', slots: [slot('B1-001', 'VACANT'), slot('B1-002', 'VACANT'), slot('B1-009', 'VACANT')] });
  env.advance(3000);
  const m = app.model();
  assert.deepEqual(m.justFreed, { 'B1-009': true });
  assert.equal(m.grid.cards[0].code, 'B1-009');
  env.advance(9000);
  assert.ok(app.model().justFreed['B1-009']);
  env.advance(1500);
  assert.deepEqual(app.model().justFreed, {});
  assert.equal(app.model().grid.cards[0].code, 'B1-001', 'back to slot-code order');
});

test('paging advances every pageSeconds on the 1 s tick and shows the time to the next page', () => {
  const env = fakeEnv({ hash: `#k=${TOKEN}` });
  const { app } = start(env, () => ({ status: 200, body: feed({ pageSeconds: 5, slots: many('B1', 30, 'VACANT') }) }));
  assert.equal(app.model().grid.page, 1);
  for (let i = 0; i < 4; i++) { env.advance(1000); app.tick(); }
  assert.equal(app.model().grid.page, 1);
  assert.equal(app.model().nextPageS, 1);
  env.advance(1000); app.tick();
  assert.equal(app.model().grid.page, 2);
});

test('pairing: shows a code, polls with the secret only, takes the token once and starts polling the feed', () => {
  const env = fakeEnv();
  let n = 0;
  const { app } = start(env, (req) => {
    if (req.url.endsWith('/pair/start')) return { status: 200, body: { code: 'K7M4QP', pairSecret: 'S'.repeat(43), expiresIn: 600 } };
    if (req.url.endsWith('/pair/status')) return ++n < 3 ? { status: 200, body: { state: 'WAITING' } } : { status: 200, body: { state: 'PAIRED', token: TOKEN } };
    return { status: 200, body: feed() };
  });
  assert.equal(app.model().view, 'PAIRING');
  assert.equal(app.model().pairCode, 'K7M4QP');
  env.advance(3000);
  assert.equal(env.requests[1].headers['x-pair-secret'], 'S'.repeat(43));
  assert.doesNotMatch(env.requests[1].url, /S{43}/);
  env.advance(6000);
  assert.equal(app.credential, 'OK');
  assert.equal(env.data.get(mod.credential.TOKEN_KEY), TOKEN, 'kept for a reload (AC-16)');
  assert.equal(app.model().view, 'LIVE');
  assert.equal(env.requests[env.requests.length - 1].headers['x-display-token'], TOKEN);
});

test('pairing: an expired code (410) or a code past its 10 minutes gets a new code', () => {
  const env = fakeEnv();
  let starts = 0;
  let expire = false;
  const { app } = start(env, (req) => {
    if (req.url.endsWith('/pair/start')) { starts += 1; return { status: 200, body: { code: 'AAA' + starts + 'BB', pairSecret: 'S'.repeat(40) + starts, expiresIn: 600 } }; }
    return expire ? { status: 410, body: {} } : { status: 200, body: { state: 'WAITING' } };
  });
  expire = true;
  env.advance(3000);
  assert.equal(starts, 2);
  assert.equal(app.model().pairCode, 'AAA2BB');
  expire = false;
  env.advance(600000);
  app.tick();
  assert.equal(starts, 3, 'a new code after 10 minutes');
});

// ---- F5: precedence (AC-28) and the override cache ---------------------------------------
const NOW = Date.parse(ist(2026, 10, 21, 10, 0));
const msg = (mode, endsAt = null) => ({ id: 'm1', text: 'Level B2 closed', mode, endsAt });
const base = { credential: 'OK', now: NOW, closed: false, lastOkAgeMs: 1000, feedState: 'OPEN', message: null, forcedFull: null };

test('decideScreen: the AC-28 order, first match wins', () => {
  const { decideScreen } = mod.decide;
  const v = (o) => decideScreen({ ...base, ...o }).view;
  const full = msg('FULL');
  const ff = { endsAt: null };
  // 1 switched off / link not valid beat everything, 2 the full-screen message beats closed, …
  assert.equal(v({ credential: 'OFF', message: full, closed: true, forcedFull: ff }), 'OFF');
  assert.equal(v({ credential: 'INVALID', message: full }), 'INVALID');
  assert.equal(v({ message: full, closed: true, feedState: 'EMPTY', forcedFull: ff, lastOkAgeMs: 500000 }), 'TAKEOVER');
  assert.equal(v({ closed: true, feedState: 'EMPTY', forcedFull: ff, lastOkAgeMs: 500000 }), 'CLOSED');
  assert.equal(v({ feedState: 'EMPTY', forcedFull: ff, lastOkAgeMs: 500000 }), 'EMPTY');
  assert.equal(v({ lastOkAgeMs: 120001 }), 'UNAVAILABLE');
  assert.equal(v({ forcedFull: ff }), 'FORCED_FULL');
  assert.equal(v({}), 'LIVE');
  assert.equal(v({ credential: 'NONE' }), 'PAIRING');
  assert.equal(v({ feedState: null }), 'STARTING');
});

test('decideScreen: overlays — banner over live / forced full / unavailable; stale over live and forced full; forced full + 2 min keeps the look, hides the cards', () => {
  const { decideScreen } = mod.decide;
  const d = (o) => decideScreen({ ...base, ...o });
  const b = msg('BANNER');
  for (const [o, view] of [[{}, 'LIVE'], [{ forcedFull: { endsAt: null } }, 'FORCED_FULL'], [{ lastOkAgeMs: 200000 }, 'UNAVAILABLE']]) {
    const r = d({ ...o, message: b });
    assert.equal(r.view, view);
    assert.equal(r.banner, b, `banner on ${view}`);
  }
  assert.equal(d({ message: b, closed: true }).banner, null, 'no banner on Closed');
  assert.equal(d({ lastOkAgeMs: 31000 }).staleBanner, true);
  assert.equal(d({ lastOkAgeMs: 31000, forcedFull: { endsAt: null } }).staleBanner, true);
  assert.equal(d({ lastOkAgeMs: 29000 }).staleBanner, false);
  const hidden = d({ lastOkAgeMs: 130000, forcedFull: { endsAt: null } });
  assert.deepEqual([hidden.view, hidden.cardsHidden, hidden.staleBanner], ['FORCED_FULL', true, false]);
});

test('decideScreen: an override past its end time is ignored (end checked against the server-offset clock)', () => {
  const { decideScreen, isActive } = mod.decide;
  const past = new Date(NOW - 1000).toISOString();
  const future = new Date(NOW + 1000).toISOString();
  assert.equal(decideScreen({ ...base, message: msg('FULL', past) }).view, 'LIVE');
  assert.equal(decideScreen({ ...base, message: msg('FULL', future) }).view, 'TAKEOVER');
  assert.equal(decideScreen({ ...base, forcedFull: { endsAt: past } }).view, 'LIVE');
  assert.equal(isActive({ endsAt: null }, NOW), true);
});

const withOverride = (override, over = {}) => feed({ override, siteName: 'Alphatech Tower', ...over });

test('a takeover stays through polling failure until its end, then goes within 1 s; with no end it stays until a good poll says otherwise', () => {
  const env = fakeEnv({ hash: `#k=${TOKEN}` });
  const end = new Date(Date.parse(ist(2026, 10, 21, 9, 14, 32)) + 60000).toISOString(); // 1 min after the feed's serverTime
  let up = true;
  const { app } = start(env, () => (up ? { status: 200, body: withOverride({ message: msg('FULL', end), forcedFull: null }) } : { status: 0, body: null }));
  assert.equal(app.model().view, 'TAKEOVER');
  up = false;
  env.advance(59000);
  assert.equal(app.model().view, 'TAKEOVER', 'kept while the network is down');
  env.advance(1500);
  assert.notEqual(app.model().view, 'TAKEOVER', 'gone within a second of its end time');
  // no end time: stays until a successful poll without it
  const e2 = fakeEnv({ hash: `#k=${TOKEN}` });
  let body = withOverride({ message: msg('FULL'), forcedFull: null });
  let ok = true;
  const s2 = start(e2, () => (ok ? { status: 200, body } : { status: 0, body: null }));
  ok = false;
  e2.advance(10 * 60000);
  assert.equal(s2.app.model().view, 'TAKEOVER');
  ok = true;
  body = withOverride({ message: null, forcedFull: null }, { v: 'v2' });
  e2.advance(15000);
  assert.equal(s2.app.model().view, 'LIVE', 'a clear arrives with the next good poll (AC-24)');
});

test('the override cache survives a reload with no network, is ignored for another display, and is wiped by 401/410', () => {
  const env = fakeEnv({ hash: `#k=${TOKEN}` });
  start(env, () => ({ status: 200, body: withOverride({ message: msg('BANNER'), forcedFull: { endsAt: null } }) }));
  assert.ok(env.data.get(mod.override.OVERRIDE_KEY), 'cached');
  // reload, no network: same credential → forced full + banner from the cache, cards hidden (no slot data yet)
  const again = fakeEnv({ hash: '' });
  again.data.set(mod.credential.TOKEN_KEY, TOKEN);
  again.data.set(mod.override.OVERRIDE_KEY, env.data.get(mod.override.OVERRIDE_KEY));
  const r = start(again, () => ({ status: 0, body: null }));
  const m = r.app.model();
  assert.equal(m.view, 'FORCED_FULL');
  assert.equal(m.cardsHidden, true);
  // another display (another credential) ignores it
  const other = fakeEnv({ hash: `#k=${'B'.repeat(43)}` });
  other.data.set(mod.override.OVERRIDE_KEY, env.data.get(mod.override.OVERRIDE_KEY));
  const o = start(other, () => ({ status: 0, body: null }));
  assert.equal(o.app.model().view, 'STARTING');
  // 410 wipes it
  let status = 200;
  const w = fakeEnv({ hash: `#k=${TOKEN}` });
  start(w, () => (status === 200 ? { status, body: withOverride({ message: msg('FULL'), forcedFull: null }) } : { status, body: {} }));
  status = 410;
  w.advance(3000);
  assert.equal(w.data.has(mod.override.OVERRIDE_KEY), false);
});

test('forced full: occupied cards only, every count 0, no paging; a banner makes it 8 per page', () => {
  const env = fakeEnv({ hash: `#k=${TOKEN}` });
  const slots = [...many('B1', 30, 'VACANT'), ...many('B2', 20, 'OCCUPIED')];
  let override = { message: null, forcedFull: { endsAt: null } };
  const { app } = start(env, () => ({ status: 200, body: withOverride(override, { v: JSON.stringify(override), slots }) }));
  let m = app.model();
  assert.equal(m.view, 'FORCED_FULL');
  assert.equal(m.grid.mode, 'FULL');
  assert.equal(m.grid.cards.length, 12);
  assert.ok(m.grid.cards.every((c) => c.status === 'OCCUPIED'), 'vacant slots are not shown');
  override = { message: msg('BANNER'), forcedFull: null };
  env.advance(3000);
  m = app.model();
  assert.equal(m.view, 'LIVE');
  assert.equal(m.grid.cards.length, 8);
  assert.equal(m.grid.pages, 4, '30 vacant at 8 per page');
});

test('until text: today → HH:mm, another day → D MMM, HH:mm (03 O-1)', () => {
  const { untilText } = mod.time;
  assert.equal(untilText(ist(2026, 10, 21, 14, 0), NOW), '14:00');
  assert.equal(untilText(ist(2026, 10, 22, 9, 0), NOW), '22 Oct, 09:00');
  assert.equal(untilText(null, NOW), '');
});

// ---- F7: pinned slots (US-17, AC-27, 03 O-5) ------------------------------------------------
test('pinned order: a pinned vacant slot is first on page 1; a pinned occupied slot is the first taken card and never displaces a vacant one', () => {
  const { gridLayout } = mod.layout;
  const vac = many('B1', 14, 'VACANT');
  vac[9] = { ...vac[9], pinned: true };
  const occ = many('B2', 6, 'OCCUPIED');
  occ[4] = { ...occ[4], pinned: true };
  const slots = [...vac, ...occ, slot('B9-R', 'RESERVED')]; // feed order without the server's pinned-first sort
  const p1 = gridLayout(slots, 12, 0, {});
  assert.equal(p1.cards[0].code, vac[9].code, 'pinned vacant first');
  assert.ok(p1.cards.every((c) => c.status === 'VACANT'), 'page 1 is all vacant: vacant-first wins');
  const p2 = gridLayout(slots, 12, 1, {});
  assert.deepEqual(p2.cards.slice(0, 2).map((c) => c.status), ['VACANT', 'VACANT']);
  assert.equal(p2.cards[2].code, occ[4].code, 'the pinned occupied slot is the first taken card on the last vacant page');
  // With room on page 1, it is on page 1, right after the vacant cards.
  const few = gridLayout([...vac.slice(0, 3), ...occ, slot('B9-R', 'RESERVED')], 12, 0, {});
  assert.equal(few.cards[3].code, occ[4].code);
  // Full and forced full: it is the first card.
  assert.equal(gridLayout(occ, 12, 0, {}).cards[0].code, occ[4].code);
  assert.equal(gridLayout([...vac, ...occ], 12, 0, {}, true).cards[0].code, occ[4].code);
});

// ---- the built bundle -----------------------------------------------------------------------
function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c === 'object' && walk(c, visit));
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, visit);
  }
}

test('build:display output is ES2015 for Chromium 53 (syntax, runtime APIs, CSS, classic script)', (t) => {
  // Its own temp folder, so two test runs at the same time (e.g. review and QA) can't collide.
  const dist = mkdtempSync(join(tmpdir(), 'pf-tv-dist-'));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  const r = spawnSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.display.config.ts', '--outDir', dist, '--emptyOutDir'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const html = readFileSync(join(dist, 'tv.html'), 'utf8');
  assert.doesNotMatch(html, /type="module"|modulepreload/, 'a classic script, no ES modules');
  const assets = readdirSync(join(dist, 'assets'));
  const js = assets.filter((f) => f.endsWith('.js'));
  const css = assets.filter((f) => f.endsWith('.css'));
  assert.equal(js.length, 1, 'one script, no chunks');
  const code = readFileSync(join(dist, 'assets', js[0]), 'utf8');
  // Syntax newer than ES2015, found on the AST (the parser itself has no ES-version switch).
  const { parse } = require('@babel/parser');
  const ast = parse(code, { sourceType: 'script', errorRecovery: false });
  const found = new Set();
  walk(ast.program, (n) => {
    if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'ObjectMethod' || n.type === 'ClassMethod') && n.async) found.add('async function');
    if (n.type === 'AwaitExpression') found.add('await');
    if (n.type === 'BinaryExpression' && n.operator === '**') found.add('**');
    if (n.type === 'AssignmentExpression' && ['**=', '&&=', '||=', '??='].includes(n.operator)) found.add(n.operator);
    if (n.type === 'LogicalExpression' && n.operator === '??') found.add('??');
    if (n.type === 'OptionalMemberExpression' || n.type === 'OptionalCallExpression') found.add('?.');
    if (n.type === 'ObjectExpression' && n.properties.some((p) => p.type === 'SpreadElement')) found.add('object spread');
    if (n.type === 'ObjectPattern' && n.properties.some((p) => p.type === 'RestElement')) found.add('object rest');
    if (n.type === 'CatchClause' && !n.param) found.add('optional catch binding');
    if (n.type === 'ClassProperty' || n.type === 'ClassPrivateProperty' || n.type === 'ClassPrivateMethod') found.add('class fields');
    if (n.type === 'BigIntLiteral') found.add('BigInt');
    if (n.type === 'ForOfStatement' && n.await) found.add('for await');
    if (n.type === 'RegExpLiteral' && (/[sd]/.test(n.flags) || /\(\?<[=!]?/.test(n.pattern))) found.add(`regex /${n.pattern}/${n.flags}`);
  });
  assert.deepEqual([...found], [], 'post-ES2015 syntax in the TV bundle');
  // Runtime APIs Chromium 53 doesn't have (esbuild lowers syntax, not APIs).
  for (const api of ['getOwnPropertyDescriptors', 'padStart', 'padEnd', 'Object.values', 'Object.entries', 'fromEntries', '.flatMap(', '.flat(', 'replaceAll', 'structuredClone', 'ResizeObserver', 'IntersectionObserver', 'fetch(', 'AbortController', '.finally(', 'globalThis', 'queueMicrotask']) {
    assert.ok(!code.includes(api), `${api} in the TV bundle`);
  }
  const sheet = readFileSync(join(dist, 'assets', css[0]), 'utf8');
  for (const bad of [/display:\s*grid/, /(?<![-\w])gap:/, /@layer/, /clamp\(/, /(?<![-\w])inset:/, /aspect-ratio/, /:is\(/, /:where\(/, /color-mix\(/]) {
    assert.doesNotMatch(sheet, bad, `${bad} in the TV stylesheet`);
  }
  rmSync(dist, { recursive: true, force: true });
});
