// 002 R1b QA browser helpers (QA-run, not part of `npm run test:qa`; Playwright is not a repo dependency).
//   PW=<playwright/index.mjs> CHROME=<chromium> AXE=<axe.min.js> QA_BASE_URL=http://127.0.0.1:4071 \
//   QA_FIXTURES=qa-out/fixtures.json QA_FIXTURES_R1B=qa-out/fixtures-r1b.json QA_OUT=qa-out node tests/qa/002/r1b/console.mjs [sections]
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
const { chromium } = await import(process.env.PW || 'playwright');
export const URL = process.env.QA_BASE_URL || 'http://127.0.0.1:4071';
export const OUT = process.env.QA_OUT || 'qa-out';
export const AXE = readFileSync(process.env.AXE, 'utf8');
export const fx = JSON.parse(readFileSync(process.env.QA_FIXTURES || `${OUT}/fixtures.json`, 'utf8'));
export const fx2 = JSON.parse(readFileSync(process.env.QA_FIXTURES_R1B || `${OUT}/fixtures-r1b.json`, 'utf8'));
export const PW = 'QaTestPassword#2026';
export const MASTER = 'digisolutions.fm@gmail.com';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(`${OUT}/states`, { recursive: true });
mkdirSync(`${OUT}/shots`, { recursive: true });

export const results = [];
export const rec = (id, pass, detail = '') => { results.push({ id, pass: !!pass, detail: String(detail).slice(0, 1500) }); console.error(`${pass ? 'PASS' : 'FAIL'} ${id} | ${String(detail).slice(0, 200)}`); };
export const info = (id, detail) => { results.push({ id, pass: true, info: true, detail: String(detail).slice(0, 1500) }); console.error(`INFO ${id} | ${String(detail).slice(0, 200)}`); };

export const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

/** API helper (for ids, setup and cross-checks). */
const tokens = {};
export async function api(email, method, path, { body, site, viewAs } = {}) {
  if (!tokens[email]) {
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${URL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: email, password: PW }) });
      if (r.status === 429) { await sleep(6000); continue; }
      tokens[email] = (await r.json()).token; break;
    }
  }
  const headers = { 'x-session-token': tokens[email] };
  if (body) headers['Content-Type'] = 'application/json';
  if (site) headers['x-site-id'] = site;
  if (viewAs) headers['x-view-as'] = viewAs;
  const r = await fetch(`${URL}/api/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, json: j };
}

/** Sign in through the Login screen once per account; later contexts reuse the saved state. */
export async function stateFor(email) {
  const f = `${OUT}/states/${email.replace(/[^a-z0-9]/gi, '_')}.json`;
  if (existsSync(f)) return f;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  for (let i = 0; i < 6; i++) {
    await p.goto(URL + '/'); await p.waitForSelector('input[type=password]');
    await p.locator('input[autocomplete=username], input[type=email]').first().fill(email);
    await p.locator('input[type=password]').first().fill(PW);
    await p.getByRole('button', { name: /^Sign in$/ }).click();
    await p.waitForTimeout(2500);
    if (!(await p.locator('input[type=password]').count())) break;
    await sleep(8000); // throttled; try again
  }
  await ctx.storageState({ path: f });
  await ctx.close();
  return f;
}

/** Open a page as a user, optional site and view-as (both via the app's own browser-storage keys). */
export async function openAs(email, { width = 1280, height = 900, touch, siteId, viewAsId, hash = '', latency = 0, reqLog } = {}) {
  const userId = email === MASTER ? ((r) => r.user?.id || r.id)((await api(MASTER, 'GET', '/auth/me')).json)
    : Object.values({ ...fx.users, ...fx2.users }).find((u) => u.email === email)?.id;
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch ?? width < 768, storageState: await stateFor(email) });
  const page = await ctx.newPage();
  const errors = []; const reqs = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { if (r.url().includes('/api/v1/')) reqs.push({ m: r.method(), u: r.url().replace(URL, ''), site: r.headers()['x-site-id'], va: r.headers()['x-view-as'] }); });
  if (latency) await page.route('**/api/v1/**', async (route) => { await sleep(latency); await route.continue(); });
  await page.goto(URL + '/');
  // let the first load settle before changing the stored site / view-as: a landing redirect that finishes
  // after the change would otherwise overwrite the deep link below (harness race, 06 R1b re-test O-2)
  if (siteId || viewAsId) await sleep(1200);
  if (siteId || viewAsId) {
    await page.evaluate(({ siteId, viewAsId, uid }) => {
      // the app keys the remembered site by the signed-in user's id
      for (const k of Object.keys(localStorage)) if (k.startsWith('parkflows.site.')) localStorage.setItem(k, siteId || localStorage.getItem(k));
      if (siteId && uid) localStorage.setItem(`parkflows.site.${uid}`, siteId);
      if (viewAsId) localStorage.setItem('parkflows.viewAs', viewAsId);
    }, { siteId, viewAsId, uid: userId });
  }
  await page.goto(URL + '/' + (hash ? `#/${hash}` : ''));
  // a hash-only goto doesn't re-run the app's start-up; reload so the stored site / view-as are read
  if (siteId || viewAsId) await page.reload();
  await page.waitForTimeout(1800);
  return { ctx, page, errors, reqs };
}

