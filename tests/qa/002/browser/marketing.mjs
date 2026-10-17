// 002 QA, R1-pre T6: parkflows.in (dist-marketing/) in Chromium. AC-30 (+ AC-18/21 for the site).
//   npm run build:marketing && python3 -m http.server 4602 -d dist-marketing
//   PW=<playwright/index.mjs> CHROME=<chromium> node tests/qa/browser/002-marketing.mjs http://localhost:4602 <axe.min.js>
// The demo endpoint (B6) is not built yet: every API response here is a Playwright route mock.
// MODE=off (default build, R1a: contact panel, no form, no demo.js) or MODE=on (PF_DEMO_FORM=1 build, AC-32).
// Serve with tests/qa/002/support/hosting-server.mjs to get the D1 headers (CSP etc.): CSP violations then
// show up as console errors and fail the "no console errors" checks.
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.PW || 'playwright');
const BASE = (process.argv[2] || 'http://localhost:4602').replace(/\/$/, '');
const AXE = readFileSync(process.argv[3], 'utf8');
const results = [];
const rec = (id, pass, detail = '') => results.push({ id, pass: !!pass, detail: String(detail) });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const PAGES = ['/', '/demo/', '/privacy/'];
const origin = new URL(BASE).origin;
const MODE = process.env.MODE === 'off' ? 'off' : 'on';
rec(`build under test: flag ${MODE.toUpperCase()}`, true, BASE);

async function ctxPage(width, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, ...opts });
  const page = await ctx.newPage();
  const log = { errors: [], hosts: new Set(), requests: [] };
  page.on('console', (m) => m.type() === 'error' && log.errors.push(m.text()));
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('request', (r) => { log.requests.push(r); try { log.hosts.add(new URL(r.url()).origin); } catch {} });
  return { ctx, page, log };
}

// ---------- every page at 360 / 768 / 1280 ----------
for (const width of [360, 768, 1280]) {
  for (const path of PAGES) {
    const { ctx, page, log } = await ctxPage(width);
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    const w = `${path} @${width}`;
    const m = await page.evaluate(() => {
      const sizes = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode; const el = n.parentElement;
        if (!n.textContent.trim() || !el) continue;
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (r.width === 0 || cs.visibility === 'hidden' || el.closest('.pf-sr-only,[hidden],noscript,.mk-honeypot')) continue;
        sizes.push([parseFloat(cs.fontSize), n.textContent.trim().slice(0, 30)]);
      }
      sizes.sort((a, b) => a[0] - b[0]);
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, min: sizes[0], cookie: document.cookie,
        book: [...document.querySelectorAll('a')].filter((a) => /Book a demo/.test(a.textContent)).map((a) => a.getAttribute('href')),
        signin: [...document.querySelectorAll('a')].filter((a) => /Sign in/.test(a.textContent)).map((a) => a.getAttribute('href')),
        logos: [...document.querySelectorAll('img')].map((i) => i.getAttribute('src')),
        title: document.title, h1: document.querySelectorAll('h1').length };
    });
    rec(`no horizontal scroll ${w}`, m.sw <= m.iw, `scrollWidth ${m.sw} / ${m.iw}`);
    rec(`smallest text ≥ 12px ${w}`, m.min && m.min[0] >= 12, `${m.min?.[0]}px "${m.min?.[1]}"`);
    const ext = [...log.hosts].filter((h) => h !== origin && !h.startsWith('data:'));
    rec(`no external hosts ${w}`, ext.length === 0, ext.join(', ') || `only ${origin}`);
    rec(`no console errors ${w}`, log.errors.length === 0, log.errors.slice(0, 3).join(' | ') || 'none');
    rec(`no cookies set ${w}`, m.cookie === '', m.cookie || 'none');
    if (width === 1280) {
      rec(`Sign in → https://admin.parkflows.in/ ${path}`, m.signin.length >= 1 && m.signin.every((h) => h === 'https://admin.parkflows.in/'), m.signin.join(', '));
      rec(`every "Book a demo" link → /demo/ ${path}`, m.book.length >= 1 && m.book.every((h) => h === '/demo/'), m.book.join(', '));
      rec(`title says "ParkFlows", one h1 ${path}`, /ParkFlows/.test(m.title) && m.h1 === 1, `${m.title} · h1×${m.h1}`);
      rec(`one logo (shared brand SVG) ${path}`, m.logos.length > 0 && m.logos.every((s) => /parkflows-logo/.test(s)), m.logos.join(', '));
      // axe
      await page.evaluate(AXE); // evaluate, not a <script> tag: the D1 CSP (script-src self) blocks injected inline scripts
      const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } })).violations.map((x) => `${x.id} ×${x.nodes.length}`));
      rec(`axe 0 violations ${path} @1280`, v.length === 0, v.join(', ') || '0');
    }
    if (width === 360) {
      await page.evaluate(AXE); // evaluate, not a <script> tag: the D1 CSP (script-src self) blocks injected inline scripts
      const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } })).violations.map((x) => `${x.id} ×${x.nodes.length}`));
      rec(`axe 0 violations ${path} @360`, v.length === 0, v.join(', ') || '0');
    }
    await ctx.close();
  }
}

