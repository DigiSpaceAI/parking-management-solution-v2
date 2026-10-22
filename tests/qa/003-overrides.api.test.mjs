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
