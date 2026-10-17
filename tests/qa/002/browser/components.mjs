// 002 QA, R1-pre: design-system components in Chromium at 360 / 768 / 1280.
// The preview (src/design-system/preview) is not routed yet, so QA mounts it with a throwaway
// Vite harness (index.html + main.tsx that renders <DesignSystemPreview/> with tokens/fonts/
// components/theme CSS), builds it and serves it statically. See 06-test-report.md "Environment".
//   node tests/qa/browser/002-components.mjs <harness-url> <axe.min.js path>
// Requires Playwright (PW env var = path to playwright/index.mjs). Prints one JSON result object.
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.PW || 'playwright');
const BASE = process.argv[2] || 'http://localhost:4601/';
const AXE = readFileSync(process.argv[3], 'utf8');
const results = [];
const rec = (id, pass, detail = '') => results.push({ id, pass: !!pass, detail });

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

async function open(width, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: width < 768, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  if (opts.clock) await page.clock.install({ time: new Date('2026-10-07T05:00:00Z') });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.pf-preview');
  return { ctx, page, errors };
}
async function axe(page, label) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return res.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  rec(`axe ${label}`, r.length === 0, r.join('; ') || '0 violations');
}
const dialogOpen = (page, cls) => page.evaluate((c) => !!document.querySelector(`dialog.${c}[open]`), cls);
const activeText = (page) => page.evaluate(() => (document.activeElement?.textContent || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || '').trim());

