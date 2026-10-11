import { browser, openPage, login, nav, pickSite, shot, MASTER } from './lib.mjs';
const b = await browser();
for (const site of ['All sites', 'QA Site A']) {
  const { page, reqs, ctx } = await openPage(b);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await login(page, MASTER);
  await page.getByRole('button', { name: new RegExp(site) }).first().click();
  await page.waitForTimeout(1500);
  await nav(page, 'Predictive Analytics'); await page.waitForTimeout(2500);
  const pr = reqs.filter((r) => /analytics|ai\/recommend/.test(r.u)).map((r) => r.m + ' ' + r.u + ' site=' + r.h['x-site-id']);
  const sidebar = await page.locator('aside, nav').getByText('Inventory Master', { exact: true }).count();
  console.log(site, '| crash card:', /Something went wrong/.test(await page.innerText('body')), '| sidebar still rendered:', sidebar > 0, '| calls:', pr, '| pageerrors:', errs.slice(0, 2));
  await shot(page, `pred-${site.replace(/\s/g, '')}`);
  await ctx.close();
}
await b.close();
