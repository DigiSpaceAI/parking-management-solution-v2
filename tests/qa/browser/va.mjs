import { browser, openPage, login, nav, pickSite, shot, MASTER, sleep, URL } from './lib.mjs';
import fs from 'node:fs';
const fx = JSON.parse(fs.readFileSync(`${process.env.QA_OUT || './qa-out'}/fixtures.json`));
const A = fx.sites.A.id, B = fx.sites.B.id, ADM = fx.users.admina;
const R = []; const rec = (id, pass, note) => { R.push({ id, pass, note }); console.log(pass ? 'PASS' : 'FAIL', id, note); };
const b = await browser();
const { page, reqs, ctx } = await openPage(b, { height: 1000 });
await login(page, MASTER);
await page.getByRole('button', { name: /QA Site B/ }).first().click(); await page.waitForTimeout(1200);
await nav(page, 'Entry / Exit Logs'); await page.waitForTimeout(1500);
await nav(page, 'User & RBAC'); await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Role View Simulator/i }).first().click().catch(async () => page.getByText(/Role View Simulator/i).first().click());
await page.waitForTimeout(1000);
await shot(page, 'VA-sim');
const simRow = (name) => page.locator('div').filter({ has: page.getByText(name, { exact: true }) }).filter({ has: page.getByRole('button', { name: /View as/i }) }).last();
const row = simRow('QA admina');
const t0 = Date.now();
await row.getByRole('button', { name: /View as/i }).first().click();
await page.waitForTimeout(2500);
// VA-01
const banner = page.locator('[role=status]').filter({ hasText: /Viewing as/ });
const btext = (await banner.innerText().catch(() => '')).replace(/\s+/g, ' ');
const calls = reqs.filter((r) => r.t > t0 && r.m === 'GET' && !/\/auth\//.test(r.u));
const va = calls.filter((r) => r.h['x-view-as'] === ADM.id);
const side = await page.locator('aside').first().innerText();
const main = await page.innerText('body');
rec('VA-01', /Viewing as QA admina/.test(btext) && /QA Site A/.test(btext) && /read-only/.test(btext) && va.length === calls.length && calls.length > 0
  && !/Role View Simulator|InfoSec/.test(side) && !/MH14QB/.test(main),
  `banner="${btext}"; GET calls after start=${calls.length}, with x-view-as=${va.length}, site headers=${JSON.stringify([...new Set(calls.map((c) => c.h['x-site-id']))])}; sidebar has Simulator/InfoSec=${/Role View Simulator|InfoSec/.test(side)}; Site B plates visible=${/MH14QB/.test(main)}`);
await shot(page, 'VA-01-banner');
// VA-02: writes disabled + direct POST refused
await nav(page, 'Inventory Master'); await page.waitForTimeout(2000);
const g = page.locator('main [data-write-guard]'); const n = await g.count(); let en = 0; const titles = new Set();
for (let i = 0; i < n; i++) { if (!(await g.nth(i).isDisabled())) en++; titles.add(await g.nth(i).getAttribute('title')); }
const direct = await page.evaluate(async (slotSite) => { const r = await fetch('/api/v1/slots/update-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slotId: 'x', newStatus: 'MAINTENANCE' }) }); return { s: r.status, b: await r.json() }; });
await nav(page, 'Entry / Exit Logs'); await page.waitForTimeout(1500);
const exp = page.locator('main button').filter({ hasText: /export|csv/i }).first();
const expDisabled = (await exp.count()) ? await exp.isDisabled() : 'no export button';
rec('VA-02', n > 0 && en === 0 && direct.s === 403 && direct.b.errorCode === 'ERR_VIEW_AS_READ_ONLY' && expDisabled === true,
  `Inventory guarded=${n}, enabled=${en}, tooltips=${JSON.stringify([...titles])}; direct POST from page -> ${direct.s} ${direct.b.errorCode}; Logs CSV export disabled=${expDisabled}`);
// VA-03 reload
const ls = await page.evaluate(() => localStorage.getItem('parkflows.viewAs'));
await startSamplerMaster(page);
const t1 = Date.now();
await page.reload(); await page.waitForTimeout(3500);
const btext2 = (await page.locator('[role=status]').filter({ hasText: /Viewing as/ }).innerText().catch(() => '')).replace(/\s+/g, ' ');
const calls2 = reqs.filter((r) => r.t > t1 && r.m === 'GET' && !/\/auth\//.test(r.u));
const firstData = calls2.findIndex((r) => !/rbac\/users|my-sites|rbac\/roles/.test(r.u));
const revalidated = calls2.findIndex((r) => /rbac\/users/.test(r.u));
const noVA = calls2.filter((r) => !/rbac\/users|my-sites|rbac\/roles/.test(r.u) && r.h['x-view-as'] !== ADM.id);
const flashB = /MH14QB/.test(await page.innerText('body'));
rec('VA-03', /Viewing as QA admina/.test(btext2) && !!ls && revalidated >= 0 && (firstData < 0 || revalidated < firstData) && noVA.length === 0 && !flashB,
  `localStorage parkflows.viewAs present=${!!ls}; banner after reload="${btext2}"; /rbac/users revalidation at call #${revalidated}, first data call #${firstData}; data calls without x-view-as=${noVA.map((r) => r.u).join(', ') || 0}; Site B data after reload=${flashB}`);
await shot(page, 'VA-03-after-reload');
// VA-04 exit
await nav(page, 'Entry / Exit Logs'); await page.waitForTimeout(1500);
const t2 = Date.now();
await page.getByRole('button', { name: 'Exit view' }).click(); await page.waitForTimeout(2500);
const chip = await page.locator('header button[aria-haspopup="listbox"]').first().getAttribute('aria-label').catch(() => '');
const after = reqs.filter((r) => r.t > t2 + 200 && r.m === 'GET' && !/\/auth\//.test(r.u));
const heading = await page.innerText('main').then((t) => t.slice(0, 200));
const lsAfter = await page.evaluate(() => localStorage.getItem('parkflows.viewAs'));
await nav(page, 'Inventory Master'); await page.waitForTimeout(2000);
const g2 = page.locator('main [data-write-guard]'); let en2 = 0; const n2 = await g2.count(); for (let i = 0; i < n2; i++) if (!(await g2.nth(i).isDisabled())) en2++;
rec('VA-04', !(await page.locator('[role=status]').filter({ hasText: /Viewing as/ }).count()) && /QA Site B/.test(chip) && after.every((r) => !r.h['x-view-as']) && !lsAfter && en2 > 0,
  `banner gone; chip after exit="${chip}"; calls after exit with x-view-as=${after.filter((r) => r.h['x-view-as']).length}/${after.length}; viewAs key cleared=${!lsAfter}; page after exit starts "${heading.split('\n').slice(0, 2).join(' | ')}" (reload happened, so Home is per F7); Inventory guarded enabled=${en2}/${n2}`);
await shot(page, 'VA-04-after-exit');
// VA-05 stale target: start view-as, suspend target via API, reload
await nav(page, 'User & RBAC'); await page.waitForTimeout(1000);
await page.getByRole('button', { name: /Role View Simulator/i }).first().click().catch(() => {}); await page.waitForTimeout(800);
const row2 = simRow('QA multiab');
await row2.getByRole('button', { name: /View as/i }).first().click(); await page.waitForTimeout(2000);
const mtok = await page.evaluate(() => sessionStorage.getItem('pms_session_token') || localStorage.getItem('pms_session_token'));
const api = await b.newContext(); const ap = await api.newPage();
const lr = await ap.request.post(URL + '/api/v1/auth/login', { data: { identifier: MASTER, password: 'QaTestPassword#2026' } }); const mt = (await lr.json()).token;
const sus = await ap.request.post(URL + '/api/v1/rbac/users', { headers: { 'x-session-token': mt }, data: { id: fx.users.multiab.id, status: 'SUSPENDED' } });
await page.reload(); await page.waitForTimeout(3500);
const body5 = await page.innerText('body');
const loops = reqs.filter((r) => r.t > Date.now() - 3500 && /x/.test(r.u)).length;
rec('VA-05', !(await page.locator('[role=status]').filter({ hasText: /Viewing as/ }).count()) && /Couldn.t start the view/.test(body5),
  `suspend target -> ${sus.status()}; after reload banner present=${await page.locator('[role=status]').filter({ hasText: /Viewing as/ }).count() > 0}; message "Couldn't start the view" shown=${/Couldn.t start the view/.test(body5)}; requests in the 3.5 s after reload=${loops}`);
await shot(page, 'VA-05-stale');
await ap.request.post(URL + '/api/v1/rbac/users', { headers: { 'x-session-token': mt }, data: { id: fx.users.multiab.id, status: 'ACTIVE' } });
// VA-07 sign out while viewing, then sign in as admina
await nav(page, 'User & RBAC').catch(() => {}); await page.waitForTimeout(800);
await page.getByRole('button', { name: /Role View Simulator/i }).first().click().catch(() => {}); await page.waitForTimeout(800);
const row3 = simRow('QA admina');
await row3.getByRole('button', { name: /View as/i }).first().click().catch(() => {}); await page.waitForTimeout(1500);
await page.locator('header').getByRole('button').last().click(); await page.getByText(/Sign out|Log out/i).first().click(); await page.waitForTimeout(1500);
const lsOut = await page.evaluate(() => localStorage.getItem('parkflows.viewAs'));
const t3 = Date.now();
await page.fill('input[placeholder="name@company.com"]', ADM.email); await page.fill('input[type="password"]', 'QaTestPassword#2026'); await page.click('button[type="submit"]'); await page.waitForTimeout(2500);
const c3 = reqs.filter((r) => r.t > t3 && !/\/auth\//.test(r.u));
rec('VA-07', !lsOut && c3.every((r) => !r.h['x-view-as']) && !(await page.locator('[role=status]').filter({ hasText: /Viewing as/ }).count()),
  `viewAs key after sign-out=${lsOut ? 'still set' : 'cleared'}; admina calls carrying x-view-as=${c3.filter((r) => r.h['x-view-as']).length}/${c3.length}; banner shown to admina=${await page.locator('[role=status]').filter({ hasText: /Viewing as/ }).count() > 0}`);
fs.writeFileSync(`${process.env.QA_OUT || './qa-out'}/res-va.json`, JSON.stringify(R, null, 2));
await b.close();
async function startSamplerMaster() {}
