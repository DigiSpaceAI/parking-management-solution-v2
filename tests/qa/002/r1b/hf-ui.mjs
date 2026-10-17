// QA R1B-S1 hotfix: sign-in and the console (001 UI on hotfix/r1b-s1) plus the attendant mobile app build
// (src/mobile, VITE_API_BASE → the local server, served from http://localhost like the Capacitor shell) still work.
//   PW=<playwright> CHROME=<chromium> CONSOLE=http://127.0.0.1:4081 MOBILE=http://localhost QA_FIXTURES=… node hf-ui.mjs
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.PW);
const fx = JSON.parse(readFileSync(process.env.QA_FIXTURES, 'utf8'));
const CON = process.env.CONSOLE || 'http://127.0.0.1:4081', MOB = process.env.MOBILE || 'http://localhost';
const PWD = 'QaTestPassword#2026';
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = []; const rec = (id, pass, d = '') => { out.push({ id, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} | ${String(d).replace(/\s+/g, ' ').slice(0, 260)}`); };

// console: sign in as Master, Site Admin A, Attendant; the app loads data (no 401/500 on /api/v1)
for (const [who, email] of [['Master', 'digisolutions.fm@gmail.com'], ['Site Admin A', fx.users.admina.email], ['Attendant A', fx.users.atta.email]]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  const bad = []; p.on('response', (r) => { if (r.url().includes('/api/v1/') && (r.status() >= 500 || r.status() === 401)) bad.push(`${r.status()} ${r.url().replace(CON, '')}`); });
  await p.goto(CON + '/'); await p.waitForSelector('input[type=password]', { timeout: 15000 });
  await p.locator('input[type=email], input[autocomplete=username], input[type=text]').first().fill(email);
  await p.locator('input[type=password]').first().fill(PWD);
  await p.locator('button[type=submit], button:has-text("Sign in"), button:has-text("Sign In")').first().click();
  await sleep(5000);
  const signedIn = !(await p.locator('input[type=password]').count());
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const calls = []; p.on('request', (r) => r.url().includes('/api/v1/') && calls.push(r.url()));
  await p.reload(); await sleep(4000);
  rec(`Console (001 UI) sign-in as ${who}: signed in, data loads, no 401/500 on /api/v1; reload keeps the session`, signedIn && bad.length === 0 && !(await p.locator('input[type=password]').count()) && calls.length > 0,
    `${bad.join(', ') || 'no 401/500'} · ${calls.length} API calls after reload · ${t.slice(0, 140)}`);
  await ctx.close();
}

// mobile attendant app: sign in, slot list, sign out
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
  const api = []; p.on('response', (r) => { if (r.url().includes('/api/v1/')) api.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`); });
  const errs = []; p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 100)));
  await p.goto(MOB + '/'); await sleep(1500);
  await p.locator('input').first().fill(fx.users.atta.email);
  await p.getByRole('button', { name: /Continue/ }).click(); await sleep(800);
  await p.locator('input[type=password]').fill(PWD);
  const before = api.length; // a 401 from /auth/me before sign-in is the app checking for an old session
  await p.getByRole('button', { name: /Sign In/ }).click(); await sleep(3000);
  // first sign-in on a device asks for a quick-unlock PIN (twice)
  for (let k = 0; k < 2; k++) {
    if (!/PIN/i.test(await p.evaluate(() => document.body.innerText))) break;
    for (const d of '2580') await p.getByRole('button', { name: d, exact: true }).first().click().catch(() => {});
    await sleep(1200);
  }
  await sleep(4000);
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const after = api.slice(before);
  const ok = after.some((x) => /POST \/api\/v1\/auth\/login 200/.test(x)) && after.some((x) => /GET \/api\/v1\/slots\S* 200/.test(x)) && !after.some((x) => / (401|5\d\d)$/.test(x));
  rec('Attendant mobile app (src/mobile build, lower-case /api/v1 from http://localhost): sign-in, sites and slots load, no 401/5xx', ok, `before sign-in: ${api.slice(0, before).join(', ')} · after: ${after.join(', ')} · console errors ${errs.length} · ${t.slice(0, 160)}`);
  await ctx.close();
}
await browser.close();
console.log(`hf-ui: ${out.length} checks, ${out.filter((x) => x.pass).length} pass`);
