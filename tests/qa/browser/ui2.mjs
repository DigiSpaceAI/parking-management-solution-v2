import { browser, openPage, login, nav, shot, MASTER, URL, sleep } from './lib.mjs';
import fs from 'node:fs';
const fx = JSON.parse(fs.readFileSync(`${process.env.QA_OUT || './qa-out'}/fixtures.json`));
const R = []; const rec = (id, pass, note) => { R.push({ id, pass, note }); console.log(pass ? 'PASS' : 'FAIL', id, note); };
const b = await browser();
// AC-01: Site Admin A on every screen sees no Site B record, name or count
{
  const { page, reqs, ctx } = await openPage(b, { height: 1400 });
  await login(page, fx.users.admina.email);
  const tabs = (await page.locator('aside nav').innerText()).split('\n').map((x) => x.trim()).filter((x) => x.length > 3 && !/^(Home|Live|App|VIP|Mobile|AI|Secure|\d+)$/.test(x));
  const leaks = [];
  for (const t of tabs) {
    await nav(page, t).catch(() => {}); await page.waitForTimeout(1800);
    const body = await page.innerText('body');
    if (/MH14QB|QA Site B|\bQAB\b|mh14qb/i.test(body)) leaks.push(t);
    await shot(page, `AC01-${t.replace(/[^a-z]/gi, '')}`);
  }
  const foreignCalls = reqs.filter((r) => r.h['x-site-id'] && r.h['x-site-id'] !== fx.sites.A.id);
  rec('AC-01 UI', leaks.length === 0 && foreignCalls.length === 0, `screens visited=${tabs.length} (${tabs.join(', ')}); screens showing Site B data=${JSON.stringify(leaks)}; calls with a non-A site=${foreignCalls.length}`);
  await ctx.close();
}
// AC-41 / AC-42: empty site
{
  const api = await (await b.newContext()).newPage();
  const mt = (await (await api.request.post(URL + '/api/v1/auth/login', { data: { identifier: MASTER, password: 'QaTestPassword#2026' } })).json()).token;
  const on = await (await api.request.post(URL + '/api/v1/sites/onboard', { headers: { 'x-session-token': mt }, data: { siteName: 'QA Empty Site', siteCode: 'QAE', city: 'Pune' } })).json();
  const { page, ctx } = await openPage(b, { height: 1200 });
  await login(page, MASTER);
  await page.getByRole('button', { name: /QA Empty Site/ }).first().click(); await page.waitForTimeout(1500);
  const out = {};
  for (const t of ['Live Parking Status', 'Inventory Master', 'Entry / Exit Logs', 'Employee & Vehicle Approval', 'Non-Parked Alerts', 'Reports']) {
    await nav(page, t); await page.waitForTimeout(2000);
    const m = (await page.innerText('main')).replace(/\s+/g, ' ');
    out[t] = (m.match(/(No [^.]{0,80}\.|nothing[^.]{0,60}|no inventory[^.]{0,60}|empty[^.]{0,60}|0 total[^.]{0,30}|Showing Page 1 of 0[^.]{0,20}|haven.t[^.]{0,60})/i) || ['(no empty-state text found)'])[0];
    await shot(page, `EMPTY-${t.replace(/[^a-z]/gi, '')}`);
  }
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(`${process.env.QA_OUT || './qa-out'}/res-empty.json`, JSON.stringify({ site: on.site?.id, out }, null, 2));
  await ctx.close();
}
fs.writeFileSync(`${process.env.QA_OUT || './qa-out'}/res-ui2.json`, JSON.stringify(R, null, 2));
await b.close();
