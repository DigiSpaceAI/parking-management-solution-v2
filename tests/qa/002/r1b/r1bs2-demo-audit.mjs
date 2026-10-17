// QA R1B-S2 (feature/002-r1b): the public demo path writes no IP address or user-agent anywhere ParkFlows keeps
// data: the security audit (every action), the stored request, and the data store files.
// Start the built server as on Cloud Run first (K_SERVICE + DEMO_HOSTING_EGRESS_CIDRS=198.51.100.0/24), then:
//   QA_BASE_URL=http://127.0.0.1:4075 QA_DATA_DIR=<server cwd>/data node r1bs2-demo-audit.mjs
import http from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const BASE = new URL(process.env.QA_BASE_URL || 'http://127.0.0.1:4075');
const DATA = process.env.QA_DATA_DIR;
const UA = 'QA-S2-Visitor/9.9 (UniqueAgent-7781)';
const HOST_HOP = '198.51.100.20';
const results = []; const rec = (id, pass, d = '') => { results.push({ id, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} | ${String(d).slice(0, 300)}`); };
function raw(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const r = http.request({ host: BASE.hostname, port: BASE.port, method, path, agent: false, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { let j; try { j = JSON.parse(b); } catch { j = b; } resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const demo = (o = {}) => ({ name: 'S2 Visitor', company: 'S2 Co', workEmail: 's2@s2corp.in', phone: '98206 03518', city: 'Pune', facilityType: 'Mall', preferredContact: 'Email', consent: true, pf_hp_field: '', ...o });
const visitor = (v) => `203.0.${120 + Math.floor(v / 250)}.${(v % 250) + 1}`;
const via = (ip) => ({ 'X-Forwarded-For': `${ip}, ${HOST_HOP}`, 'User-Agent': UA });
const tally = (arr) => arr.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});

// 1. a real stored request + a burst of 640 honeypot POSTs from 128 visitors (over the 600/min global limit)
const stored = await raw('POST', '/api/v1/demo-requests', { headers: via(visitor(500)), body: demo({ name: 'S2 Stored', message: 'stored' }) });
const burst = [];
for (let v = 0; v < 128; v++) burst.push(...await Promise.all(Array.from({ length: 5 }, () => raw('POST', '/api/v1/demo-requests', { headers: via(visitor(v)), body: demo({ pf_hp_field: 'bot' }) }))));
rec('R1B-S2 640 demo POSTs from 128 visitors in under a minute: none refused by the global /api/ limiter', JSON.stringify(tally(burst)) === JSON.stringify({ 200: 640 }) && stored.status === 200, `stored ${stored.status} · burst ${JSON.stringify(tally(burst))}`);
const sixth = await raw('POST', '/api/v1/demo-requests', { headers: via(visitor(0)), body: demo() });
rec('R1B-S2 the per-visitor limit still applies (6th POST in 10 min → 429)', sixth.status === 429, sixth.status);
// 2. not via Hosting, other spellings, query-string personal data
const direct = await raw('POST', '/api/v1/demo-requests?email=leak%40s2corp.in', { headers: { 'X-Forwarded-For': '203.0.113.77', 'User-Agent': UA }, body: demo() });
rec('R1B-S2 a POST not via Hosting → 403 ERR_VIA_HOSTING_ONLY', direct.status === 403 && direct.json?.errorCode === 'ERR_VIA_HOSTING_ONLY', `${direct.status} ${JSON.stringify(direct.json).slice(0, 100)}`);
const variants = {};
for (const p of ['/api/v1/demo-requests/', '/API/V1/DEMO-REQUESTS?email=leak%40s2corp.in', '/api//v1/demo-requests?email=leak%40s2corp.in', '/api/v1//demo-requests']) {
  const r = await raw('POST', p, { headers: via(visitor(600)), body: demo({ name: 'S2 Variant' }) }); variants[p] = r.status;
}
const gets = [];
for (let i = 0; i < 610; i++) gets.push(await raw('GET', '/api//v1/demo-requests?email=leak%40s2corp.in', { headers: { ...via(visitor(700)) } }));
rec('R1B-S2 other spellings: none stores a request; 610 GETs of a "//" spelling end in 429 from the (redacted) global limiter', !Object.values(variants).includes(500) && tally(gets)[429] >= 1, `${JSON.stringify(variants)} · GETs ${JSON.stringify(tally(gets))}`);

// 3. what ParkFlows kept: audit (Master), stored requests, the data files on disk
await raw('POST', '/api/v1/auth/login', { headers: { 'X-Forwarded-For': `198.18.0.9, ${HOST_HOP}`, 'User-Agent': 'QA-Master-Console' }, body: { identifier: 'digisolutions.fm@gmail.com', password: 'Wrong-Password#1' } });
const login = await raw('POST', '/api/v1/auth/login', { headers: { 'X-Forwarded-For': `198.18.0.9, ${HOST_HOP}`, 'User-Agent': 'QA-Master-Console' }, body: { identifier: 'digisolutions.fm@gmail.com', password: 'QaTestPassword#2026' } });
const H = { 'x-session-token': login.json.token };
const audit = await raw('GET', '/api/v1/security/audit-logs?limit=5000', { headers: H });
const logs = audit.json.logs || audit.json.auditLogs || audit.json.items || (Array.isArray(audit.json) ? audit.json : []);
const visitorIps = [...Array(130).keys()].map(visitor).concat([visitor(500), visitor(600), visitor(700), '203.0.113.77']);
const leaks = (s) => s.includes('UniqueAgent-7781') || s.includes('leak@s2corp') || s.includes('leak%40s2corp') || visitorIps.some((ip) => s.includes(ip));
const demoEvents = logs.filter((l) => /demo-requests/i.test(JSON.stringify(l)));
const actions = [...new Set(demoEvents.map((l) => l.action))];
rec('R1B-S2 audit: every demo-path event has ipAddress "redacted", no userAgent, no query string; no event anywhere carries a visitor IP, the visitor user-agent or query data',
  audit.status === 200 && demoEvents.length > 0 && demoEvents.every((l) => l.ipAddress === 'redacted' && !l.userAgent && !/\?/.test(l.targetResource || '')) && !logs.some((l) => leaks(JSON.stringify(l))),
  `${logs.length} audit rows · ${demoEvents.length} demo-path events (${actions.join(', ')}) · sample ${JSON.stringify(demoEvents[0] || {}).slice(0, 220)}`);
// 001 sign-in events keep the client address (their userAgent field is the fixed 001 value "Smart-PMS-Client/1.0")
const loginRow = logs.find((l) => l.action === 'AUTH_FAILED_INVALID_CREDENTIALS');
rec('R1B-S2 control: a 001 route (a failed staff sign-in) still records the client IP', !!loginRow && loginRow.ipAddress && loginRow.ipAddress !== 'redacted', JSON.stringify(loginRow || {}).slice(0, 220));
const list = (await raw('GET', '/api/v1/demo-requests', { headers: H })).json.requests || [];
const s2 = list.filter((r) => /^S2 /.test(r.name));
// stored: the valid request and the trailing-slash spelling (it routes, so it is the canonical form); honeypots,
// non-routing spellings and refused POSTs are not stored
rec('R1B-S2 stored requests: exactly the valid one and the trailing-slash one; no IP / user-agent / browser field on either', JSON.stringify(s2.map((r) => r.name).sort()) === JSON.stringify(['S2 Stored', 'S2 Variant']) && s2.every((r) => !Object.keys(r).some((k) => /ip|agent|browser|header/i.test(k)) && !leaks(JSON.stringify(r))), JSON.stringify(s2.map((r) => ({ name: r.name, keys: Object.keys(r) }))).slice(0, 300));
if (DATA) {
  const files = readdirSync(DATA).map((f) => join(DATA, f)).filter((f) => statSync(f).isFile());
  const hits = files.filter((f) => leaks(readFileSync(f, 'utf8')));
  rec('R1B-S2 data files on disk (store + audit): no visitor IP, user-agent or query data anywhere', hits.length === 0, `${files.map((f) => f.split('/').pop()).join(', ')} · hits ${hits.join(', ') || 'none'}`);
}
console.log(`r1bs2: ${results.length} checks, ${results.filter((r) => r.pass).length} pass`);