for (const width of [360, 768, 1280]) {
  const { ctx, page, errors } = await open(width);
  const w = `@${width}`;
  // layout
  const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  rec(`no horizontal scroll ${w}`, sw.sw <= sw.iw, `scrollWidth ${sw.sw}, viewport ${sw.iw}`);
  // overflowing / clipped elements inside .pf-preview (rough "nothing cut off")
  // anything past the right edge that is NOT inside its own horizontal scroll container is cut off
  const clipped = await page.evaluate(() => [...document.querySelectorAll('.pf-preview *')].filter((e) => {
    const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.right > window.innerWidth + 1)) return false;
    let a = e.parentElement; while (a && !['auto', 'scroll'].includes(getComputedStyle(a).overflowX)) a = a.parentElement; return !a;
  }).slice(0, 5).map((e) => e.className || e.tagName));
  rec(`nothing cut off at the right edge ${w}`, clipped.length === 0, clipped.join(', ') || 'none');
  const scrollers = await page.evaluate(() => [...document.querySelectorAll('.pf-preview *')].filter((e) => ['auto', 'scroll'].includes(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1).map((e) => `${e.className} ${e.clientWidth}→${e.scrollWidth}px`));
  rec(`INFO containers that scroll sideways ${w}`, true, scrollers.join('; ') || 'none');
  await axe(page, `preview page ${w}`);

  // tables become cards below tablet
  const tableMode = await page.evaluate(() => {
    const t = document.querySelector('table.pf-table, .pf-table table, table');
    const cards = document.querySelector('.pf-table-cards, [class*="cards"]');
    return { tableVisible: !!t && getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().width > 0, cardsVisible: !!cards && getComputedStyle(cards).display !== 'none' && cards.getBoundingClientRect().height > 0 };
  });
  rec(`Table: ${width < 768 ? 'cards' : 'table'} view ${w}`, width < 768 ? tableMode.cardsVisible && !tableMode.tableVisible : tableMode.tableVisible && !tableMode.cardsVisible, JSON.stringify(tableMode));

  // 44px targets at 360 (and coarse pointer)
  if (width <= 768) { // NFR-4: 44px on touch or below 768 (contexts below 768 are created with hasTouch)
    const tp = width === 768 ? await (async () => { const c = await browser.newContext({ viewport: { width: 768, height: 800 }, hasTouch: true }); const pg = await c.newPage(); await pg.goto(BASE, { waitUntil: 'networkidle' }); return { c, pg }; })() : null;
    const pg = tp ? tp.pg : page;
    const small = await pg.evaluate(() => [...document.querySelectorAll('.pf-preview button, .pf-preview [role=tab], .pf-preview [role=radio], .pf-preview input:not([type=hidden]), .pf-preview select, .pf-preview a[href], .pf-preview [tabindex="0"]')]
      .filter((e) => !e.matches('[role=tabpanel]'))
      // NFR-4 exemption: a link inside a sentence of running text (.pf-link--inline, help or state text)
      .filter((e) => !e.matches('.pf-link--inline, .pf-field-help a, .pf-state-text a'))
      .map((e) => { let el = e; if (e.matches('input[type=checkbox],input[type=radio]')) el = e.closest('label') || e; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { n: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30), cls: el.className, w: Math.round(r.width), h: Math.round(r.height), vis: r.width > 0 && cs.visibility !== 'hidden' }; })
      .filter((x) => x.vis && (x.w < 44 || x.h < 44)));
    rec(`44px targets on touch @${width} (NFR-4)`, small.length === 0, small.length ? JSON.stringify(small.slice(0, 8)) + ` (${small.length} total)` : 'all ≥ 44×44');
    if (tp) { await tp.c.close(); }
  }

  if (width === 1280) {
    const links = await page.evaluate(() => [...document.querySelectorAll('.pf-preview a.pf-link:not(.pf-link--inline)')].filter((e) => !e.closest('.pf-field-help, .pf-state-text')).map((e) => { const r = e.getBoundingClientRect(); return { n: e.textContent.trim(), h: Math.round(r.height), w: Math.round(r.width) }; }));
    rec('standalone .pf-link ≥ 24px with a mouse @1280 (UX 02)', links.length > 0 && links.every((l) => l.h >= 24 && l.w >= 24), JSON.stringify(links));
  }
  // Modal (opened from the bulk bar "Reject")
  const reject = page.getByRole('button', { name: 'Reject', exact: true }).first();
  await reject.scrollIntoViewIfNeeded();
  await reject.click();
  rec(`Modal opens ${w}`, await dialogOpen(page, 'pf-dialog--modal'));
  await page.waitForTimeout(300); // let the 200 ms fade finish before axe measures contrast
  await axe(page, `modal open ${w}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  rec(`Modal: Esc closes ${w}`, !(await dialogOpen(page, 'pf-dialog--modal')));
  rec(`Modal: focus returns to opener after Esc ${w}`, (await activeText(page)) === 'Reject', await activeText(page));
  // backdrop click
  await reject.click();
  await page.mouse.click(3, 3);
  await page.waitForTimeout(100);
  rec(`Modal: backdrop click closes ${w}`, !(await dialogOpen(page, 'pf-dialog--modal')));
  rec(`Modal: focus returns after backdrop click ${w}`, (await activeText(page)) === 'Reject', await activeText(page));
  // drag from content to backdrop must NOT close
  await reject.click();
  const h2 = await page.locator('dialog.pf-dialog--modal[open] h2').boundingBox();
  await page.mouse.move(h2.x + 5, h2.y + 5);
  await page.mouse.down();
  await page.mouse.move(40, 4, { steps: 5 });
  await page.mouse.move(3, 3, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  rec(`Modal: drag from content onto backdrop stays open ${w}`, await dialogOpen(page, 'pf-dialog--modal'));
  // native close (close-watcher / form method=dialog) → onClose runs, state not stale
  await page.evaluate(() => document.querySelector('dialog.pf-dialog--modal[open]').close());
  await page.waitForTimeout(100);
  const focusAfterNative = await activeText(page);
  await reject.click();
  const reopened = await dialogOpen(page, 'pf-dialog--modal');
  rec(`Modal: native close calls onClose (re-opens on next click) ${w}`, reopened);
  rec(`Modal: focus returns after native close ${w}`, focusAfterNative === 'Reject', focusAfterNative);
  // the X button closes too
  await page.locator('dialog.pf-dialog--modal[open]').getByRole('button', { name: 'Close' }).click();
  rec(`Modal: Close button closes ${w}`, !(await dialogOpen(page, 'pf-dialog--modal')));

  // SidePanel (row click; card click below 768)
  const rowSel = width < 768 ? '.pf-preview [class*="card"][role=button], .pf-preview [class*="cards"] [tabindex="0"]' : '.pf-preview table tbody tr';
  const row = page.locator(rowSel).first();
  if (await row.count()) {
    await row.scrollIntoViewIfNeeded();
    await row.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    let isOpen = await dialogOpen(page, 'pf-dialog--panel');
    if (!isOpen) { await row.click({ position: { x: 60, y: 10 } }); await page.waitForTimeout(150); isOpen = await dialogOpen(page, 'pf-dialog--panel'); }
    rec(`SidePanel opens from a row ${w}`, isOpen);
    if (isOpen) {
      await page.waitForTimeout(300);
      await axe(page, `side panel open ${w}`);
      const opener = await page.evaluate(() => 1);
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      rec(`SidePanel: Esc closes ${w}`, !(await dialogOpen(page, 'pf-dialog--panel')));
      const fe = await page.evaluate(() => document.activeElement?.tagName + '.' + (document.activeElement?.className || ''));
      rec(`SidePanel: focus returns to the row ${w}`, !/BODY/.test(fe), fe);
      await row.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
      if (!(await dialogOpen(page, 'pf-dialog--panel'))) await row.click({ position: { x: 60, y: 10 } });
      if (width > 400) {
        await page.mouse.click(5, 400); await page.waitForTimeout(100);
        rec(`SidePanel: backdrop click closes ${w}`, !(await dialogOpen(page, 'pf-dialog--panel')));
        await row.click({ position: { x: 60, y: 10 } }); await page.waitForTimeout(150);
        const head = await page.locator('dialog.pf-dialog--panel[open] h2').boundingBox();
        await page.mouse.move(head.x + 3, head.y + 3); await page.mouse.down(); await page.mouse.move(5, 400, { steps: 6 }); await page.mouse.up();
        await page.waitForTimeout(100);
        rec(`SidePanel: drag from content onto backdrop stays open ${w}`, await dialogOpen(page, 'pf-dialog--panel'));
      } else {
        const pw = await page.evaluate(() => document.querySelector('dialog.pf-dialog--panel[open]').getBoundingClientRect().width);
        rec(`SidePanel: full width below 768 ${w}`, Math.abs(pw - width) <= 1, `panel ${pw}px`);
      }
      await page.evaluate(() => document.querySelector('dialog.pf-dialog--panel[open]')?.close()); await page.waitForTimeout(100);
      await row.click({ position: { x: 60, y: 10 } }); await page.waitForTimeout(150);
      rec(`SidePanel: native close calls onClose (re-opens) ${w}`, await dialogOpen(page, 'pf-dialog--panel'));
      await page.keyboard.press('Escape');
    }
  } else rec(`SidePanel opens from a row ${w}`, false, 'no row found for ' + rowSel);

  rec(`no console errors ${w}`, errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
  await ctx.close();
}

// ---------- 1280 only: roles, keyboard, sr text, "In since", toasts, reduced motion ----------
{
  const { ctx, page } = await open(1280);
  const roles = await page.evaluate(() => {
    const lists = [...document.querySelectorAll('[role=tablist]')].map((l) => ({ label: l.getAttribute('aria-label'), tabs: l.querySelectorAll('[role=tab]').length, stops: [...l.querySelectorAll('[role=tab]')].filter((t) => t.tabIndex === 0).length, controls: [...l.querySelectorAll('[role=tab]')].filter((t) => t.getAttribute('aria-selected') === 'true').every((t) => t.getAttribute('aria-controls') && document.getElementById(t.getAttribute('aria-controls'))) }));
    const groups = [...document.querySelectorAll('[role=radiogroup]')].map((g) => ({ label: g.getAttribute('aria-label'), radios: g.querySelectorAll('[role=radio]').length, checked: g.querySelectorAll('[role=radio][aria-checked=true]').length, stops: [...g.querySelectorAll('[role=radio]')].filter((t) => t.tabIndex === 0).length, dangling: [...g.querySelectorAll('[role=radio]')].some((t) => t.hasAttribute('aria-controls')) }));
    return { lists, groups };
  });
  rec('Tabs / SegmentedControl(panels): role=tablist with tabs, one tab stop, the selected tab\'s aria-controls resolves to its panel', roles.lists.length >= 3 && roles.lists.every((l) => l.tabs > 1 && l.stops === 1 && l.controls), JSON.stringify(roles.lists));
  rec('SegmentedControl(hasPanels=false) and LevelButtons: role=radiogroup, one checked, one tab stop, no aria-controls', roles.groups.length >= 2 && roles.groups.every((g) => g.radios > 1 && g.checked === 1 && g.stops === 1 && !g.dangling), JSON.stringify(roles.groups));
  const fb = roles.lists.find((l) => /Fallback/.test(l.label || ''));
  rec('Tabs: tab stop falls back to the first enabled tab when value matches none', fb && fb.stops === 1, JSON.stringify(fb));

  // keyboard: Tab into each widget, arrows change selection
  async function kb(sel, attr) {
    const first = page.locator(sel).first();
    await first.scrollIntoViewIfNeeded();
    // focus the element just before the group then Tab into it
    await page.evaluate((s) => { const g = document.querySelector(s); const prev = document.createElement('button'); prev.id = 'qa-prev'; prev.textContent = 'qa'; g.before(prev); prev.focus(); }, sel.split(' ')[0]);
    await page.keyboard.press('Tab');
    const onItem = await page.evaluate((s) => document.activeElement?.closest(s.split(' ')[0]) !== null && document.activeElement?.getAttribute(s.includes('tab') ? 'role' : 'role') !== null, sel);
    const before = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await page.keyboard.press('ArrowRight');
    const after = await page.evaluate((a) => ({ t: document.activeElement?.textContent?.trim(), sel: document.activeElement?.getAttribute(a) }), attr);
    await page.keyboard.press('End');
    const end = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await page.keyboard.press('Home');
    const home = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await page.evaluate(() => document.getElementById('qa-prev')?.remove());
    return { onItem, before, after, end, home };
  }
  const t1 = await kb('[role=tablist] [role=tab]', 'aria-selected');
  rec('Tabs: Tab reaches the selected tab; ArrowRight moves and selects; Home/End', t1.onItem && t1.after.t !== t1.before && t1.after.sel === 'true' && t1.home !== t1.end, JSON.stringify(t1));
  const r1 = await kb('[role=radiogroup] [role=radio]', 'aria-checked');
  rec('SegmentedControl (radiogroup): keyboard reachable, ArrowRight checks next', r1.onItem && r1.after.t !== r1.before && r1.after.sel === 'true', JSON.stringify(r1));
  const levelSel = await page.evaluate(() => { const gs = [...document.querySelectorAll('[role=radiogroup]')]; const g = gs.find((x) => /Level/i.test(x.getAttribute('aria-label') || '')); if (g) g.setAttribute('data-qa-level', '1'); return !!g; });
  const l1 = levelSel ? await kb('[data-qa-level] [role=radio]', 'aria-checked') : null;
  rec('LevelButtons (radiogroup): keyboard reachable, ArrowRight checks next', l1 && l1.onItem && l1.after.t !== l1.before && l1.after.sel === 'true', JSON.stringify(l1));

  // CountBadge and empty KpiCard: screen-reader text
  const sr = await page.evaluate(() => {
    const badges = [...document.querySelectorAll('.pf-count')].map((b) => ({ visibleHidden: [...b.querySelectorAll('[aria-hidden=true]')].map((x) => x.textContent).join(''), sr: b.querySelector('.pf-sr-only')?.textContent, ariaLabel: b.getAttribute('aria-label') }));
    const kpi = [...document.querySelectorAll('.pf-kpi, [class*="kpi"]')].find((k) => /Entries today/.test(k.textContent));
    return { badges, kpi: kpi ? { text: kpi.textContent, sr: [...kpi.querySelectorAll('.pf-sr-only')].map((x) => x.textContent), hidden: [...kpi.querySelectorAll('[aria-hidden=true]')].map((x) => x.textContent) } : null };
  });
  const labelled = sr.badges.filter((b) => b.sr);
  rec('CountBadge (with label): visible number aria-hidden + pf-sr-only text, no aria-label on a span', labelled.length >= 3 && labelled.some((b) => /3 pending requests/.test(b.sr)) && labelled.some((b) => b.visibleHidden === '99+' && /150 items/.test(b.sr)) && sr.badges.every((b) => !b.ariaLabel), JSON.stringify(sr.badges));
  const kpiSnap = await page.locator('.pf-kpi', { hasText: 'Entries today' }).first().ariaSnapshot().catch((e) => String(e));
  rec('Empty KpiCard: "—" is aria-hidden; screen readers get "No data" + the reason (AC-05)', sr.kpi && sr.kpi.hidden.some((h) => h.includes('—')) && sr.kpi.sr.some((s) => /No data/.test(s)) && /No vehicles logged today/.test(kpiSnap) && !/—/.test(kpiSnap), `${JSON.stringify(sr.kpi)} · aria: ${kpiSnap.replace(/\n/g, ' ')}`);
  // a11y tree snapshot of those
  const snap = await page.locator('.pf-count').first().ariaSnapshot().catch((e) => String(e));
  rec('CountBadge accessible text (aria snapshot)', /pending requests/.test(snap), snap.replace(/\n/g, ' '));

  // "In since"
  const since = await page.evaluate(() => [...document.querySelectorAll('.pf-slot-since')].map((e) => e.textContent.trim()));
  const older = since.some((s) => s === 'In since 3 Oct 2026, 09:14');
  const today = since.some((s) => /^In since \d{2}:\d{2}$/.test(s));
  rec('"In since": earlier day shows date + time, today shows time only', older && today, JSON.stringify(since));

  // reduced motion
  const dur = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--duration-base').trim());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const durR = await page.evaluate(() => ({ base: getComputedStyle(document.documentElement).getPropertyValue('--duration-base').trim(), fast: getComputedStyle(document.documentElement).getPropertyValue('--duration-fast').trim() }));
  const zero = (v) => /^0(ms|s)$/.test(v); // the minified build prints 0ms as 0s
  rec('Reduced motion: --duration-* drop to 0ms', !zero(dur) && zero(durR.base) && zero(durR.fast), `normal ${dur}, reduce ${JSON.stringify(durR)}`);
  await ctx.close();
}

// ---------- Toast timers (fake clock) ----------
{
  const { ctx, page } = await open(1280, { clock: true });
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('.pf-toast')].map((t) => t.textContent.trim()));
  const btn = (n) => page.getByRole('button', { name: n, exact: true });
  await btn('Success + undo').scrollIntoViewIfNeeded();
  await btn('Success + undo').click();
  await page.mouse.move(5, 5);
  await page.clock.runFor(60000);
  rec('Toast with Undo does not auto-close (60 s)', (await toasts()).some((t) => /2 requests approved/.test(t)), JSON.stringify(await toasts()));
  // close it
  const closeBtns = page.locator('.pf-toast').getByRole('button', { name: /close|dismiss/i });
  while (await closeBtns.count()) { await closeBtns.first().click(); }
  await btn('Success').click();
  await page.mouse.move(5, 5);
  await page.clock.runFor(4500);
  rec('Plain success toast auto-closes (~4 s)', (await toasts()).length === 0, JSON.stringify(await toasts()));
  // hover pauses
  await btn('Success').click();
  await page.clock.runFor(1000);
  const box = await page.locator('.pf-toast').first().boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.clock.runFor(20000);
  const hovered = (await toasts()).length;
  await page.mouse.move(5, 5);
  await page.clock.runFor(2000);
  const afterLeave2s = (await toasts()).length; // 3 s were left when paused
  await page.clock.runFor(2000);
  const afterLeave4s = (await toasts()).length;
  rec('Toast timer pauses on hover and resumes with the time left', hovered === 1 && afterLeave2s === 1 && afterLeave4s === 0, `hovered 20s: ${hovered}, +2s: ${afterLeave2s}, +4s: ${afterLeave4s}`);
  // focus pauses
  await btn('Success').click();
  await page.clock.runFor(1000);
  const focusable = page.locator('.pf-toast button').first();
  const hasBtn = await focusable.count();
  if (hasBtn) {
    await focusable.focus();
    await page.clock.runFor(20000);
    const focused = (await toasts()).length;
    await btn('Success').focus();
    await page.clock.runFor(4000);
    rec('Toast timer pauses while focus is inside the toast region', focused === 1 && (await toasts()).length === 0, `focused 20s: ${focused}, after blur +4s: ${(await toasts()).length}`);
  } else rec('Toast timer pauses while focus is inside the toast region', false, 'no focusable control in the plain toast');
  // error toast with action: no auto close
  await btn('Error + retry').click().catch(async () => { await page.getByRole('button', { name: /Error \+/ }).click(); });
  await page.mouse.move(5, 5);
  await page.clock.runFor(60000);
  rec('Error toast with "Try again" does not auto-close', (await toasts()).some((t) => /Couldn/.test(t)), JSON.stringify(await toasts()));
  const roles = await page.evaluate(() => [...document.querySelectorAll('.pf-toast')].map((t) => t.closest('[role]')?.getAttribute('role')));
  rec('Error toasts are in a role=alert region', roles.includes('alert'), JSON.stringify(roles));
  await ctx.close();
}


// ---------- T1/T2/T5 acceptance + AC-03 inventory (1280) ----------
{
  const { ctx, page } = await open(1280);
  const hosts = new Set();
  page.on('request', (r) => hosts.add(new URL(r.url()).origin));
  await page.reload({ waitUntil: 'networkidle' });
  const tw = await page.evaluate(() => { const e = document.getElementById('qa-tw-probe'); const cs = getComputedStyle(e); return { bg: cs.backgroundColor, pad: cs.paddingTop, size: cs.fontSize, line: cs.lineHeight, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow !== 'none', color: cs.color }; });
  rec('T1: Tailwind compiles token utilities (bg-navy-600 = #1f3a93, p-4 = 16px, text-title-1 = 24/32)', tw.bg === 'rgb(31, 58, 147)' && tw.pad === '16px' && tw.size === '24px' && tw.line === '32px' && tw.shadow, JSON.stringify(tw));
  const ext = [...hosts].filter((h) => !h.startsWith('http://localhost'));
  rec('T2: no font (or any) request leaves the origin — no Google Fonts', ext.length === 0, ext.join(', ') || 'only localhost');
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`); });
  rec('T2: Sora, IBM Plex Sans and JetBrains Mono load from the bundle', ['Sora', 'IBM Plex Sans', 'JetBrains Mono'].every((f) => fonts.some((x) => x.replace(/"/g, '').startsWith(f))), [...new Set(fonts)].join(', '));
  const fav = await page.evaluate(async () => { const href = document.querySelector('link[rel=icon]')?.href; const img = new Image(16, 16); img.src = href; await img.decode().catch(() => {}); const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16); const d = x.getImageData(0, 0, 16, 16).data; let painted = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++; return { href, ok: img.naturalWidth > 0, painted }; });
  rec('T2: favicon SVG renders at 16px', fav.ok && fav.painted > 50, JSON.stringify(fav));
  // keyboard focus visible on every tab stop in the preview
  await page.evaluate(() => document.getElementById('qa-tw-probe')?.remove());
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  const seen = new Set(); const noRing = []; let firstKey = null;
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const box = e.matches('input[type=checkbox],input[type=radio]') ? getComputedStyle(e.nextElementSibling || e) : cs;
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' || box.boxShadow !== 'none' || (box.outlineStyle !== 'none' && parseFloat(box.outlineWidth) > 0);
      return { k: (e.id || '') + e.tagName + (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 25), ring, inDialog: !!e.closest('dialog') }; });
    if (!f) continue;
    if (firstKey === null) firstKey = f.k; else if (f.k === firstKey) break; // wrapped round the page
    if (seen.has(f.k)) continue;
    seen.add(f.k); if (!f.ring) noRing.push(f.k);
  }
  rec(`T5: visible focus ring on every tab stop (${seen.size} checked)`, seen.size > 30 && noRing.length === 0, noRing.slice(0, 10).join(' | ') || 'all have a ring');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click().catch(() => {});
  // AC-03 inventory (what R1-pre can show; site switcher / page header / nav are F1)
  const inv = await page.evaluate(() => {
    const q = (s) => document.querySelectorAll(s).length;
    return {
      btnPrimary: q('.pf-btn--primary'), btnSecondary: q('.pf-btn--secondary'), btnDestructive: q('.pf-btn--destructive'), btnGhost: q('.pf-btn--ghost'),
      btnDisabled: q('.pf-btn[disabled]'), btnLoading: q('.pf-btn[aria-busy=true]') + q('.pf-btn .pf-spinner'),
      input: q('input.pf-input'), inputError: q('.pf-input[aria-invalid=true]'), inputDisabled: q('.pf-input[disabled]'), select: q('select.pf-select'),
      checkbox: q('.pf-check input[type=checkbox]'), radio: q('.pf-check input[type=radio]'), table: q('table'), pagination: q('nav.pf-pager'),
      tabs: q('[role=tablist]'), status: q('.pf-chip'), badge: q('.pf-count'), card: q('.pf-card'), kpi: q('.pf-kpi'),
      empty: q('.pf-state:not(.pf-state--error)'), error: q('.pf-state--error'), skeleton: q('.pf-skel'), modal: q('dialog.pf-dialog--modal'), panel: q('dialog.pf-dialog--panel'), banner: q('.pf-banner'),
    };
  });
  const missing = Object.entries(inv).filter(([, n]) => !n).map(([k]) => k);
  rec('AC-03: preview has every R1-pre component and state (buttons ×4 variants, disabled, loading; field error/disabled; select; checkbox/radio; table; pagination; tabs; status/badge; card/KPI; empty/error/skeleton; modal; side panel; banner)', missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') + ' · ' + JSON.stringify(inv) : JSON.stringify(inv));
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
