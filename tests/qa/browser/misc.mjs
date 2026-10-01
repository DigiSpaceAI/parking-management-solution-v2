import { browser, openPage, login, nav, pickSite, shot, MASTER, sleep, URL } from './lib.mjs';
import fs from 'node:fs';
const fx = JSON.parse(fs.readFileSync(`${process.env.QA_OUT || './qa-out'}/fixtures.json`));
const R = []; const rec = (id, pass, note) => { R.push({ id, pass, note }); console.log(pass ? 'PASS' : 'FAIL', id, note); };
const b = await browser();
const PWD = 'QaTestPassword#2026';
if (!process.env.SKIP1) {
// MAN-02h session ended -> sign-in -> same page and site (AC-47)
{
  const { page, ctx } = await openPage(b);
  await login(page, MASTER);
  await page.getByRole('button', { name: /QA Site B/ }).first().click(); await page.waitForTimeout(1000);
  await nav(page, 'Entry / Exit Logs'); await page.waitForTimeout(1500);
  const token = await page.evaluate(() => sessionStorage.getItem('parkflow_session_token_fallback'));
  const api = await b.newContext();
  const lo = await api.request.post(URL + '/api/v1/auth/logout', { headers: { 'x-session-token': token } });
  await page.locator('header button[title*="efresh" i], header button[aria-label*="efresh" i]').first().click().catch(async () => { await nav(page, 'Inventory Master'); });
  await page.waitForTimeout(2000);
  const onLogin = await page.locator('input[placeholder="name@company.com"]').count();
  const notice = await page.innerText('body');
  await shot(page, 'MAN-02h-signin-notice');
  await page.fill('input[placeholder="name@company.com"]', MASTER); await page.fill('input[type="password"]', PWD); await page.click('button[type="submit"]'); await page.waitForTimeout(2500);
  const chip = await page.locator('header button[aria-haspopup="listbox"]').first().getAttribute('aria-label').catch(() => '');
  const active = await page.locator('aside nav [aria-current="page"], aside nav .bg-blue-600, aside nav [class*="bg-slate-700"]').first().innerText().catch(() => '');
  const main = await page.innerText('main');
  await shot(page, 'MAN-02h-after-signin');
  const onLogs = /Entry|Exit|Log/i.test(main.slice(0, 400)) || /Entry \/ Exit Logs/.test(active);
  rec('MAN-02h (AC-47)', lo.status() === 200 && onLogin > 0 && /Your session ended. Sign in to continue./.test(notice) && /QA Site B/.test(chip) && onLogs,
    `external logout -> ${lo.status()}; next action went to sign-in=${onLogin > 0}; notice shown=${/Your session ended. Sign in to continue./.test(notice)}; after sign-in chip="${chip}", active tab="${active.trim()}", logs page=${onLogs}`);
  // MAN-02i remembered site: sign out/in
  await page.locator('header').getByRole('button').last().click(); await page.getByText(/Sign out|Log out/i).first().click(); await page.waitForTimeout(1200);
  await page.fill('input[placeholder="name@company.com"]', MASTER); await page.fill('input[type="password"]', PWD); await page.click('button[type="submit"]'); await page.waitForTimeout(2500);
  const chip2 = await page.locator('header button[aria-haspopup="listbox"]').first().getAttribute('aria-label').catch(() => '');
  rec('MAN-02i', /QA Site B/.test(chip2), `after sign-out/in chip="${chip2}"`);
  await ctx.close();
}
}
if (!process.env.SKIP2) {
// S-NA via stale return-to tab (Site Admin -> SECURITY_AUDIT)
{
  const { page, ctx } = await openPage(b);
  await page.goto(URL + '/');
  await page.evaluate((uid) => sessionStorage.setItem('parkflows.returnTo', JSON.stringify({ tab: 'SECURITY_AUDIT', siteId: null, userId: uid })), fx.users.admina.id);
  await page.fill('input[placeholder="name@company.com"]', fx.users.admina.email); await page.fill('input[type="password"]', PWD); await page.click('button[type="submit"]'); await page.waitForTimeout(2500);
  const main = await page.innerText('main');
  await shot(page, 'SNA-admina');
  const go = page.getByRole('button', { name: /Go to Home/i });
  const hasGo = await go.count();
  const audit = /audit log|InfoSec|Tamper|compliance/i.test(main) && !/don.t have access|can.t open|not available/i.test(main);
  if (hasGo) { await go.click(); await page.waitForTimeout(1200); }
  const home = await page.innerText('main');
  rec('S-NA', hasGo > 0 && !audit && /Welcome|Home|OVERVIEW/i.test(home), `S-NA text="${main.split('\n').filter(Boolean).slice(0, 3).join(' | ')}"; Go to Home button=${hasGo > 0}; audit content leaked=${audit}; after Go to Home: "${home.split('\n').filter(Boolean).slice(0, 2).join(' | ')}"`);
  await ctx.close();
}
}
// AC-44 S-0 for a user with no site
{
  const { page, reqs, ctx } = await openPage(b);
  await login(page, fx.users.nosite.email);
  const main = await page.innerText('body');
  const data = reqs.filter((r) => !/\/(auth|my-sites|rbac\/roles|health|sites)\b/.test(r.u) && r.m === 'GET');
  await shot(page, 'AC44-nosite');
  rec('AC-44 UI', /No site assigned/.test(main) && /Contact your\s+administrator/i.test(main) && data.length === 0, `S-0 text="${main.split('\n').filter(Boolean).slice(0, 3).join(' | ')}"; data calls=${data.map((r) => r.u).join(', ') || 0}`);
  await ctx.close();
}
// Chip at 375 / 768 / 1280 (L-1) for Master and Site Admin
for (const [w, h] of [[375, 812], [768, 1024], [1280, 800]]) {
  for (const who of ['master', 'admina']) {
    const { page, ctx } = await openPage(b, { width: w, height: h });
    await login(page, who === 'master' ? MASTER : fx.users.admina.email);
    if (who === 'master') { await page.getByRole('button', { name: /QA Site A/ }).first().click(); await page.waitForTimeout(1200); }
    const chip = page.locator('header [aria-label^="Site:"], header button[aria-haspopup="listbox"]').first();
    const vis = await chip.isVisible().catch(() => false);
    const txt = vis ? (await chip.innerText()).replace(/\s+/g, ' ').trim() : '(none)';
    const aria = await chip.getAttribute('aria-label').catch(() => '');
    const box = vis ? await chip.boundingBox() : null;
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    let sheet = '';
    if (who === 'master' && vis) {
      await chip.click(); await page.waitForTimeout(400);
      const lb = page.locator('[role=listbox]');
      const lbBox = await lb.boundingBox().catch(() => null);
      const optH = await page.locator('[role=option]').first().boundingBox().then((b2) => b2?.height).catch(() => null);
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      const focusBack = await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup'));
      sheet = `; listbox at y=${Math.round(lbBox?.y ?? -1)} h=${Math.round(lbBox?.height ?? -1)} (bottom sheet if near screen bottom), option height=${optH}px, Esc returns focus to chip=${focusBack === 'listbox'}`;
      await page.locator('header button[aria-haspopup="listbox"]').first().click(); await page.waitForTimeout(300);
      await shot(page, `chip-${w}-open`);
      await page.keyboard.press('Escape');
    }
    await shot(page, `chip-${w}-${who}`);
    const expect = w < 1024 ? /QAA/.test(txt) : /QA Site A/.test(txt) && /QAA/.test(txt);
    rec(`L-1 chip ${w}px ${who}`, vis && expect && !hscroll, `visible=${vis}; text="${txt}"; aria="${aria}"; width=${Math.round(box?.width ?? 0)}px; horizontal scroll=${hscroll}${sheet}`);
    await ctx.close();
  }
}
fs.writeFileSync(`${process.env.QA_OUT || './qa-out'}/res-misc.json`, JSON.stringify(R, null, 2));
await b.close();
