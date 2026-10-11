import { browser, openPage, login, nav, MASTER, shot } from './lib.mjs';
import fs from 'node:fs';
const b = await browser(); const { page, reqs } = await openPage(b);
const writes = [];
await page.route('**/api/v1/**', (r) => r.request().method() !== 'GET' && !/auth/.test(r.request().url()) ? (writes.push(r.request().url()), r.abort()) : r.continue());
await login(page, MASTER);
await page.getByRole('button', { name: /All sites/ }).first().click(); await page.waitForTimeout(1500);
await nav(page, 'Live Parking Status'); await page.waitForTimeout(2500);
const out = [];
for (const slot of ['A-01', 'B-01']) {
  await page.locator('main').getByText(slot).first().click(); await page.waitForTimeout(800);
  const g = page.locator('[data-write-guard]'); const n = await g.count(); let en = 0; const titles = new Set();
  for (let i = 0; i < n; i++) { if (!(await g.nth(i).isDisabled())) en++; titles.add(await g.nth(i).getAttribute('title')); }
  await shot(page, `AS-02-modal-${slot}`);
  // try clicking every guarded button anyway (disabled -> no request)
  for (let i = 0; i < n; i++) await g.nth(i).click({ force: true, timeout: 1000 }).catch(() => {});
  out.push(`${slot} modal: guarded=${n}, enabled=${en}, titles=${JSON.stringify([...titles])}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  if (await page.locator('.fixed.inset-0.z-50').count()) { out.push('  (modal did not close on Escape)'); await page.mouse.click(8, 790); await page.waitForTimeout(300); }
  if (await page.locator('.fixed.inset-0.z-50').count()) { await page.locator('.fixed.inset-0.z-50 button').filter({ hasText: /close|cancel|×|✕/i }).first().click().catch(() => {}); await page.locator('.fixed.inset-0.z-50 button[aria-label*="lose"]').first().click().catch(() => {}); await page.waitForTimeout(300); }
}
// occupied cards: filter to occupied if a status filter exists
const sel = page.locator('main select').filter({ hasText: 'Occupied Only' }).first();
await sel.selectOption({ label: 'Occupied Only' }); await page.waitForTimeout(1500);
const g2 = page.locator('main [data-write-guard]'); const n2 = await g2.count(); let en2 = 0;
for (let i = 0; i < n2; i++) if (!(await g2.nth(i).isDisabled())) en2++;
out.push(`occupied-filter view: guarded=${n2}, enabled=${en2}`);
await shot(page, 'AS-02-occupied');
out.push(`non-GET attempted: ${JSON.stringify(writes)}`);
console.log(out.join('\n')); fs.writeFileSync(`${process.env.QA_OUT || './qa-out'}/res-as02.txt`, out.join('\n'));
await b.close();
