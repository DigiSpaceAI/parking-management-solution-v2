// 002 R1b QA: end-to-end demo request, flag ON. parkflows.in build (PF_DEMO_FORM=1) served by
// tests/qa/002/support/hosting-server.mjs with the D1 firebase.json and its /api/v1/demo-requests rewrite proxied to
// the local console server; the request is then checked in the Master console (F10) and deleted there.
//   PW=… CHROME=… QA_BASE_URL=<console> node tests/qa/002/r1b/e2e-demo.mjs <marketing-url>
import { browser, URL as CONSOLE, rec, api, MASTER, openAs, finish } from './lib.mjs';
const SITE = process.argv[2] || 'http://localhost:4632';
const stamp = Date.now().toString().slice(-5);
const name = `E2E Visitor ${stamp}`;
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errors = []; p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto(SITE + '/demo/', { waitUntil: 'networkidle' });
await p.fill('#f-name', name); await p.fill('#f-company', 'E2E Parking Co'); await p.fill('#f-email', `e2e${stamp}@e2e-corp.in`);
await p.fill('#f-phone', '+91 98206 03518'); await p.fill('#f-city', 'Pune'); await p.selectOption('#f-facility', 'Mall');
await p.fill('#f-slots', '1,200'); await p.fill('#f-message', 'Two basements <script>alert(1)</script> & "quotes".');
await p.check('#f-consent', { force: true });
const [resp] = await Promise.all([p.waitForResponse((r) => r.url().includes('/api/v1/demo-requests')), p.click('#f-submit')]);
await p.waitForTimeout(800);
const success = await p.locator('#form-success').isVisible();
rec('AC-32/AC-32a E2E flag ON: valid form → real B6 via the D1 rewrite → 200 {success:true}, "Thanks — we\'ll contact you within one working day."', resp.status() === 200 && success && /Thanks — we.ll contact you within one working day/.test(await p.locator('#form-success').innerText()) && !p.url().includes('?') && errors.length === 0,
  `${resp.status()} ${await resp.text()} · ${p.url()} · console errors ${errors.length}`);
const list = (await api(MASTER, 'GET', '/demo-requests')).json.requests;
const r = list.find((x) => x.name === name);
rec('AC-32a/d E2E: stored once, normalised (+91 phone, 1200 slots), message kept as plain text, no IP/UA fields', !!r && list.filter((x) => x.name === name).length === 1 && r.phone === '+919820603518' && r.slotsApprox === 1200 && r.message.includes('<script>') && !Object.keys(r).some((k) => /ip|agent|browser/i.test(k)) && r.status === 'NEW' && r.source === 'parkflows.in',
  JSON.stringify(r || {}).slice(0, 300));
await ctx.close();
// in the console: Master sees it; the message renders as text (no script executes); Delete removes it
const c = await openAs(MASTER, { hash: 'demo-requests' });
let alerted = false; c.page.on('dialog', async (d) => { alerted = true; await d.dismiss(); });
await c.page.getByRole('row', { name: new RegExp(name) }).first().click(); await c.page.waitForTimeout(700);
const panel = await c.page.evaluate(() => document.querySelector('dialog[open]')?.innerText || '');
rec('F10 E2E: the new request is in the Master console; the message shows as plain text (no HTML/script runs)', panel.includes(name) && panel.includes('<script>alert(1)</script>') && !alerted, panel.replace(/\s+/g, ' ').slice(0, 260));
await c.page.locator('dialog[open]').getByRole('button', { name: /More actions/ }).click(); await c.page.waitForTimeout(300);
await c.page.getByRole('menuitem', { name: 'Delete request' }).click(); await c.page.waitForTimeout(400);
await c.page.locator('dialog[open]').filter({ hasText: 'Delete this request?' }).getByRole('button', { name: /^Delete$/ }).click(); await c.page.waitForTimeout(1500);
const after = (await api(MASTER, 'GET', '/demo-requests')).json.requests;
rec('AC-32d E2E: Delete in the console removes the request on the server', !after.some((x) => x.name === name), `${after.length} left`);
await c.ctx.close();
await browser.close();
finish('e2e-demo');
