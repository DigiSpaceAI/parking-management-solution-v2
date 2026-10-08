import { browser, openPage, login, nav, pickSite, chipText, startSampler, stopSampler, shot, MASTER, sleep } from './lib.mjs';
import fs from 'node:fs';
const fx = JSON.parse(fs.readFileSync(`${process.env.QA_OUT || './qa-out'}/fixtures.json`));
const A = fx.sites.A.id, B = fx.sites.B.id;
const R = [];
const rec = (id, pass, note) => { R.push({ id, pass, note }); console.log(pass ? 'PASS' : 'FAIL', id, note); };
const b = await browser();

// MAN-02a: Master sign-in -> Choose a site, no data calls
{
  const { page, reqs, ctx } = await openPage(b);
  await login(page, MASTER);
  const body = await page.innerText('main');
  const dataCalls = reqs.filter((r) => !/\/(auth|my-sites|rbac\/roles|health)/.test(r.u));
  rec('MAN-02a', /Choose a site to see its data/.test(body) && dataCalls.length === 0, `prompt=${/Choose a site/.test(body)}; non-auth/my-sites/roles calls: ${dataCalls.map((r) => r.m + ' ' + r.u).join(', ') || 'none'}`);
  await ctx.close();
}
// MAN-02b/c/d: throttled switch
for (const [label, tab] of [['Inventory', 'Inventory Master'], ['Logs', 'Entry / Exit Logs'], ['Approvals', 'Employee & Vehicle Approval'], ['Floor', 'Live Parking Status']]) {
  const { page, reqs, ctx } = await openPage(b, { latency: 1500 });
  await login(page, MASTER);
  await page.getByRole('button', { name: /QA Site A/ }).first().click();
  await nav(page, tab);
  await page.waitForTimeout(4500);
  const hasA = /MH12QA/.test(await page.innerText('main'));
  await startSampler(page);
  const tSwitch = Date.now();
  await pickSite(page, 'QA Site B');
  await page.waitForTimeout(250);
  const skeletonEarly = await page.evaluate(() => !!document.querySelector('[aria-busy="true"], .animate-pulse'));
  await page.waitForTimeout(5000);
  // rapid switching
  await pickSite(page, 'QA Site A'); await sleep(300); await pickSite(page, 'QA Site B'); await sleep(300);
  await pickSite(page, 'QA Site A'); await sleep(300); await pickSite(page, 'QA Site B');
  await page.waitForTimeout(6000);
  const samples = await stopSampler(page);
  const stale = samples.filter((s) => s.t > tSwitch && /QAB|Site B/.test(s.chip) && s.A);
  const mixed = samples.filter((s) => s.A && s.B);
  const finalMain = await page.innerText('main');
  const lateA = reqs.filter((r) => r.t > tSwitch + 7000 && r.m === 'GET' && r.h['x-site-id'] === A);
  const finalOk = /MH14QB/.test(finalMain) || !/MH12QA/.test(finalMain);
  rec(`MAN-02b/c ${label}`, hasA && stale.length === 0 && mixed.length === 0 && !/MH12QA/.test(finalMain) && finalOk,
    `A rows before switch=${hasA}; skeleton<250ms=${skeletonEarly}; stale A-under-B samples=${stale.length}; mixed samples=${mixed.length}; final has B rows=${/MH14QB/.test(finalMain)}, A rows=${/MH12QA/.test(finalMain)}; chip=${await chipText(page)}`);
  await shot(page, `man02-${label}-final`);
  // MAN-02d All sites
  await pickSite(page, 'All sites');
  await page.waitForTimeout(5000);
  const allMain = await page.innerText('main');
  // Rows from both sites carry a site-code chip. Inventory/Floor sort vacant slots first, so plates may not be on page 1.
  rec(`MAN-02d ${label}`, /QAA/.test(allMain) && /QAB/.test(allMain) && /ALL SITES/i.test(allMain),
    `All sites: A rows=${/MH12QA/.test(allMain)} B rows=${/MH14QB/.test(allMain)} chips QAA=${/QAA/.test(allMain)} QAB=${/QAB/.test(allMain)} eyebrow="${(allMain.match(/ALL SITES[^\n]*/i) || [''])[0]}"`);
  await shot(page, `man02-${label}-all`);
  await ctx.close();
}
// MAN-02e multi-site non-Master
{
  const { page, ctx } = await openPage(b);
  await login(page, fx.users.multiab.email);
  const body = await page.innerText('main');
  await page.locator('header button[aria-haspopup="listbox"]').first().click().catch(() => {});
  const opts = await page.locator('[role=option]').allInnerTexts().catch(() => []);
  rec('MAN-02e', /Choose a site/.test(body) && !/All sites/.test(body) && opts.every((o) => /QA Site A|QA Site B/.test(o)) && opts.length === 2,
    `prompt=${/Choose a site/.test(body)}; "All sites" offered=${/All sites/.test(body)}; chip options=${JSON.stringify(opts.map((o) => o.split('\n')[0]))}`);
  await ctx.close();
}
// MAN-02f single-site Site Admin
{
  const { page, ctx } = await openPage(b);
  await login(page, fx.users.admina.email);
  const chip = page.locator('header button[aria-haspopup="listbox"]');
  const n = await chip.count();
  const label = await page.locator('header').innerText();
  rec('MAN-02f', /QA Site A|QAA/.test(label) && !/QA Site B|QAB/.test(await page.innerText('body')),
    `header shows A=${/QA Site A|QAA/.test(label)}; switchable chip buttons=${n}; any B text on page=${/QA Site B|QAB/.test(await page.innerText('body'))}`);
  await shot(page, 'man02f-admina');
  await ctx.close();
}
// MAN-02g sign out during a slow refresh
{
  const { page, reqs, ctx } = await openPage(b, { latency: 1500 });
  await login(page, MASTER);
  await page.getByRole('button', { name: /QA Site B/ }).first().click();
  await nav(page, 'Inventory Master');
  await page.waitForTimeout(4000);
  const tok = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  await page.locator('header button[title*="efresh"], header button[aria-label*="efresh"]').first().click().catch(() => {});
  await sleep(300);
  // open profile menu -> sign out
  await page.locator('header').getByRole('button').last().click();
  await page.getByText(/Sign out|Log out|Logout/i).first().click();
  const tOut = Date.now();
  await page.waitForTimeout(6000);
  const onLogin = await page.locator('input[placeholder="name@company.com"]').count();
  const store = await page.evaluate(() => ({ ls: { ...localStorage }, ss: { ...sessionStorage } }));
  const after = reqs.filter((r) => r.t > tOut + 100 && !/\/auth\//.test(r.u) && r.h['x-session-token']);
  const sessKeys = Object.keys(store.ls).filter((k) => /session|user|token/i.test(k));
  rec('MAN-02g', onLogin > 0 && after.length === 0 && sessKeys.every((k) => !store.ls[k] || store.ls[k] === 'null'),
    `on sign-in=${onLogin > 0}; token-bearing data calls after sign-out=${after.length}; storage keys=${JSON.stringify(Object.keys(store.ls))}; session keys with values=${JSON.stringify(sessKeys.filter((k) => store.ls[k] && store.ls[k] !== 'null'))}`);
  await shot(page, 'man02g-after-signout');
  await ctx.close();
}
fs.writeFileSync(`${process.env.QA_OUT || './qa-out'}/res-man02.json`, JSON.stringify(R, null, 2));
await b.close();
