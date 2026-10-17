// 002 R1b re-test: axe (wcag2a/aa, 21a/aa, 22aa) + layout measures at 360 / 768 / 1280 on the pages the
// 535f6fa fixes touch: "Choose a site" (multi-site Site Admin, nothing remembered), No access, and /privacy/
// with the flag OFF and ON (D1 headers via tests/qa/002/support/hosting-server.mjs).
//   same env as console.mjs;  node tests/qa/002/r1b/axe-retest.mjs <flag-off url> <flag-on url> [tag]
import { browser, URL, fx, AXE, rec, finish, openAs, measure, sleep } from './lib.mjs';
const [OFF = 'http://127.0.0.1:4630', ON = 'http://127.0.0.1:4632', TAG = 'axe-retest'] = process.argv.slice(2);
const runAxe = async (p) => { await p.evaluate(AXE); return p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map((x) => `${x.id}×${x.nodes.length}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)); };
const KNOWN = /^label-content-name-mismatch×\d+: (\.pf-bell|\.pf-account)/; // BUG-R1B-6
const ok = (v, m, w) => v.every((x) => KNOWN.test(x)) && m.sw <= m.iw && m.minFont[0] >= 12 && m.small.length === 0 && m.smallBody === 0;
for (const width of [360, 768, 1280]) {
  const touch = width < 768;
  // console: Choose a site (/), No access (#/sites), as the multi-site Site Admin with no site remembered
  for (const [name, hash] of [['Choose a site', ''], ['No access', 'sites']]) {
    const { ctx, page } = await openAs(fx.users.multiab.email, { width, touch });
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('parkflows.site.')) localStorage.removeItem(k); });
    await page.evaluate((h) => history.replaceState(null, '', '/' + (h ? '#/' + h : '')), hash); await page.reload(); await sleep(3500);
    const h1 = await page.evaluate(() => [...document.querySelectorAll('h1')].map((h) => h.innerText).join('/'));
    const v = await runAxe(page); const m = await measure(page);
    rec(`axe ${name} (qa.multiab) @${width}${touch ? ' touch' : ''}: only the known R1B-6; no h-scroll; text ≥12px; targets OK`, h1 === name && ok(v, m),
      `h1 ${h1} · axe ${v.join('; ') || 0} · sw ${m.sw}/${m.iw} · min ${m.minFont} · small ${JSON.stringify(m.small)} · body<14 ${m.smallBody}`);
    await ctx.close();
  }
  // marketing /privacy/ flag OFF and ON
  for (const [flag, base] of [['OFF', OFF], ['ON', ON]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch });
    const p = await ctx.newPage(); const errs = []; p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await p.goto(base + '/privacy/', { waitUntil: 'networkidle' });
    const v = await runAxe(p); const m = await measure(p);
    rec(`axe /privacy/ flag ${flag} @${width}${touch ? ' touch' : ''}: 0 violations; no h-scroll; text ≥12px; targets OK; no console/CSP errors`, v.length === 0 && m.sw <= m.iw && m.minFont[0] >= 12 && m.small.length === 0 && errs.length === 0,
      `axe ${v.join('; ') || 0} · sw ${m.sw}/${m.iw} · min ${m.minFont} · small ${JSON.stringify(m.small)} · errors ${errs.length}`);
    await ctx.close();
  }
}
await browser.close();
finish(TAG);
