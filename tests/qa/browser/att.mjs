import { browser, openPage, shot, URL, fixAttendantAssets, attLogin, sleep } from './lib.mjs';
import fs from 'node:fs';
const fx = JSON.parse(fs.readFileSync(`${process.env.QA_OUT || './qa-out'}/fixtures.json`));
const R = []; const rec = (id, pass, note) => { R.push({ id, pass, note }); console.log(pass ? 'PASS' : 'FAIL', id, note); };
const b = await browser();
const GATE = /\/api\/v1\/(slots|employees|vehicles|logs|alerts)/;
if (!process.env.SKIPM1) {
// ---- M1: blocking screen ----
// M1-a: attendant with no site
{
  const { page, reqs, ctx } = await openPage(b, { width: 390, height: 844 });
  await fixAttendantAssets(page);
  await attLogin(page, fx.users.nositeatt.email);
  const t = await page.innerText('body');
  const gate = reqs.filter((r) => GATE.test(r.u));
  const btns = await page.locator('button').allInnerTexts();
  await shot(page, 'M1-nosite');
  rec('M1-a no site', /Couldn.t load your site/i.test(t) && btns.some((x) => /Try again/i.test(x)) && btns.some((x) => /Sign out/i.test(x)) && gate.length === 0 && !btns.some((x) => /TAP TO SCAN|Confirm entry|^Entry$|^Exit$/.test(x)),
    `text="${t.split('\n').filter(Boolean).slice(0, 6).join(' | ')}"; buttons=${JSON.stringify(btns.filter((x) => x.trim() && !/Privacy/.test(x)))}; gate/data calls=${gate.map((r) => r.u).join(', ') || 0}`);
  // Sign out from the blocking screen
  await page.getByRole('button', { name: /Sign out/i }).click(); await page.waitForTimeout(1500);
  const t2 = await page.innerText('body');
  rec('M1-c sign out', /Sign in/.test(t2) && /ATTENDANT EMAIL OR USERNAME/i.test(t2), `after Sign out: "${t2.split('\n').filter(Boolean).slice(0, 4).join(' | ')}"`);
  await ctx.close();
}
// M1-b: /my-sites fails -> blocked -> Try again works; M1-d no gate action possible
{
  const { page, reqs, ctx } = await openPage(b, { width: 390, height: 844 });
  await fixAttendantAssets(page);
  let fail = true;
  await page.route('**/api/v1/my-sites', (r) => (fail ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false}' }) : r.continue()));
  await attLogin(page, fx.users.atta.email);
  const t = await page.innerText('body');
  const btns = await page.locator('button').allInnerTexts();
  const gate = reqs.filter((r) => GATE.test(r.u));
  await shot(page, 'M1-mysites-500');
  // try every enabled button except Try again / Sign out: none may send a gate call
  const n = await page.locator('button').count();
  for (let i = 0; i < n; i++) { const el = page.locator('button').nth(i); const x = (await el.innerText()).trim(); if (/Try again|Sign out|Privacy/i.test(x)) continue; await el.click({ timeout: 800 }).catch(() => {}); }
  await sleep(1500);
  const gate2 = reqs.filter((r) => GATE.test(r.u));
  rec('M1-b /my-sites fails', /Couldn.t load your site/i.test(t) && gate.length === 0, `text="${t.split('\n').filter(Boolean).slice(0, 6).join(' | ')}"; buttons=${JSON.stringify(btns.filter((x) => x.trim() && !/Privacy/.test(x)))}; gate calls while blocked=${gate.length}`);
  rec('M1-d no gate action while blocked', gate2.length === 0 && !btns.some((x) => /TAP TO SCAN|Enter vehicle manually/.test(x)), `gate/data calls after clicking every other button=${gate2.length}`);
  fail = false;
  const tR = Date.now();
  await page.getByRole('button', { name: /Try again/i }).click(); await page.waitForTimeout(2500);
  const t3 = await page.innerText('body');
  const after = reqs.filter((r) => r.t > tR && GATE.test(r.u));
  await shot(page, 'M1-after-retry');
  rec('M1-b Try again', /Gate Terminal/.test(t3) && /QA SITE A/i.test(t3) && after.length > 0 && after.every((r) => r.h['x-site-id'] === fx.sites.A.id),
    `after Try again: "${t3.split('\n').filter(Boolean).slice(0, 3).join(' | ')}"; gate calls=${after.length}, all with x-site-id=A: ${after.every((r) => r.h['x-site-id'] === fx.sites.A.id)}`);
  await ctx.close();
}
}
// ---- Addendum B: toasts ----
const { page, reqs, ctx } = await openPage(b, { width: 390, height: 844 });
await fixAttendantAssets(page);
await attLogin(page, fx.users.atta.email);
async function watchToast(expectRe, action) {
  // Sample the whole page every 150 ms and track the element (inline modal error or toast) whose text matches.
  await page.evaluate((src) => { const re = new RegExp(src, 'i'); window.__toast = []; window.__tw = setInterval(() => {
    const cands = [...document.querySelectorAll('div, p, span')].filter((e) => e.children.length === 0 || e.childElementCount <= 1)
      .filter((e) => re.test(e.innerText || '') && (e.innerText || '').length < 220 && e.offsetParent !== null);
    const e = cands[0];
    window.__toast.push({ at: Date.now(), t: e ? e.innerText.trim() : null, fs: e ? parseFloat(getComputedStyle(e).fontSize) : null });
  }, 150); }, expectRe.source);
  const t0 = Date.now();
  await action();
  await sleep(9000);
  const samples = await page.evaluate(() => { clearInterval(window.__tw); return window.__toast; });
  const hits = samples.filter((x) => x.t);
  const first = hits[0], last = hits[hits.length - 1];
  return { visibleMs: first ? last.at - first.at : 0, stillVisibleAtEnd: !!samples[samples.length - 1]?.t, text: first?.t.replace(/\s+/g, ' ').slice(0, 160), fontPx: first?.fs, appearedMs: first ? first.at - t0 : null };
}
async function manualEntry(plate, type) {
  await page.getByRole('button', { name: /^Entry$/ }).click().catch(() => {});
  await page.getByRole('button', { name: /Enter vehicle manually/ }).click(); await sleep(500);
  await page.locator('input[placeholder="KA01EX8821"], input[placeholder="XX-XXX-XXXX"]').first().fill(plate);
  if (type) await page.getByRole('button', { name: type, exact: true }).click();
  await page.getByRole('button', { name: 'Confirm entry' }).click();
}
const cases = [
  ['TOAST-1 duplicate entry (AC-21)', /already|parked/i, () => manualEntry('MH12QA0002')],
  ['TOAST-2 invalid plate (AC-23)', /invalid|plate|format|characters/i, () => manualEntry('AB')],
];
for (const [id, re, act] of cases) {
  const r = await watchToast(re, act);
  await shot(page, id.split(' ')[0]);
  rec(id, !!r.text && r.visibleMs >= 3000 && r.fontPx >= 12, `toast="${r.text}"; visible ${r.visibleMs} ms${r.stillVisibleAtEnd ? '+ (still shown at end of 9 s window)' : ''}; font ${r.fontPx}px; appeared after ${r.appearedMs} ms`);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: /Cancel|×/ }).first().click().catch(() => {}); await sleep(500);
}
// Toast component itself (non-modal path): a scan with no camera available -> "Scan failed: ..." toast
{
  await page.locator('button').filter({ hasText: '×' }).first().click().catch(() => {}); await sleep(400);
  const r = await watchToast(/Scan failed:|unavailable|try manual entry instead/i, async () => {
    await page.getByRole('button', { name: /^Exit$/ }).click(); await sleep(300);
    await page.getByRole('button', { name: /TAP TO SCAN/ }).click();
  });
  await shot(page, 'TOAST-3');
  rec('TOAST-3 gate toast (scan failure, Exit tab)', !!r.text && r.visibleMs >= 3000 && r.fontPx >= 12, `toast="${r.text}"; visible ${r.visibleMs} ms${r.stillVisibleAtEnd ? '+ (still shown)' : ''}; font ${r.fontPx}px`);
  // Manual fallback on the Exit tab opens the ENTRY form (observation)
  await page.getByRole('button', { name: /Enter vehicle manually/ }).click(); await sleep(500);
  const t = await page.innerText('body');
  rec('OBS exit-tab manual fallback', true, `Exit tab -> "Enter vehicle manually" opens: "${(t.match(/MANUAL GATE ENTRY[^\n]*/) || [''])[0]}" with button "${/Confirm entry/.test(t) ? 'Confirm entry' : '?'}" (exit by typed plate is not offered; exits go through scan or Live Slots)`);
}
fs.writeFileSync(`${process.env.QA_OUT || './qa-out'}/res-att.json`, JSON.stringify(R, null, 2));
await b.close();
