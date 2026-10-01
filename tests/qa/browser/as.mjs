import { browser, openPage, login, nav, pickSite, shot, MASTER, sleep, URL } from './lib.mjs';
import fs from 'node:fs';
const fx = JSON.parse(fs.readFileSync(`${process.env.QA_OUT || './qa-out'}/fixtures.json`));
const MODE = process.argv[2] || 'all';           // 'all' = Master in All sites; 'viewas' = Master viewing as admina
const R = []; const rec = (id, pass, note) => { R.push({ id, pass, note }); console.log(pass ? 'PASS' : 'FAIL', id, note); };
const F4 = [['AS-01', 'Inventory Master'], ['AS-02', 'Live Parking Status'], ['AS-03', 'Entry / Exit Logs'],
  ['AS-04a', 'Employee Registration'], ['AS-04b', 'Employee & Vehicle Approval'], ['AS-05', 'Non-Parked Alerts'], ['AS-06', 'ValetX Suite']];
const OTHER = ['Role Home Dashboard', 'Reports', 'Master Site Config', 'User & RBAC', 'ParkFlows Field', 'Employee Smart Pass', 'Predictive Analytics', 'InfoSec & Privacy Defense'];
const b = await browser();
const { page, ctx } = await openPage(b);
const writes = [];
let blockWrites = true;
await page.route('**/api/v1/**', async (route) => {
  const r = route.request();
  if (blockWrites && r.method() !== 'GET' && !/\/auth\//.test(r.url())) { writes.push({ m: r.method(), u: r.url().replace(URL, ''), page: current }); return route.abort(); }
  return route.continue();
});
let current = '';
await login(page, MASTER);
if (MODE === 'all') {
  await page.getByRole('button', { name: /All sites/ }).first().click();
} else {
  await page.getByRole('button', { name: /QA Site B/ }).first().click();
  await nav(page, 'User & RBAC'); await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Role View Simulator/i }).first().click(); await page.waitForTimeout(800);
  const row = page.locator('div').filter({ has: page.getByText('QA admina', { exact: true }) }).filter({ has: page.getByRole('button', { name: /View as/i }) }).last();
  await row.getByRole('button', { name: /View as/i }).first().click();
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(1500);
async function safeNav(tab, onlyIfAway = false) {
  try {
    if (onlyIfAway) { const t = await page.locator('main').innerText().catch(() => ''); if (t && !/Sign in/.test(t)) { /* still in app */ } }
    await page.locator('aside, nav').getByText(tab, { exact: true }).first().click({ timeout: 4000 });
    return true;
  } catch { await page.reload(); await page.waitForTimeout(2500);
    try { await page.locator('aside, nav').getByText(tab, { exact: true }).first().click({ timeout: 4000 }); return true; } catch { return false; } }
}
async function sweep(label) {
  const main = page.locator('main');
  const before = writes.length; const clicked = [];
  const n = Math.min(await main.locator('button, [role=button], input[type=submit]').count(), 120);
  for (let i = 0; i < n; i++) {
    const el = main.locator('button, [role=button], input[type=submit]').nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    if (await el.isDisabled().catch(() => true)) continue;
    const txt = ((await el.innerText().catch(() => '')) || (await el.getAttribute('aria-label').catch(() => '')) || '').trim().slice(0, 40);
    if (/sign out|log ?out|exit view|view as/i.test(txt)) continue;
    await el.click({ timeout: 1500 }).catch(() => {});
    await sleep(200);
    // click a primary action in any dialog that opened, then close it
    const dlg = page.locator('[role=dialog], .fixed.inset-0').last();
    if (await dlg.isVisible().catch(() => false)) {
      const prim = dlg.locator('button:not([disabled])').filter({ hasText: /save|submit|approve|reject|confirm|add|upload|create|check|park|deliver|request|apply|yes|delete|remove/i }).first();
      if (await prim.isVisible().catch(() => false)) { await prim.click({ timeout: 1000 }).catch(() => {}); await sleep(200); }
      await page.keyboard.press('Escape'); await sleep(150);
    }
    clicked.push(txt);
    // if we navigated away, come back
    await page.keyboard.press('Escape').catch(() => {});
    if (current && !(await safeNav(current, true))) break;
  }
  return { attempted: writes.slice(before), clicked };
}
const pages = MODE === 'all' ? F4 : F4.map(([id, p]) => [id.replace('AS', 'AS-09'), p]);
async function runPages(pages) {
for (const [id, tab] of pages) {
  current = tab;
  const vis = await page.locator('aside, nav').getByText(tab, { exact: true }).first().isVisible().catch(() => false);
  if (!vis) { rec(id, true, `${tab}: not in sidebar for this user (not reachable)`); continue; }
  await nav(page, tab); await page.waitForTimeout(2500);
  if (/Something went wrong/.test(await page.innerText('body'))) {
    await shot(page, `${MODE}-${id}-crash`);
    rec(id, false, `${tab}: the page crashed the whole console shell ("Something went wrong ... reading 'map'"); sidebar and header gone until Try Again`);
    await page.getByRole('button', { name: /Try Again/ }).click().catch(() => {}); await page.waitForTimeout(2000);
    continue;
  }
  if (/Live Parking/.test(tab)) { await page.locator('main').getByText(/^A-0[1-6]$/).first().click().catch(() => {}); await page.waitForTimeout(800); }
  const guarded = page.locator('[data-write-guard]');
  const total = await guarded.count();
  let enabled = 0; const enabledLabels = []; const titles = new Set();
  for (let i = 0; i < total; i++) {
    const g = guarded.nth(i);
    const dis = await g.isDisabled().catch(() => false);
    const t = await g.getAttribute('title'); if (t) titles.add(t);
    if (!dis && await g.isVisible().catch(() => false)) { enabled++; enabledLabels.push((await g.innerText().catch(() => '')).trim().slice(0, 30)); }
  }
  await shot(page, `${MODE}-${id}`);
  await page.keyboard.press('Escape').catch(() => {});
  const s = await sweep(tab);
  const exempt = /Master Site Config|User & RBAC|InfoSec/.test(tab);
  const siteWrites = s.attempted.filter((w) => !(exempt && /\/(sites|rbac|security|admin|invoices|domains)/.test(w.u)));
  const pass = enabled === 0 && siteWrites.length === 0 && (id.startsWith('AS-08') || total > 0 || /Alerts/.test(tab));
  rec(id, pass, `${tab}: guarded=${total}, enabled guarded=${enabled}${enabledLabels.length ? ' ' + JSON.stringify(enabledLabels) : ''}; tooltips=${JSON.stringify([...titles])}; sweep clicked ${s.clicked.length} enabled controls; non-GET attempted=${JSON.stringify(s.attempted.map((w) => w.m + ' ' + w.u))}${exempt ? ' (platform page: sites/rbac/security writes exempt)' : ''}`);
}
}
await runPages(pages);
// Server backstop (All sites only): force-enable one guarded "Set Maintenance" in Inventory and let it through.
if (MODE === 'all') {
  current = 'Inventory Master'; await nav(page, 'Inventory Master'); await page.waitForTimeout(2500);
  blockWrites = false;
  const btn = page.locator('main [data-write-guard]').filter({ hasText: /Set Maintenance/ }).first();
  await btn.evaluate((e) => { e.disabled = false; e.removeAttribute('disabled'); e.removeAttribute('aria-disabled'); });
  const respP = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/v1\//.test(r.url()), { timeout: 5000 }).catch(() => null);
  await btn.click({ force: true }); const resp = await respP; await sleep(800);
  const body = resp ? await resp.json().catch(() => ({})) : null;
  const txt = await page.innerText('body');
  rec('AS-backstop', resp && resp.status() === 400 && body.errorCode === 'ERR_SITE_ALL_NOT_ALLOWED',
    `forced click -> ${resp ? resp.status() + ' ' + body.errorCode + ' ' + resp.url().replace(URL, '') : 'no request sent (React handler ignored the click)'}; UI shows "Select one site"/"Couldn't save": ${/Select one site|Couldn.t save|Choose one site/.test(txt)}`);
  await shot(page, 'all-backstop');
  // Re-enable: pick Site A -> guarded enabled
  blockWrites = true; await pickSite(page, 'QA Site A'); await page.waitForTimeout(3000);
  const g = page.locator('main [data-write-guard]'); const tot = await g.count(); let en = 0;
  for (let i = 0; i < tot; i++) if (!(await g.nth(i).isDisabled())) en++;
  rec('AS-reenable', en > 0, `Site A selected on Inventory: ${en}/${tot} guarded controls enabled`);
}
if (MODE === 'all') { await pickSite(page, 'All sites'); await page.waitForTimeout(2000); await runPages(OTHER.map((o, i) => [`AS-08.${i + 1}`, o])); }
fs.writeFileSync(`${process.env.QA_OUT || './qa-out'}/res-as-${MODE}.json`, JSON.stringify({ R, writes }, null, 2));
await b.close();