// ---------- 360: the menu drawer opens and holds Sign in ----------
{
  const { ctx, page } = await ctxPage(360);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const menu = page.getByRole('button', { name: /menu/i }).first();
  const box = await menu.boundingBox();
  await menu.click();
  await page.waitForTimeout(300);
  const signin = page.getByRole('link', { name: 'Sign in' }).filter({ visible: true });
  rec('360: menu button ≥ 44px and the drawer shows Sign in', box && box.width >= 44 && box.height >= 44 && (await signin.count()) >= 1, `menu ${box?.width}×${box?.height}, visible Sign in links ${await signin.count()}`);
  await ctx.close();
}

if (MODE === 'off') {
// ---------- flag OFF (R1a): /demo/ is a contact panel ----------
for (const [label, opts, width] of [['JS on', {}, 360], ['JS on', {}, 1280], ['JS off', { javaScriptEnabled: false }, 360], ['JS off', { javaScriptEnabled: false }, 1280]]) {
  const { ctx, page, log } = await ctxPage(width, opts);
  await page.goto(BASE + '/demo/', { waitUntil: 'networkidle' });
  const st = await page.evaluate(() => ({
    forms: document.querySelectorAll('form').length, inputs: document.querySelectorAll('input, textarea, select').length,
    scripts: [...document.querySelectorAll('script')].map((x) => x.getAttribute('src')),
    panel: (() => { const p = document.querySelector('.mk-contact'); if (!p) return null; const r = p.getBoundingClientRect(); return { visible: r.height > 0 && getComputedStyle(p).visibility !== 'hidden', text: p.innerText.replace(/\s+/g, ' ') }; })(),
    buttons: [...document.querySelectorAll('.mk-contact a')].map((a) => { const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), w: Math.round(r.width), h: Math.round(r.height) }; }),
  }));
  const demoReq = log.requests.filter((r) => /demo[-.][\w-]*\.js/.test(r.url()) || /\/demo\.js/.test(r.url())).map((r) => r.url());
  const nonGet = log.requests.filter((r) => r.method() !== 'GET').map((r) => r.method() + ' ' + r.url());
  rec(`flag OFF ${label} @${width}: /demo/ has no form and no fields`, st.forms === 0 && st.inputs === 0, `forms ${st.forms}, fields ${st.inputs}`);
  rec(`flag OFF ${label} @${width}: contact panel visible with sales@parkflows.in + +91 98206 03518`, st.panel?.visible && /sales@parkflows\.in/.test(st.panel.text) && /\+91 98206 03518/.test(st.panel.text), st.panel?.text);
  rec(`flag OFF ${label} @${width}: mailto/tel buttons, ≥ 44px`, st.buttons.length === 2 && st.buttons[0].href.startsWith('mailto:sales@parkflows.in') && st.buttons[1].href === 'tel:+919820603518' && st.buttons.every((b) => b.h >= 44 && b.w >= 44), JSON.stringify(st.buttons));
  rec(`flag OFF ${label} @${width}: demo.js not in the page and never requested`, !st.scripts.some((x) => /demo/.test(x || '')) && demoReq.length === 0, `scripts ${JSON.stringify(st.scripts)} · demo requests ${demoReq.length}`);
  rec(`flag OFF ${label} @${width}: no non-GET request, no query string`, nonGet.length === 0 && !page.url().includes('?'), nonGet.join(', ') || page.url());
  await ctx.close();
}
{
  const { ctx, page } = await ctxPage(1280);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Book a demo' }).first().click();
  await page.waitForLoadState('networkidle');
  rec('flag OFF: clicking "Book a demo" on / lands on /demo/ with the contact panel', new URL(page.url()).pathname === '/demo/' && (await page.locator('.mk-contact').isVisible()), page.url());
  await ctx.close();
}
} else {
// ---------- JS off ----------
{
  const { ctx, page, log } = await ctxPage(1280, { javaScriptEnabled: false });
  await page.goto(BASE + '/demo/', { waitUntil: 'networkidle' });
  const formVisible = await page.locator('#demo-form').isVisible();
  const sendVisible = await page.locator('#f-submit').isVisible();
  const noscript = page.locator('.mk-noscript');
  const nsVisible = await noscript.isVisible().catch(() => false);
  const nsText = nsVisible ? await noscript.innerText() : '';
  const disp = await page.evaluate(() => { const f = document.getElementById('demo-form'); const cs = getComputedStyle(f); return `display ${cs.display}, visibility ${cs.visibility}, inert ${f.inert}`; });
  rec('JS off: /demo/ shows no form and no Send button', !formVisible && !sendVisible, `form visible ${formVisible}, Send visible ${sendVisible} · ${disp}`);
  rec('JS off: no console errors (incl. CSP)', log.errors.length === 0, log.errors.slice(0, 2).join(' | ') || 'none');
  rec('JS off: noscript fallback with email + phone is shown', nsVisible && /sales@parkflows\.in/.test(nsText) && /\+91 98206 03518/.test(nsText), nsText.replace(/\s+/g, ' '));
  // try to submit anyway: Enter in a field and a forced click
  let typed = true;
  await page.locator('#f-name').fill('Asha', { timeout: 1500 }).catch(() => { typed = false; });
  await page.locator('#f-submit').click({ timeout: 1500, force: true }).catch(() => {});
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  rec('JS off: fields cannot be typed into; submitting puts no query string in the URL', !typed && !page.url().includes('?'), `typed ${typed}, url ${page.url()}`);
  const posts = log.requests.filter((r) => r.method() !== 'GET');
  rec('JS off: no request is sent', posts.length === 0, posts.map((r) => r.method() + ' ' + r.url()).join(', ') || 'none');
  await ctx.close();
}
// JS on but demo.js blocked: the form is invisible and inert (round 2 BUG-2 fix keeps its space reserved)
for (const width of [360, 1280]) {
  const { ctx, page, log } = await ctxPage(width);
  await page.route(/demo-[\w-]+\.js$/, (r) => r.abort());
  await page.goto(BASE + '/demo/', { waitUntil: 'networkidle' });
  const st = await page.evaluate(() => { const f = document.getElementById('demo-form'); const cs = getComputedStyle(f); return { visibility: cs.visibility, display: cs.display, inert: f.inert }; });
  // Tab through the page: focus must never enter the form
  let entered = false;
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => !!document.activeElement?.closest('#demo-form'))) { entered = true; break; } }
  const box = await page.locator('#f-name').boundingBox().catch(() => null);
  if (box) { await page.mouse.click(box.x + 10, box.y + 10); await page.keyboard.type('Asha'); await page.keyboard.press('Enter'); }
  await page.waitForTimeout(300);
  const typed = await page.locator('#f-name').inputValue().catch(() => '');
  const nonGet = log.requests.filter((r) => r.method() !== 'GET');
  rec(`flag ON, demo.js failed to load @${width}: form invisible and inert, Tab never enters, typing/Enter do nothing, no request, no query`, !(await page.locator('#demo-form').isVisible()) && st.inert && !entered && typed === '' && nonGet.length === 0 && !page.url().includes('?'), `${JSON.stringify(st)} · tab entered ${entered} · typed "${typed}" · non-GET ${nonGet.length} · ${page.url()}`);
  await ctx.close();
}

