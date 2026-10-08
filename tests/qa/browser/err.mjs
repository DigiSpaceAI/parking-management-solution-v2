import { browser, openPage, login, nav, shot, MASTER, sleep } from './lib.mjs';
import fs from 'node:fs';
const fx = JSON.parse(fs.readFileSync(`${process.env.QA_OUT || './qa-out'}/fixtures.json`));
const R = []; const rec = (id, pass, note) => { R.push({ id, pass, note }); console.log(pass ? 'PASS' : 'FAIL', id, note); };
const b = await browser();
const { page, ctx } = await openPage(b, { height: 1100 });
await login(page, fx.users.admina.email);
let down = null; // null | 'abort' | 503
await page.route('**/api/v1/**', (r) => {
  if (!down || /\/auth\//.test(r.request().url())) return r.continue();
  return down === 'abort' ? r.abort('connectionrefused') : r.fulfill({ status: 503, contentType: 'text/html', body: 'Service Unavailable' });
});
for (const [tab, mode] of [['Entry / Exit Logs', 'abort'], ['Inventory Master', 503], ['Employee & Vehicle Approval', 'abort'], ['Live Parking Status', 503], ['Predictive Analytics', 'abort'], ['Reports', 'abort']]) {
  await nav(page, tab); await page.waitForTimeout(1500);
  down = mode;
  await page.locator('header button').filter({ has: page.locator('svg.lucide-refresh-cw, svg.lucide-rotate-cw') }).first().click().catch(async () => { await nav(page, 'Role Home Dashboard'); await nav(page, tab); });
  await page.waitForTimeout(2000);
  const body = await page.innerText('body');
  const card = /We couldn.t load this/i.test(body), retry = await page.getByRole('button', { name: /Try again/i }).count(), crash = /Something went wrong/.test(body);
  await shot(page, `AC45-${tab.replace(/[^a-z]/gi, '')}`);
  down = null;
  if (retry) { await page.getByRole('button', { name: /Try again/i }).first().click(); await page.waitForTimeout(2000); }
  const recovered = !/We couldn.t load this|Something went wrong/i.test(await page.innerText('body'));
  rec(`AC-45 load ${tab} (${mode})`, card && retry > 0 && !crash && recovered, `error card=${card}; Try again=${retry > 0}; whole-app crash card=${crash}; recovered after Try again=${recovered}`);
  if (crash) { await page.reload(); await page.waitForTimeout(2500); }
}
// save failure
await nav(page, 'Inventory Master'); await page.waitForTimeout(1500);
down = 'abort';
await page.locator('main [data-write-guard]').filter({ hasText: /Set Maintenance/ }).first().click(); await page.waitForTimeout(1500);
const body = await page.innerText('body');
await shot(page, 'AC45-save');
down = null;
rec('AC-45 save failure', /Couldn.t save|Nothing was changed|could not|failed/i.test(body) && !/success|updated to/i.test(body.slice(-600)), `message: "${(body.match(/(Couldn.t save[^\n]*|[^\n]*fail[^\n]*|[^\n]*Could not[^\n]*)/i) || ['(none)'])[0].slice(0, 120)}"`);
fs.writeFileSync(`${process.env.QA_OUT || './qa-out'}/res-err.json`, JSON.stringify(R, null, 2));
await b.close();
