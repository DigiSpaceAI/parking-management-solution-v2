import { browser, openPage, login, nav, shot, MASTER, sleep } from './lib.mjs';
const b = await browser(); const { page, reqs } = await openPage(b, { height: 1100 });
await login(page, MASTER);
await page.getByRole('button', { name: /QA Site A/ }).first().click(); await page.waitForTimeout(1200);
await nav(page, 'Master Site Config'); await page.waitForTimeout(1500);
const btns = await page.locator('main button').allInnerTexts();
await page.locator('main button').filter({ hasText: /onboard|new site|add site/i }).first().click(); await page.waitForTimeout(500);
await page.fill('input[placeholder="e.g. Prestige Tech Park"]', 'QA New Site');
await page.fill('input[placeholder="e.g. Bengaluru"]', 'Pune');
await page.fill('input[placeholder="e.g. PTP-01"]', 'QAN');
const t0 = Date.now();
await page.locator('main button, [role=dialog] button').filter({ hasText: /Onboard site|Onboarding|^Onboard$|Create site/i }).last().click(); await page.waitForTimeout(2000);
const listed = /QA New Site/.test(await page.innerText('main'));
await page.locator('header button[aria-haspopup="listbox"]').first().click(); await page.waitForTimeout(400);
const opts = await page.locator('[role=option]').allInnerTexts();
const mysites = reqs.filter((r) => r.t > t0 && /my-sites/.test(r.u)).length;
await shot(page, 'AC12-chip');
console.log(JSON.stringify({ btns: btns.slice(0, 8), listedOnPage: listed, chipOptions: opts.map((o) => o.split('\n')[0]), mySitesRefetched: mysites }));
// user site-assignment list: User & RBAC -> add user drawer sites
await page.keyboard.press('Escape');
await nav(page, 'User & RBAC'); await page.waitForTimeout(1200);
const add = page.locator('main button').filter({ hasText: /add user|new user|\+ user/i }).first();
if (await add.count()) { await add.click(); await page.waitForTimeout(800); console.log('assignment list has new site:', /QA New Site/.test(await page.innerText('body'))); await shot(page, 'AC12-userdrawer'); }
await b.close();
