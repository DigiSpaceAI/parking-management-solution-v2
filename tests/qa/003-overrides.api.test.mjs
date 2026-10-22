// 003 Live Parking Display: admin overrides (B7 messages, B8 forced full,
// B9 hide/pin). 03-tech-design v1.2 "Admin overrides", PRD AC-23..AC-30.
// Owner: backend-dev. Runner: node:test + global fetch, no dependencies.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer, client, twoSites, seededServer, deepKeys, sleep, MASTER_EMAIL } from './support/pf003.mjs';

const sel = (o = {}) => ({ levels: [], areas: [], slotIds: [], vehicleClass: 'ALL', ...o });
const tokenOf = (link) => /#k=([A-Za-z0-9_-]{43})$/.exec(link)[1];
const IST = 330 * 60000;
// An IST wall time `ms` from now, as the console sends it ("2026-10-22T14:00:00+05:30").
const istIso = (msFromNow) => new Date(Date.now() + msFromNow + IST).toISOString().replace(/\.\d{3}Z$/, '+05:30');

let srv; let c; let F;
before(async () => {
  srv = await startServer();
  c = client(srv);
  await c.login('master', MASTER_EMAIL);
  F = await twoSites(c, 'ovr');
});
after(() => srv?.stop());

async function mkDisplay(name = 'TV', site, who = 'adminA', selection = sel({ levels: ['B1'] })) {
  const r = await c.post(who, '/displays', { name, location: 'Ramp', selection }, { site: site || F.A.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { id: r.body.display.id, token: tokenOf(r.body.link) };
}
const feed = (d, cl = c) => cl.call(null, 'GET', '/screen/feed', { headers: { 'x-display-token': d.token } });
const say = (body, who = 'adminA', site) => c.post(who, '/displays/messages', { mode: 'BANNER', endsAt: null, ...body }, { site: site || F.A.id });
const shown = async (d) => { await sleep(1050); return (await feed(d)).body.override.message; }; // past the 1 s feed cache

// ------------------------------------------------------------------ B7 messages
test('B7 AC-23: a message to 2 of 3 displays reaches only those 2 on the next poll, and their v changes', async () => {
  const [d1, d2, d3] = [await mkDisplay('One'), await mkDisplay('Two'), await mkDisplay('Three')];
  const v0 = await Promise.all([d1, d2, d3].map(async (d) => (await feed(d)).body.v));
  const r = await say({ text: 'Lift B is out of order. Use the ramp.', target: { displayIds: [d1.id, d2.id] }, mode: 'FULL' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.appliesTo.sort(), [d1.id, d2.id].sort());
  const [f1, f2, f3] = await Promise.all([d1, d2, d3].map(async (d) => (await feed(d)).body)); // invalidated: no wait needed
  assert.deepEqual(f1.override.message, { id: r.body.message.id, text: 'Lift B is out of order. Use the ramp.', mode: 'FULL', endsAt: null });
  assert.equal(f2.override.message.id, r.body.message.id);
  assert.equal(f3.override.message, null);
  assert.notEqual(f1.v, v0[0]); assert.notEqual(f2.v, v0[1]); assert.equal(f3.v, v0[2]);
  assert.ok(f1.slots && f1.counts.total > 0, 'slots and counts still sent (the TV decides the view)');
  const audit = (await c.audit('DISPLAY_MESSAGE_SET')).find((l) => l.targetResource === `display-message/${r.body.message.id}`);
  assert.ok(audit); assert.equal(audit.siteId, F.A.id); assert.equal(audit.ipAddress, 'redacted');
  assert.match(audit.details, /FULL/); assert.ok(audit.details.includes(d1.id) && audit.details.includes('Lift B is out of order'));
});

test('B7 O-3: an "all" message reaches every display, including one created afterwards; per-display clear', async () => {
  const d1 = await mkDisplay('All 1'); const d2 = await mkDisplay('All 2');
  const r = await say({ text: 'Visitor parking closes at 20:00.', target: { all: true } });
  assert.equal(r.status, 200);
  const later = await mkDisplay('Created later');
  for (const d of [d1, d2, later]) assert.equal((await feed(d)).body.override.message?.id, r.body.message.id, d.id);
  const otherSite = await mkDisplay('Site B', F.B.id, 'adminB', sel({ levels: ['B1'] }));
  assert.equal((await feed(otherSite)).body.override.message, null, 'another site is never covered by "all"');
  const cl = await c.post('adminA', `/displays/messages/${r.body.message.id}/clear`, { displayIds: [d2.id] }, { site: F.A.id });
  assert.equal(cl.status, 200, JSON.stringify(cl.body));
  assert.equal((await feed(d2)).body.override.message, null, 'cleared on d2');
  assert.equal((await feed(d1)).body.override.message?.id, r.body.message.id, 'still on d1');
  assert.ok(!cl.body.message.endedAt, 'still live elsewhere');
  const all = await c.post('adminA', `/displays/messages/${r.body.message.id}/clear`, {}, { site: F.A.id });
  assert.equal(all.body.message.endReason, 'CLEARED');
  for (const d of [d1, later]) assert.equal((await feed(d)).body.override.message, null);
  const audits = (await c.audit('DISPLAY_MESSAGE_CLEARED')).filter((l) => l.targetResource === `display-message/${r.body.message.id}`);
  assert.equal(audits.length, 2); assert.ok(audits.some((l) => l.details.includes(d2.id)) && audits.some((l) => / on all /.test(l.details)));
});

test('B7 newest wins per display: a newer message replaces an older one on shared displays only; the older ends REPLACED when it applies nowhere', async () => {
  const [d1, d2, d3] = [await mkDisplay('R1'), await mkDisplay('R2'), await mkDisplay('R3')];
  const old = (await say({ text: 'Old notice', target: { displayIds: [d1.id, d2.id] } })).body.message;
  const mid = (await say({ text: 'Newer notice', target: { displayIds: [d2.id, d3.id] } })).body.message;
  assert.equal((await feed(d1)).body.override.message.id, old.id, 'older one still live on d1');
  assert.equal((await feed(d2)).body.override.message.id, mid.id, 'replaced on the shared display');
  assert.equal((await feed(d3)).body.override.message.id, mid.id);
  let list = (await c.get('adminA', '/displays/messages', { site: F.A.id })).body.messages;
  assert.deepEqual(list.find((m) => m.id === old.id).appliesTo, [d1.id]);
  assert.ok(!list.find((m) => m.id === old.id).endedAt);
  const newest = (await say({ text: 'Newest notice', target: { displayIds: [d1.id] } })).body.message;
  list = (await c.get('adminA', '/displays/messages', { site: F.A.id })).body.messages;
  const o = list.find((m) => m.id === old.id);
  assert.equal(o.endReason, 'REPLACED'); assert.deepEqual(o.appliesTo, []);
  assert.equal((await feed(d1)).body.override.message.id, newest.id);
  assert.equal((await c.audit('DISPLAY_MESSAGE_REPLACED')).filter((l) => l.targetResource === `display-message/${old.id}`).length, 1);
  // Clearing the newest does not bring the replaced one back.
  await c.post('adminA', `/displays/messages/${newest.id}/clear`, {}, { site: F.A.id });
  assert.equal((await feed(d1)).body.override.message, null);
});

test('B7 validation: text, mode, target and IST end times (> now + 1 min, <= 31 days); stored instant = the IST wall time', async () => {
  const d = await mkDisplay('V');
  const t = { displayIds: [d.id] };
  const bad = [
    [{ text: '', target: t }, 'text'], [{ text: ' \n\t ', target: t }, 'text'], [{ text: 'x'.repeat(141), target: t }, 'text'], [{ text: 42, target: t }, 'text'],
    [{ text: 'ok', target: t, mode: 'POPUP' }, 'mode'],
    [{ text: 'ok', target: { displayIds: [] } }, 'target'], [{ text: 'ok', target: {} }, 'target'], [{ text: 'ok' }, 'target'],
    [{ text: 'ok', target: t, endsAt: istIso(-60000) }, 'endsAt'], [{ text: 'ok', target: t, endsAt: istIso(30000) }, 'endsAt'],
    [{ text: 'ok', target: t, endsAt: istIso(32 * 86400000) }, 'endsAt'],
    [{ text: 'ok', target: t, endsAt: new Date(Date.now() + 3600000).toISOString() }, 'endsAt'], // UTC "Z", not IST
    [{ text: 'ok', target: t, endsAt: '2026-10-22 14:00' }, 'endsAt'], [{ text: 'ok', target: t, endsAt: 'tomorrow' }, 'endsAt'],
  ];
  const before = (await c.get('adminA', '/displays/messages', { site: F.A.id })).body.messages.length;
  for (const [body, field] of bad) {
    const r = await say(body);
    assert.equal(r.status, 400, `${JSON.stringify(body).slice(0, 80)}: ${r.status}`);
    assert.ok(r.body.errors[field], `${field}: ${JSON.stringify(r.body.errors)}`);
  }
  assert.match((await say({ text: 'ok', target: t, endsAt: istIso(-60000) })).body.errors.endsAt, /later than now/);
  assert.match((await say({ text: 'ok', target: t, endsAt: istIso(32 * 86400000) })).body.errors.endsAt, /within 31 days/);
  assert.equal((await say({ text: 'ok', target: { displayIds: ['dsp-ffffffffffffffff'] } })).status, 400, 'unknown display');
  assert.equal((await c.get('adminA', '/displays/messages', { site: F.A.id })).body.messages.length, before, 'nothing stored');
  const wall = istIso(2 * 3600000);
  const ok = await say({ text: 'Two hours', target: t, endsAt: wall });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.message.endsAt, new Date(wall).toISOString(), 'the instant of the IST wall time');
  assert.equal(Date.parse(ok.body.message.endsAt), Date.parse(wall));
  const text = await say({ text: '  Gate 2\nclosed\r\n\t<b>now</b>\u0007!  ', target: t });
  assert.equal(text.body.message.text, 'Gate 2 closed <b>now</b> !', 'control characters and line breaks removed; HTML kept as inert text');
  assert.equal((await feed(d)).body.override.message.text, 'Gate 2 closed <b>now</b> !');
  assert.equal((await say({ text: 'y'.repeat(140), target: t })).status, 200, '140 characters is fine');
});

test('B7 AC-30: a Site B display in the targets -> 403 and nothing stored; roles without the module, view-as and ALL are refused', async () => {
  const a = await mkDisplay('A');
  const b = await mkDisplay('B', F.B.id, 'adminB');
  const before = (await c.get('master', '/displays/messages', { site: 'ALL' })).body.messages.length;
  const mixed = await say({ text: 'Cross-site', target: { displayIds: [a.id, b.id] } });
  assert.equal(mixed.status, 403); assert.equal(mixed.body.errorCode, 'ERR_SITE_FORBIDDEN');
  assert.equal((await c.get('master', '/displays/messages', { site: 'ALL' })).body.messages.length, before, 'nothing stored');
  for (const who of ['attA', 'misA', 'customA']) {
    assert.equal((await say({ text: 'x', target: { displayIds: [a.id] } }, who)).status, 403, who);
    assert.equal((await c.get(who, '/displays/messages', { site: F.A.id })).status, 403, `${who} list`);
  }
  const va = await c.post('master', '/displays/messages', { text: 'x', mode: 'BANNER', target: { all: true } }, { site: F.A.id, headers: { 'x-view-as': F.adminA.id } });
  assert.equal(va.status, 403); assert.equal(va.body.errorCode, 'ERR_VIEW_AS_READ_ONLY');
  const all = await c.post('master', '/displays/messages', { text: 'x', mode: 'BANNER', target: { all: true } }, { site: 'ALL' });
  assert.equal(all.status, 400); assert.equal(all.body.errorCode, 'ERR_SITE_ALL_NOT_ALLOWED');
  const mb = (await say({ text: 'Site B only', target: { all: true } }, 'adminB', F.B.id)).body.message;
  assert.equal((await c.post('adminA', `/displays/messages/${mb.id}/clear`, {}, { site: F.A.id })).status, 403, "Site A can't clear Site B's message");
  const ma = (await say({ text: 'Site A', target: { all: true } })).body.message;
  assert.equal((await c.post('adminA', `/displays/messages/${ma.id}/clear`, { displayIds: [b.id] }, { site: F.A.id })).status, 403, 'nor name a Site B display');
  assert.ok(!(await c.get('adminB', '/displays/messages', { site: F.B.id })).body.messages.some((m) => m.siteId !== F.B.id), 'Site B lists only its own');
  await c.post('adminA', `/displays/${a.id}/switch-off`, {}, { site: F.A.id });
  assert.equal((await say({ text: 'x', target: { displayIds: [a.id] } })).status, 409, 'switched-off target');
});

test('B7 NFR-5 + audits: the feed adds only siteName, override.* (no admin names); no token, hash, code or IP in any override audit', async () => {
  const d = await mkDisplay('Scan');
  await say({ text: 'Scan me', target: { displayIds: [d.id] }, endsAt: istIso(3600000) });
  const f = (await feed(d)).body;
  assert.equal(f.siteName, 'ovr Site A');
  assert.deepEqual(Object.keys(f.override).sort(), ['forcedFull', 'message']);
  assert.deepEqual(Object.keys(f.override.message).sort(), ['endsAt', 'id', 'mode', 'text']);
  const keys = deepKeys({ ...f, override: undefined });
  for (const k of ['createdBy', 'endedBy', 'setBy', 'by', 'name', 'email', 'clearedFor', 'target', 'siteId']) assert.ok(!keys.has(k) && !JSON.stringify(f.override).includes(`"${k}"`), k);
  assert.ok(!JSON.stringify(f).includes('ovradmina'), 'no admin name or email');
  const audits = (await c.audit()).filter((l) => l.action.startsWith('DISPLAY_'));
  const text = JSON.stringify(audits);
  assert.ok(!text.includes(d.token) && !text.includes(crypto.createHash('sha256').update(d.token).digest('hex')));
  for (const l of audits) { assert.equal(l.ipAddress, 'redacted', l.action); assert.ok(!('userAgent' in l), l.action); }
});

test('B7 AC-23/24 timing: set -> visible to a polling client in < 5 s, 20 runs (p100)', async () => {
  await c.mkUser('timer', 'role-site-manager', [F.A.id], 'o');
  const runs = await Promise.all(Array.from({ length: 20 }, async (_, i) => {
    const d = await mkDisplay(`Timing ${i}`);
    await sleep(Math.random() * 3000);
    let stop = false; let seenAt = null; let setAt = null; let v = '';
    const poller = (async () => {
      await sleep(Math.random() * 3000); // a TV is anywhere in its 3 s cycle
      while (!stop) {
        const r = await c.call(null, 'GET', `/screen/feed${v ? `?v=${v}` : ''}`, { headers: { 'x-display-token': d.token } });
        if (r.status === 200 && !r.body.unchanged) { v = r.body.v; if (setAt && r.body.override.message && seenAt === null) { seenAt = Date.now(); stop = true; } }
        if (!stop) await sleep(3000 + (Math.random() * 600 - 300));
      }
    })();
    await sleep(1000 + Math.random() * 2000);
    setAt = Date.now();
    const r = await say({ text: `Run ${i}`, target: { displayIds: [d.id] } }, 'timer');
    assert.equal(r.status, 200);
    await Promise.race([poller, sleep(8000)]); stop = true;
    return seenAt === null ? Infinity : seenAt - setAt;
  }));
  const max = Math.max(...runs);
  assert.ok(max < 5000, `p100 ${max} ms over 20 runs: ${runs.join(', ')}`);
});

test('B7 expiry on read: a passed end time is dropped from the feed, ended once with one audit, and not again', async () => {
  const fx = await seededServer(() => {});
  try {
    const site = await fx.c.onboard('OVREXP', 'Expiry site');
    await fx.c.post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'E-1', basement: 'B1', floorLocation: '', slotType: 'SEDAN', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' }] }, { site: site.id });
    const r = await fx.c.post('master', '/displays', { name: 'E', location: '', selection: sel({ levels: ['B1'] }) }, { site: site.id });
    const tok = tokenOf(r.body.link);
    const keep = await fx.c.post('master', '/displays/messages', { text: 'Still on', mode: 'BANNER', target: { all: true }, endsAt: istIso(3600000) }, { site: site.id });
    assert.equal(keep.status, 200);
    await sleep(3500); // past the 3 s full-sync debounce (the site onboarding) and the targeted syncs
    fx.srv.stop();
    // Add a message whose end time has already passed (as if the server had been up while it ran out).
    const data = fx.readData();
    assert.ok((data.displayMessages || []).some((m) => m.id === keep.body.message.id), 'message synced');
    const past = new Date(Date.now() - 5000).toISOString();
    data.displayMessages.push({ id: 'dmsg-00000000000000aa', siteId: site.id, text: 'Ran out', mode: 'FULL', target: { displayIds: [r.body.display.id] }, clearedFor: [], endsAt: past, createdAt: new Date(Date.now() - 60000).toISOString(), createdBy: MASTER_EMAIL });
    (await import('node:fs')).writeFileSync(fx.dataFile, JSON.stringify(data));
    const { srv: s2, c: c2 } = await fx.restart();
    try {
      const poll = () => c2.call(null, 'GET', '/screen/feed', { headers: { 'x-display-token': tok } });
      const f = (await poll()).body;
      assert.equal(f.override.message.id, keep.body.message.id, 'the expired (newer) message is not sent; the live one is');
      await sleep(1100); await poll(); await c2.get('master', '/displays/messages', { site: site.id });
      const exp = (await c2.audit('DISPLAY_MESSAGE_EXPIRED')).filter((l) => l.targetResource === 'display-message/dmsg-00000000000000aa');
      assert.equal(exp.length, 1, 'one audit, however many reads');
      const lr = await c2.get('master', '/displays/messages', { site: site.id });
      assert.equal(lr.status, 200, JSON.stringify(lr.body));
      const m = lr.body.messages.find((x) => x.id === 'dmsg-00000000000000aa');
      assert.equal(m.endReason, 'EXPIRED'); assert.equal(m.endedAt, past);
      await sleep(300);
      assert.equal(fx.readData().displayMessages.find((x) => x.id === 'dmsg-00000000000000aa').endReason, 'EXPIRED', 'targeted write');
    } finally { s2.stop(); }
  } finally { fx.stop(); }
});

test('B7 30 override writes per user per minute', async () => {
  const d = await mkDisplay('Limit');
  await c.mkUser('busy', 'role-site-manager', [F.A.id], 'o');
  for (let i = 1; i <= 30; i++) assert.equal((await say({ text: `n${i}`, target: { displayIds: [d.id] } }, 'busy')).status, 200, `write ${i}`);
  const r = await say({ text: 'n31', target: { displayIds: [d.id] } }, 'busy');
  assert.equal(r.status, 429); assert.equal(r.body.errorCode, 'ERR_RATE_LIMITED');
  assert.equal((await say({ text: 'other user', target: { displayIds: [d.id] } })).status, 200);
});

// ------------------------------------------------------------------ B8 forced full
test('B8 AC-25: forced full set/clear reaches the feed at once; slots and counts stay real; audits', async () => {
  const d = await mkDisplay('Full');
  const before = (await feed(d)).body;
  assert.equal(before.override.forcedFull, null);
  const until = istIso(2 * 3600000);
  const r = await c.post('adminA', `/displays/${d.id}/force-full`, { endsAt: until }, { site: F.A.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const f = (await feed(d)).body;
  assert.deepEqual(f.override.forcedFull, { endsAt: new Date(until).toISOString() });
  assert.notEqual(f.v, before.v);
  assert.deepEqual(f.counts, before.counts, 'real counts still sent'); assert.deepEqual(f.slots, before.slots, 'real slots still sent');
  const open = await c.post('adminA', `/displays/${d.id}/force-full`, { endsAt: null }, { site: F.A.id });
  assert.equal(open.status, 200);
  assert.deepEqual((await feed(d)).body.override.forcedFull, { endsAt: null }, '"until I clear it"');
  const cl = await c.post('adminA', `/displays/${d.id}/force-full/clear`, {}, { site: F.A.id });
  assert.equal(cl.status, 200);
  assert.equal((await feed(d)).body.override.forcedFull, null);
  const set = (await c.audit('DISPLAY_FORCED_FULL_SET')).filter((l) => l.targetResource === `display/${d.id}`);
  const cleared = (await c.audit('DISPLAY_FORCED_FULL_CLEARED')).filter((l) => l.targetResource === `display/${d.id}`);
  assert.equal(set.length, 2); assert.equal(cleared.length, 1);
  for (const l of [...set, ...cleared]) { assert.equal(l.siteId, F.A.id); assert.equal(l.ipAddress, 'redacted'); assert.ok(!l.details.includes(d.token)); }
  assert.ok(set.some((l) => l.details.includes(new Date(until).toISOString())), 'endsAt in the audit');
});

test('B8 validation and AC-30: end-time rule; Site B, roles without the module, view-as and ALL refused; switched off 409', async () => {
  const d = await mkDisplay('Full rules');
  for (const endsAt of [istIso(-60000), istIso(32 * 86400000), new Date(Date.now() + 3600000).toISOString(), 'soon']) {
    const r = await c.post('adminA', `/displays/${d.id}/force-full`, { endsAt }, { site: F.A.id });
    assert.equal(r.status, 400, String(endsAt)); assert.ok(r.body.errors.endsAt);
  }
  assert.equal((await c.post('adminB', `/displays/${d.id}/force-full`, { endsAt: null }, { site: F.B.id })).status, 403, 'Site B admin');
  assert.equal((await c.post('adminB', `/displays/${d.id}/force-full/clear`, {}, { site: F.B.id })).status, 403);
  for (const who of ['attA', 'misA', 'customA']) assert.equal((await c.post(who, `/displays/${d.id}/force-full`, { endsAt: null }, { site: F.A.id })).status, 403, who);
  const va = await c.post('master', `/displays/${d.id}/force-full`, { endsAt: null }, { site: F.A.id, headers: { 'x-view-as': F.adminA.id } });
  assert.equal(va.status, 403); assert.equal(va.body.errorCode, 'ERR_VIEW_AS_READ_ONLY');
  assert.equal((await c.post('master', `/displays/${d.id}/force-full`, { endsAt: null }, { site: 'ALL' })).status, 400);
  assert.equal((await feed(d)).body.override.forcedFull, null, 'nothing was set');
  await c.post('adminA', `/displays/${d.id}/switch-off`, {}, { site: F.A.id });
  assert.equal((await c.post('adminA', `/displays/${d.id}/force-full`, { endsAt: null }, { site: F.A.id })).status, 409);
});

test('B8 C8 / AC-29: GET /displays carries the override summary (what, who, until) for the console only', async () => {
  // Earlier "all" messages would also cover this new display (O-3): clear them first.
  for (const m of (await c.get('master', '/displays/messages', { site: F.A.id })).body.messages) {
    if (!m.endedAt) await c.post('master', `/displays/messages/${m.id}/clear`, {}, { site: F.A.id });
  }
  const d = await mkDisplay('Summary');
  const row0 = (await c.get('adminA', '/displays', { site: F.A.id })).body.displays.find((x) => x.id === d.id);
  assert.equal(row0.override, null);
  const until = istIso(3600000);
  const m = (await say({ text: 'Summary text', target: { displayIds: [d.id] }, endsAt: until })).body.message;
  await c.post('adminA', `/displays/${d.id}/force-full`, { endsAt: null }, { site: F.A.id });
  const row = (await c.get('adminA', '/displays', { site: F.A.id })).body.displays.find((x) => x.id === d.id);
  assert.deepEqual(row.override, {
    message: { id: m.id, mode: 'BANNER', text: 'Summary text', by: 'D3 adminA', until: new Date(until).toISOString() },
    forcedFull: { by: 'D3 adminA', until: null }, hidden: 0, pinned: 0,
  });
  const f = (await feed(d)).text;
  assert.ok(!f.includes('D3 adminA') && !f.includes('ovr.admina'), 'the admin name is never in the feed');
});

test('B8 expiry on read: a passed forced-full end time is dropped, with one audit', async () => {
  const fx = await seededServer(() => {});
  try {
    const site = await fx.c.onboard('OVRFF', 'Forced full site');
    await fx.c.post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'F-1', basement: 'B1', floorLocation: '', slotType: 'SEDAN', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' }] }, { site: site.id });
    const r = await fx.c.post('master', '/displays', { name: 'F', location: '', selection: sel({ levels: ['B1'] }) }, { site: site.id });
    const tok = tokenOf(r.body.link);
    await sleep(3500);
    fx.srv.stop();
    const data = fx.readData();
    const disp = data.displays.find((x) => x.id === r.body.display.id);
    disp.forcedFull = { setAt: new Date(Date.now() - 60000).toISOString(), setBy: MASTER_EMAIL, endsAt: new Date(Date.now() - 1000).toISOString() };
    (await import('node:fs')).writeFileSync(fx.dataFile, JSON.stringify(data));
    const { srv: s2, c: c2 } = await fx.restart();
    try {
      const poll = () => c2.call(null, 'GET', '/screen/feed', { headers: { 'x-display-token': tok } });
      assert.equal((await poll()).body.override.forcedFull, null);
      await sleep(1100); await poll(); await c2.get('master', '/displays', { site: site.id });
      assert.equal((await c2.audit('DISPLAY_FORCED_FULL_EXPIRED')).filter((l) => l.targetResource === `display/${r.body.display.id}`).length, 1);
      await sleep(500);
      assert.equal(fx.readData().displays.find((x) => x.id === r.body.display.id).forcedFull, null, 'targeted write');
    } finally { s2.stop(); }
  } finally { fx.stop(); }
});

// ------------------------------------------------------------------ B9 hide / pin (US-17, separable)
test('B9 AC-26/27: a hidden slot leaves the slot list and every count; pinned slots are flagged and first within their status group', async () => {
  const S = F.slotsA;
  const d = await mkDisplay('Rules', F.A.id, 'adminA', sel({ levels: ['B1'] }));
  const other = await mkDisplay('Other', F.A.id, 'adminA', sel({ levels: ['B1'] }));
  const base = (await feed(d)).body;
  assert.ok(base.slots.some((s) => s.code === 'A-B1-G01'));
  const r = await c.post('adminA', `/displays/${d.id}/slot-rules`, { hidden: [S['A-B1-G01'].id], pinned: [S['A-B1-P03'].id] }, { site: F.A.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const f = (await feed(d)).body;
  assert.ok(!f.slots.some((s) => s.code === 'A-B1-G01'), 'hidden: not in the list');
  assert.equal(f.counts.total, base.counts.total - 1); assert.equal(f.counts.free, base.counts.free - 1, 'hidden: not counted');
  assert.equal(f.counts.groups[0].total, base.counts.groups[0].total - 1);
  const vac = f.slots.filter((s) => s.status === 'VACANT').map((s) => s.code);
  assert.equal(vac[0], 'A-B1-P03', 'a pinned vacant slot is first among the vacant');
  assert.equal(f.slots[0].pinned, true); assert.ok(f.slots.slice(1).every((s) => !('pinned' in s)), 'only pinned slots carry the flag');
  assert.deepEqual(vac.slice(1), [...vac.slice(1)].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })), 'the rest keep code order');
  const o = (await feed(other)).body;
  assert.ok(o.slots.some((s) => s.code === 'A-B1-G01') && !o.slots.some((s) => s.pinned), 'other displays are unaffected');
  const row = (await c.get('adminA', '/displays', { site: F.A.id })).body.displays.find((x) => x.id === d.id);
  assert.equal(row.override.hidden, 1); assert.equal(row.override.pinned, 1);
  const audit = (await c.audit('DISPLAY_SLOT_RULES_UPDATED')).find((l) => l.targetResource === `display/${d.id}`);
  assert.ok(audit); assert.match(audit.details, /hidden 1 \(\+A-B1-G01\)/); assert.match(audit.details, /pinned 1 \(\+A-B1-P03\)/);
  // A pinned Occupied slot is first among the Occupied, never before a Vacant one (O-5).
  await c.post('master', '/vehicles/entry', { vehicleNumber: 'MH14PN0007', targetSlotNumber: 'A-B1-P02' }, { site: F.A.id });
  await c.post('master', '/vehicles/entry', { vehicleNumber: 'MH14PN0008', targetSlotNumber: 'A-B1-P01' }, { site: F.A.id });
  await c.post('adminA', `/displays/${d.id}/slot-rules`, { hidden: [], pinned: [S['A-B1-P02'].id] }, { site: F.A.id });
  const g = (await feed(d)).body;
  const order = g.slots.map((s) => `${s.status[0]}:${s.code}${s.pinned ? '*' : ''}`);
  const firstOcc = order.findIndex((x) => x.startsWith('O:'));
  assert.equal(order[firstOcc], 'O:A-B1-P02*', `pinned occupied first among occupied: ${order}`);
  assert.ok(order.slice(0, firstOcc).every((x) => x.startsWith('V:')), 'all vacant before it');
  for (const v of ['MH14PN0007', 'MH14PN0008']) await c.post('master', '/vehicles/exit', { vehicleNumberOrSlot: v }, { site: F.A.id });
});

test('B9 validation: Site B slot, unknown slot, overlap and > 200 -> 400; AC-30 refusals; a deleted pinned slot is skipped and pruned', async () => {
  const S = F.slotsA;
  const d = await mkDisplay('Rules 2');
  const bad = [
    { hidden: [F.slotsB['B-B1-P01'].id] }, { pinned: ['slot-nope'] }, { hidden: [S['A-B1-P01'].id], pinned: [S['A-B1-P01'].id] },
    { hidden: Array.from({ length: 201 }, (_, i) => `slot-x${i}`) }, { hidden: 'all' }, { pinned: [42] },
  ];
  for (const body of bad) {
    const r = await c.post('adminA', `/displays/${d.id}/slot-rules`, body, { site: F.A.id });
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60)); assert.ok(r.body.errors.slotRules);
  }
  assert.equal((await c.post('adminB', `/displays/${d.id}/slot-rules`, { hidden: [] }, { site: F.B.id })).status, 403);
  for (const who of ['attA', 'misA', 'customA']) assert.equal((await c.post(who, `/displays/${d.id}/slot-rules`, { hidden: [] }, { site: F.A.id })).status, 403, who);
  const va = await c.post('master', `/displays/${d.id}/slot-rules`, { hidden: [] }, { site: F.A.id, headers: { 'x-view-as': F.adminA.id } });
  assert.equal(va.status, 403);
  assert.equal((await feed(d)).body.slots.some((s) => s.pinned), false, 'nothing stored');
  // A pinned slot that is deleted later is skipped in the feed and pruned on the next edit.
  await c.post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'A-B1-TMP', basement: 'B1', floorLocation: '', slotType: 'SEDAN', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' }] }, { site: F.A.id });
  const tmp = (await c.slots(F.A.id)).find((s) => s.slotNumber === 'A-B1-TMP');
  assert.equal((await c.post('adminA', `/displays/${d.id}/slot-rules`, { pinned: [tmp.id, S['A-B1-G02'].id] }, { site: F.A.id })).status, 200);
  await c.post('master', '/slots/delete', { slotId: tmp.id }, { site: F.A.id });
  await sleep(1100);
  const f = (await feed(d)).body;
  assert.ok(!f.slots.some((s) => s.code === 'A-B1-TMP'), 'deleted slot skipped');
  const again = await c.post('adminA', `/displays/${d.id}/slot-rules`, { pinned: [tmp.id, S['A-B1-G02'].id] }, { site: F.A.id });
  assert.equal(again.status, 200, 'a stale id of a deleted slot is dropped, not refused');
  assert.equal(again.body.display.override.pinned, 1, 'pruned');
});
