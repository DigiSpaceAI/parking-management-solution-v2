// 002 R1b re-test: AC-07 nav for the multi-site Site Admin (with and without a site) and under view-as.
//   same env as console.mjs;  node tests/qa/002/r1b/nav-extra.mjs [tag]
import { openAs, MASTER, URL, browser, api, fx, rec, finish, sleep } from './lib.mjs';
const navOf = (p) => p.evaluate(() => [...document.querySelectorAll('nav.pf-nav [role=group] a')].map((a) => (a.querySelector('.pf-nav-label')?.innerText || a.innerText).replace(/\s*\d[\d,+]*.*$/s, '').trim()));
const SA = ['Overview', 'Live parking', 'Entry/exit log', 'Alerts', 'Reports', 'Valet', 'Employees & vehicles', 'Inventory'];
const ATT = ['Overview', 'Live parking', 'Entry/exit log', 'Alerts', 'Inventory'];
const users = ((r) => r.users || r)((await api(MASTER, 'GET', '/rbac/users')).json);
const id = (k) => users.find((u) => u.email === fx.users[k].email).id;
for (const [label, opts, expect] of [
  ['qa.multiab, no site chosen', { email: fx.users.multiab.email }, SA],
  ['qa.multiab, site A chosen', { email: fx.users.multiab.email, siteId: fx.sites.A.id }, SA],
  ['view-as qa.admina', { email: MASTER, siteId: fx.sites.A.id, viewAsId: id('admina') }, SA],
  ['view-as qa.multiab', { email: MASTER, siteId: fx.sites.A.id, viewAsId: id('multiab') }, SA],
  ['view-as qa.atta', { email: MASTER, siteId: fx.sites.A.id, viewAsId: id('atta') }, ATT],
]) {
  const { ctx, page } = await openAs(opts.email, { siteId: opts.siteId, viewAsId: opts.viewAsId });
  if (!opts.siteId) { await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('parkflows.site.')) localStorage.removeItem(k); }); await page.reload(); }
  await sleep(2500);
  const got = await navOf(page);
  const bar = await page.evaluate(() => (document.body.innerText.match(/Viewing as [^\n]+/) || [''])[0]);
  rec(`AC-07 nav ${label}: exactly the permitted modules`, JSON.stringify(got) === JSON.stringify(expect) && (!opts.viewAsId || /Viewing as/.test(bar)), `${JSON.stringify(got)} ${bar}`);
  await ctx.close();
}
await browser.close();
finish(process.argv[2] || 'nav-extra');
