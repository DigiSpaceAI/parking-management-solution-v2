// Playwright is NOT a repo dependency: point PLAYWRIGHT_MODULE at an existing install (see 001-browser-checks.md).
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
export const URL = process.env.QA_BASE_URL || 'http://127.0.0.1:3950';
export const OUT = process.env.QA_OUT || './qa-out';
export const REPO = process.env.PF_REPO || process.cwd();
export const PW = 'QaTestPassword#2026';
export const MASTER = 'digisolutions.fm@gmail.com';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function browser() { return chromium.launch(); }
// ctx with optional latency on /api/v1 and a request log
export async function openPage(b, { width = 1280, height = 800, latency = 0 } = {}) {
  const ctx = await b.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const reqs = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/')) reqs.push({ t: Date.now(), m: r.method(), u: r.url().replace(URL, ''), h: r.headers() }); });
  if (latency) await page.route('**/api/v1/**', async (route) => { await sleep(latency); await route.continue(); });
  return { ctx, page, reqs };
}
export async function login(page, id, path = '/') {
  await page.goto(URL + path);
  await page.fill('input[placeholder="name@company.com"]', id);
  await page.fill('input[type="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1800);
}
export async function nav(page, label) {
  await page.locator('aside, nav').getByText(label, { exact: true }).first().click();
  await page.waitForTimeout(400);
}
export const shot = (page, name) => page.screenshot({ path: `${OUT}/shots/${name}.png` });
export async function pickSite(page, name) {
  const chip = page.locator('header button[aria-haspopup="listbox"]').first();
  await chip.click(); await page.waitForTimeout(150);
  await page.locator('[role=listbox] [role=option]').filter({ hasText: name }).first().click();
}
export async function chipText(page) {
  return page.locator('header button[aria-haspopup="listbox"]').first().getAttribute('aria-label').catch(() => null);
}
// Start a DOM sampler: every 100 ms record chip label + which site's plate markers are visible.
export async function startSampler(page) {
  await page.evaluate(() => {
    window.__samples = [];
    window.__sampler = setInterval(() => {
      const chip = document.querySelector('header button[aria-haspopup="listbox"]');
      const main = document.querySelector('main') || document.body;
      const t = main.innerText || '';
      window.__samples.push({ t: Date.now(), chip: chip ? (chip.getAttribute('aria-label') || chip.innerText) : '', A: /MH12QA/.test(t), B: /MH14QB/.test(t) });
    }, 100);
  });
}
export async function stopSampler(page) {
  return page.evaluate(() => { clearInterval(window.__sampler); return window.__samples; });
}
import path from 'node:path';
// Work-around for BUG (attendant assets): serve /assets/mobile-* from dist-mobile so the portal logic can be tested.
export async function fixAttendantAssets(page) {
  await page.route(/\/assets\/mobile-[^/]+$/, (route) => {
    const f = path.join(path.join(REPO, 'dist-mobile/assets'), path.basename(new globalThis.URL(route.request().url()).pathname));
    return route.fulfill({ path: f, contentType: f.endsWith('.css') ? 'text/css' : 'application/javascript' });
  });
}
export async function attLogin(page, email) {
  await page.goto(URL + '/attendant/'); await page.waitForTimeout(1500);
  await page.fill('input', email); await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(800);
  await page.fill('input[type=password]', PW); await page.getByRole('button', { name: 'Sign In' }).click(); await page.waitForTimeout(2500);
  for (let round = 0; round < 3; round++) {
    if (!(await page.getByText(/4-digit PIN|Confirm (your )?PIN|Enter (your )?PIN/i).count())) break;
    for (const d of ['1', '2', '3', '4']) await page.getByRole('button', { name: d, exact: true }).click();
    await page.waitForTimeout(1200);
  }
}