// ---------- JS on: validation, payload, mocked responses ----------
async function demoPage(handler) {
  const { ctx, page, log } = await ctxPage(1280);
  const sent = [];
  await page.route('**/api/v1/demo-requests', async (route) => {
    const req = route.request();
    sent.push({ method: req.method(), url: req.url(), headers: await req.allHeaders(), body: req.postDataJSON() });
    return handler(route);
  });
  await page.goto(BASE + '/demo/', { waitUntil: 'networkidle' });
  return { ctx, page, log, sent };
}
async function fillValid(page) {
  await page.fill('#f-name', 'Asha Rao');
  await page.fill('#f-company', 'Alphatech');
  await page.fill('#f-email', 'asha@alphatech.in');
  await page.fill('#f-phone', '98206 03518');
  await page.fill('#f-city', 'Pune');
  await page.selectOption('#f-facility', 'Tech campus');
  await page.fill('#f-slots', '1,080');
  await page.check('#f-consent', { force: true });
}
{
  const { ctx, page, sent } = await demoPage((r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
  rec('JS on: form visible', await page.locator('#demo-form').isVisible());
  await page.click('#f-submit');
  const errs = await page.evaluate(() => [...document.querySelectorAll('.pf-field-error:not([hidden])')].map((e) => e.id + ': ' + e.textContent.trim()));
  const focus = await page.evaluate(() => document.activeElement?.id);
  const invalid = await page.evaluate(() => [...document.querySelectorAll('[aria-invalid=true]')].map((e) => e.id));
  rec('JS on: empty submit shows the 7 required-field errors, focus on the first, aria-invalid set', errs.length === 7 && focus === 'f-name' && invalid.length === 7, `${errs.length} errors: ${errs.join(' | ')} · focus ${focus} · aria-invalid ${invalid.join(',')}`);
  rec('JS on: invalid submit sends nothing and leaves the URL alone', sent.length === 0 && !page.url().includes('?'), page.url());
  // field-level rules
  await page.fill('#f-email', 'not-an-email'); await page.fill('#f-phone', '12345'); await page.fill('#f-slots', '0'); await page.fill('#f-sites', '2.5');
  await page.fill('#f-message', 'x'.repeat(1001));
  await page.click('#f-submit');
  const errs2 = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pf-field-error:not([hidden])')].map((e) => [e.id, e.textContent.trim()])));
  rec('JS on: format rules (email, phone, 1–1,00,000 counts, 1,000-char message)', errs2['f-email-err'] && errs2['f-phone-err'] && errs2['f-slots-err'] && errs2['f-sites-err'] && errs2['f-message-err'], JSON.stringify(errs2));
  const counter = await page.locator('#f-message-count').innerText();
  rec('JS on: message counter', /1,001 \/ 1,000 characters/.test(counter), counter);
  // now valid
  await page.fill('#f-message', '');
  await page.fill('#f-sites', '');
  await fillValid(page);
  await page.click('#f-submit');
  await page.waitForSelector('#form-success:not([hidden])', { timeout: 3000 }).catch(() => {});
  const p = sent[0]?.body || {};
  rec('payload: JSON POST to /api/v1/demo-requests, same origin, no cookies', sent.length === 1 && sent[0].method === 'POST' && new URL(sent[0].url).origin === origin && /application\/json/.test(sent[0].headers['content-type']) && !sent[0].headers.cookie, JSON.stringify({ n: sent.length, h: sent[0]?.headers['content-type'] }));
  rec('payload includes pf_hp_field (empty) and normalised fields', 'pf_hp_field' in p && p.pf_hp_field === '' && !('website' in p) && p.phone === '+919820603518' && p.slotsApprox === 1080 && p.consent === true && p.preferredContact === 'Email' && p.facilityType === 'Tech campus', JSON.stringify(p));
  const success = await page.locator('#form-success').isVisible();
  const sText = success ? await page.locator('#form-success').innerText() : '';
  const sFocus = await page.evaluate(() => document.activeElement?.id);
  rec('mocked {"success":true} → success state, focused, form hidden, URL has no query', success && sFocus === 'form-success' && !(await page.locator('#demo-form').isVisible()) && !page.url().includes('?'), `${sText.replace(/\s+/g, ' ')} · focus ${sFocus} · ${page.url()}`);
  await ctx.close();
}
// 200 without success:true → error
for (const [label, handler, expectTitle] of [
  ['400 with field errors', (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ errors: { workEmail: 'Use your company email address.' } }) }), null],
  ['400 without field errors', (r) => r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"bad"}' }), /couldn't send/i],
  ['429', (r) => r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"rate"}' }), /Too many requests right now/],
  ['500', (r) => r.fulfill({ status: 500, body: 'oops' }), /couldn't send/i],
  ['network error', (r) => r.abort('internetdisconnected'), /couldn't send/i],
  ['200 without success:true', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }), /couldn't send/i],
]) {
  const { ctx, page, sent } = await demoPage(handler);
  await fillValid(page);
  await page.fill('#f-message', 'Two basements & a "puzzle" stacker.');
  await page.click('#f-submit');
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => ({
    errVisible: !document.getElementById('form-error').hidden, title: document.getElementById('form-error-title').textContent,
    mail: document.getElementById('form-error-mail').getAttribute('href'), tel: [...document.querySelectorAll('#form-error a[href^="tel:"]')].map((a) => a.getAttribute('href')),
    focus: document.activeElement?.id, field: document.getElementById('f-email-err').hidden ? '' : document.getElementById('f-email-err').textContent,
    formVisible: !document.getElementById('demo-form').hidden, btn: document.getElementById('f-submit').textContent, disabled: document.getElementById('f-submit').disabled,
  }));
  if (!expectTitle) {
    rec(`mocked ${label} → server message under the field, focus there, no error banner`, !st.errVisible && /company email/.test(st.field) && st.focus === 'f-email', JSON.stringify(st));
  } else {
    const body = st.mail ? decodeURIComponent(st.mail.split('body=')[1] || '') : '';
    rec(`mocked ${label} → error banner "${expectTitle.source}" with email (prefilled) + phone fallback, focused, form kept`, st.errVisible && expectTitle.test(st.title) && /^mailto:sales@parkflows\.in\?subject=/.test(st.mail) && /Asha Rao/.test(body) && /puzzle/.test(body) && st.tel.includes('tel:+919820603518') && st.focus === 'form-error' && st.formVisible && st.btn === 'Send request' && !st.disabled && !page.url().includes('?'), `${st.title} · tel ${st.tel} · focus ${st.focus} · mail body has name/message ${/Asha Rao/.test(body)}/${/puzzle/.test(body)}`);
  }
  await ctx.close();
}

}
// ---------- AC-30 copy (what the home page claims) ----------
{
  const { ctx, page } = await ctxPage(1280);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const must = [
    'Your site admin adds employees and their vehicles, one at a time or from a CSV, and approves or rejects each pass request.',
    'Add your employees',
    'log retrieval requests at the valet desk',
    'every entry and exit is recorded in the parking log',
    'Entry recorded',
    'The view refreshes on its own.',
    'Example',
    'Attendants scan or type a number plate on a phone to record entries and exits',
    'Utilisation, occupancy trend and the mix of registered and visitor vehicles for your site. Export the entry and exit log to CSV.', // O-3 (01 v1.2 PM sign-off)
  ];
  const mustNot = [/vehicle mix/i, /Employees register/i, /Employees sign up/i, /overstay/i, /\bTerms\b/, /stays in the parking log/i, /real[- ]time/i, /\bAI\b|LSTM|predict/i, /ParkOrbit|ParkFlow(?!s)/];
  const missing = must.filter((s) => !text.includes(s));
  const found = mustNot.filter((r) => r.test(text)).map(String);
  rec('AC-30 copy: corrected claims present (gap 10, M-2, m-8)', missing.length === 0, missing.join(' | ') || 'all present');
  rec('AC-30 copy: no untrue claims (self-registration, overstay, Terms, real-time, AI) and no old names', found.length === 0, found.join(', ') || 'none');
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