export async function axe(page, tag) {
  await page.evaluate(AXE);
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map((x) => `${x.id}×${x.nodes.length}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  return v;
}

/** Layout/a11y measures for the current page (NFR-4 rules: in-sentence links exempt). */
export async function measure(page) {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden],[aria-hidden=true],.pf-sr-only'); };
    const sizes = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode, el = n.parentElement; if (!n.textContent.trim() || !el || !vis(el)) continue; sizes.push([parseFloat(getComputedStyle(el).fontSize), n.textContent.trim().slice(0, 30)]); }
    sizes.sort((a, b) => a[0] - b[0]);
    const inSentence = (a) => { const p = a.closest('p,li,dd,td'); return a.tagName === 'A' && p && !a.className.includes('pf-btn') && p.textContent.replace(/\s+/g, ' ').trim().length > a.textContent.trim().length + 15; };
    const coarse = matchMedia('(pointer: coarse)').matches || innerWidth < 768;
    const small = [...document.querySelectorAll('a[href],button,[role=tab],[role=radio],input:not([type=hidden]),select,textarea,summary')].filter(vis).filter((e) => !inSentence(e))
      .map((e) => { let el = e; if (e.matches('input[type=checkbox],input[type=radio]')) el = e.closest('label') || e; const r = el.getBoundingClientRect(); return [(e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 24), Math.round(r.width), Math.round(r.height), el.className.slice(0, 30)]; })
      // mouse at ≥768: a checkbox inside a table row is exempt (UX 02: "the row is the target")
      .filter((x) => coarse ? (x[1] < 44 || x[2] < 44) : ((x[1] < 24 || x[2] < 24) && !(x[3].includes('pf-check') && /^Select /.test(x[0]))));
    // body text: paragraphs that aren't the design system's secondary text styles (note/help/caption = small 13px token)
    const bodyText = [...document.querySelectorAll('main p')].filter(vis).filter((p) => !/note|help|caption|meta|counter|small/.test(p.className)).map((p) => parseFloat(getComputedStyle(p).fontSize)).filter((x) => x < 14);
    return { iw: innerWidth, sw: document.documentElement.scrollWidth, minFont: sizes[0], small, smallBody: bodyText.length, h1: [...document.querySelectorAll('h1')].map((h) => h.innerText) };
  });
}

export const mainText = (page) => page.evaluate(() => (document.querySelector('main')?.innerText || document.body.innerText).replace(/\s+/g, ' '));
export const h1 = (page) => page.evaluate(() => [...document.querySelectorAll('h1')].map((h) => h.innerText).join(' / '));

export function finish(name) {
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(results, null, 1));
  const f = results.filter((r) => !r.pass);
  console.log(`${name}: ${results.filter((r) => !r.info).length} checks, ${results.filter((r) => r.pass && !r.info).length} pass, ${f.length} fail`);
  for (const x of f) console.log('FAIL', x.id, '|', x.detail);
}
