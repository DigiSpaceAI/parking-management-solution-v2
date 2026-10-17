// 002 R1b QA: console screens F1–F8, F10 per role and site. See lib.mjs for how to run.
// Sections (argv, comma-separated; default all): login,landing,nav,noaccess,ac11,tables,formats,live,predictive,
// a11y,naming,allsites,states,nfr5,demo,sites,employees,switch,overview
import { URL, fx, fx2, MASTER, rec, info, browser, openAs, api, axe, measure, mainText, h1, finish, sleep, stateFor, OUT } from './lib.mjs';

const A = fx.sites.A.id, B = fx.sites.B.id, C = fx2.sites.C.id, D = fx2.sites.D.id;
const U = { admina: fx.users.admina, multiab: fx.users.multiab, atta: fx.users.atta, nosite: fx.users.nosite, uma: fx.users.uma, admind: fx2.users.admind, adminc: fx2.users.adminc };
const E = (k) => U[k].email;
const want = new Set((process.argv[2] || 'login,landing,nav,noaccess,ac11,tables,formats,live,predictive,a11y,naming,allsites,states,nfr5,demo,sites,employees,switch,overview').split(','));
const ENUM = /\b[A-Z]{3,}(?:_[A-Z]{2,})+\b/g; // ON_HOLD, TWO_WHEELER …
const R1 = ['overview', 'live-parking', 'employees'];

// ---------------------------------------------------------------- F3 Login
if (want.has('login')) {
  for (const width of [360, 768, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    const p = await ctx.newPage(); await p.goto(URL + '/'); await p.waitForTimeout(1200);
    const t = await mainText(p);
    const m = await measure(p);
    const v = await axe(p, 'login');
    rec(`F3 Login @${width}: title "ParkFlows · Console", one H1 "Sign in", visible labels, no presets / version pill`, (await p.title()) === 'ParkFlows · Console' && m.h1.join() === 'Sign in' && (await p.locator('label', { hasText: 'Email' }).count()) === 1 && (await p.locator('label', { hasText: 'Password' }).count()) === 1 && !/v\d+\.\d|demo user|preset|Quick sign|Enterprise/i.test(t), `${await p.title()} · h1 ${m.h1} · ${t.slice(0, 160)}`);
    rec(`F3/AC-19 Login @${width}: 0 axe, no h-scroll, text ≥12px, targets OK`, v.length === 0 && m.sw <= m.iw && m.minFont[0] >= 12 && m.small.length === 0, `axe ${v.join(';') || 0} · sw ${m.sw}/${m.iw} · min ${m.minFont} · small ${JSON.stringify(m.small)}`);
    const logos = await p.evaluate(() => [...document.querySelectorAll('img,svg')].filter((e) => /logo|brand/i.test(e.outerHTML.slice(0, 300)) || e.closest('.pf-brand')).length);
    if (width === 1280) {
      rec('F3/AC-21 Login: one logo', logos === 1, `${logos} logo elements`);
      await p.locator('input[autocomplete=username], input[type=email]').first().fill(E('admina'));
      await p.locator('input[type=password]').first().fill('WrongPassword#1');
      await p.getByRole('button', { name: /^Sign in$/ }).click(); await p.waitForTimeout(1500);
      const err = await mainText(p);
      rec('F3 Login: wrong password → "That email and password don\'t match. Check them and try again."', /That email and password don.t match\. Check them and try again\./.test(err), err.slice(0, 200));
      await p.getByText('Forgot password?', { exact: true }).click(); await p.waitForTimeout(500);
      const rt = await mainText(p);
      rec('F3 Login: "Forgot password?" opens the reset form (token + new password, labelled)', /Reset token/.test(rt) && /New password/.test(rt) && (await axe(p)).length === 0, rt.slice(0, 200));
    }
    await ctx.close();
  }
  // lockout / throttle: the server's own message is shown (03 gap 6) — throw-away account qa.nositeatt
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  let msg = '';
  for (let i = 0; i < 18; i++) { // server locks an ip+account after 15 failures (001 policy)
    await p.goto(URL + '/'); await p.waitForSelector('input[type=password]');
    await p.locator('input[autocomplete=username], input[type=email]').first().fill(fx.users.nositeatt.email);
    await p.locator('input[type=password]').first().fill('WrongPassword#' + i);
    await p.getByRole('button', { name: /^Sign in$/ }).click(); await p.waitForTimeout(1200);
    msg = await mainText(p);
    if (!/don.t match/.test(msg)) break;
  }
  rec('F3 Login: lockout / throttle shows the server\'s own message (not the 401 text)', !/don.t match/.test(msg) && /(locked|too many|try again in|attempts)/i.test(msg), msg.slice(0, 220));
  await ctx.close();
}

// ---------------------------------------------------------------- AC-10 landing (+ F2 deep link, Back)
if (want.has('landing')) {
  const cases = [[MASTER, 'sites', 'Sites'], [E('admina'), 'overview', 'Overview'], [E('admind'), 'overview', 'Overview'], [E('multiab'), null, 'Choose a site'], [E('atta'), 'overview', 'Overview'], [E('nosite'), null, 'No site assigned'], [E('uma'), 'users', 'Users & roles']];
  for (const [email, route, title] of cases) {
    const runs = []; let last = '';
    for (let i = 0; i < 5; i++) { // repeated: the landing page is decided by a race between two responses (BUG-R1B-1)
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: await stateFor(email) });
      const p = await ctx.newPage(); await p.goto(URL + '/'); await p.waitForTimeout(5000);
      const H2 = await h1(p); const t = await mainText(p);
      const launch = await p.evaluate(() => new Set([...document.querySelectorAll('main a[href^="#/"]')].map((a) => a.getAttribute('href').split('?')[0])).size);
      const ok = (route ? new globalThis.URL(p.url()).hash === `#/${route}` : true) && (title ? (H2.includes(title) || (title === 'Choose a site' && /Choose a site/.test(t))) : true) && launch < 5;
      runs.push(ok ? 'ok' : `${new globalThis.URL(p.url()).hash || '(no hash)'}:"${H2 || t.slice(0, 20)}"`); last = `launchpad links ${launch} · ${t.slice(0, 100)}`;
      await ctx.close();
    }
    rec(`AC-10 landing ${email.split('@')[0]} → ${route || title} (5 sign-in reloads)`, runs.every((r) => r === 'ok'), `${runs.join(', ')} · ${last}`);
  }
  // view-as a Site Admin (from the Sites panel ⋯ menu) → Overview + Viewing-as bar (AC-25)
  const { ctx, page } = await openAs(MASTER, { hash: 'sites' });
  await page.getByRole('row', { name: /QA Site A/ }).first().click(); await page.waitForTimeout(800);
  const more = page.locator('dialog[open]').getByRole('button', { name: /More actions/ });
  await more.first().click(); await page.waitForTimeout(300);
  const items = await page.locator('[role=menu] [role=menuitem]').allInnerTexts();
  const va = page.locator('[role=menu] [role=menuitem]').filter({ hasText: /View as QA admina/ });
  if (await va.count()) { await va.first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(2500); }
  const bar = await page.evaluate(() => document.body.innerText.match(/Viewing as [^\n]+/)?.[0]);
  rec('AC-10/AC-25 view-as a Site Admin (Sites panel ⋯ → View as) lands on Overview with the "Viewing as … · Exit view" bar', new globalThis.URL(page.url()).hash === '#/overview' && /Viewing as QA admina/.test(bar || '') && (await page.getByRole('button', { name: 'Exit view' }).count()) === 1, `${page.url()} · ${bar} · menu ${items.join('|')}`);
  await page.reload(); await page.waitForTimeout(2500);
  rec('F2 view-as survives reload', /Viewing as QA admina/.test(await page.evaluate(() => document.body.innerText)), await h1(page));
  await page.goto(URL + '/#/sites'); await page.waitForTimeout(1200);
  rec('AC-08 (001 m-5) view-as Site Admin → Sites (Master-only) = No access', (await h1(page)) === 'No access', await h1(page));
  await page.getByRole('button', { name: 'Exit view' }).click(); await page.waitForTimeout(2000);
  rec('F2 Exit view restores the Master (no bar)', !/Viewing as/.test(await page.evaluate(() => document.body.innerText)), page.url());
  await ctx.close();
  // deep link + Back
  const d = await openAs(E('admina'), { hash: 'employees' });
  await d.page.reload(); await d.page.waitForTimeout(1800);
  const h = await h1(d.page);
  await d.page.locator('nav.pf-nav').getByRole('link', { name: /^Live parking/ }).first().click(); await d.page.waitForTimeout(1000);
  await d.page.goBack(); await d.page.waitForTimeout(1000);
  rec('F2 deep link survives reload; Back returns to the previous page; focus on the H1', h === 'Employees & vehicles' && (await h1(d.page)) === 'Employees & vehicles', `${h} → back ${await h1(d.page)}`);
  await d.ctx.close();
}

// ---------------------------------------------------------------- AC-07 nav per role
const navOf = (p) => p.evaluate(() => [...document.querySelectorAll('nav.pf-nav [role=group]')].map((g) => ({ group: g.getAttribute('aria-label'), items: [...g.querySelectorAll('a')].map((a) => ({ label: a.querySelector('.pf-nav-label')?.innerText || a.childNodes[1]?.textContent || a.innerText, text: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), badge: a.querySelector('.pf-count [aria-hidden=true], .pf-nav-badge')?.textContent, sr: a.querySelector('.pf-count .pf-sr-only')?.textContent })) })));
if (want.has('nav')) {
  const expect = {
    [MASTER]: ['Overview', 'Live parking', 'Entry/exit log', 'Alerts', 'Reports', 'Valet', 'Employees & vehicles', 'Users & roles', 'Inventory', 'Sites', 'Billing', 'Audit log', 'Settings', 'Demo requests'],
    [E('admina')]: ['Overview', 'Live parking', 'Entry/exit log', 'Alerts', 'Reports', 'Valet', 'Employees & vehicles', 'Inventory'],
    [E('atta')]: ['Overview', 'Live parking', 'Entry/exit log', 'Alerts', 'Inventory'],
    [E('uma')]: ['Users & roles'],
  };
  for (const [email, labels] of Object.entries(expect)) {
    const { ctx, page } = await openAs(email, { siteId: email === MASTER ? A : undefined });
    await page.waitForTimeout(3000);
    const nav = await navOf(page);
    const got = nav.flatMap((g) => g.items.map((i) => i.text.replace(/\s*\d+\s*\d*.*$/, '').trim()));
    const groups = nav.map((g) => g.group);
    const forbidden = ['ParkFlows Field', 'Employee Smart Pass', 'Predictive', 'InfoSec', 'Launch', 'Home'].filter((x) => got.some((g) => g.includes(x)));
    const badges = nav.flatMap((g) => g.items.filter((i) => i.badge).map((i) => i.badge));
    rec(`AC-07 nav ${email.split('@')[0]}: grouped (Operations/People/Setup), exactly the permitted modules`, JSON.stringify(got) === JSON.stringify(labels) && groups.every((g) => ['Operations', 'People', 'Setup'].includes(g)) && forbidden.length === 0, `got ${JSON.stringify(got)} · groups ${groups} · forbidden ${forbidden}`);
    rec(`AC-07 nav ${email.split('@')[0]}: badges are counts only`, badges.every((b) => /^\d[\d,+]*$/.test(b.trim())), JSON.stringify(badges));
    // label = page title
    const mism = [];
    for (const l of labels) {
      await page.locator('nav.pf-nav a').filter({ hasText: l }).first().click(); await page.waitForTimeout(900);
      const H = await h1(page);
      if (H !== l && !(email === MASTER && H === l)) mism.push(`${l}≠${H}`);
    }
    rec(`AC-07 nav ${email.split('@')[0]}: every module name = its page H1`, mism.length === 0, mism.join(', ') || 'all equal');
    if (email === MASTER) {
      const newCount = (await api(MASTER, 'GET', '/demo-requests?status=NEW')).json.requests.length;
      const fresh = await openAs(MASTER, { hash: 'sites' }); await fresh.page.waitForTimeout(8000);
      const at8 = (await navOf(fresh.page)).flatMap((g) => g.items).find((i) => i.href === '#/demo-requests')?.badge;
      await fresh.page.waitForTimeout(57000);
      const at65 = (await navOf(fresh.page)).flatMap((g) => g.items).find((i) => i.href === '#/demo-requests')?.badge;
      rec('F10 Master nav: Demo requests shows the New count badge (right after load)', Number(at8) === newCount, `after 10 s: ${at8 ?? 'no badge'} · after 65 s: ${at65 ?? 'no badge'} · API New ${newCount}`);
      await fresh.ctx.close();
    }
    await ctx.close();
  }
}

// ---------------------------------------------------------------- AC-08 No access
if (want.has('noaccess')) {
  const cases = [[E('admina'), ['sites', 'billing', 'audit', 'settings', 'demo-requests', 'users', 'design-system', 'nope']], [E('atta'), ['employees', 'reports', 'valet', 'sites', 'demo-requests']], [E('uma'), ['overview', 'live-parking', 'sites', 'demo-requests']]];
  for (const [email, routes] of cases) {
    const { ctx, page, reqs } = await openAs(email);
    const bad = [];
    for (const r of routes) {
      await page.goto(URL + '/#/' + r); await page.waitForTimeout(900);
      const H = await h1(page); const t = await mainText(page);
      const focus = await page.evaluate(() => document.activeElement?.tagName);
      if (H !== 'No access' || !/Go to /.test(t)) bad.push(`${r}:${H}`);
    }
    rec(`AC-08 ${email.split('@')[0]}: typed URLs of non-permitted / unknown pages → standard No access (H1 + "Go to …")`, bad.length === 0, bad.join(', ') || routes.join(', '));
    await ctx.close();
  }
}

// ---------------------------------------------------------------- AC-11
if (want.has('ac11')) {
  const { ctx, page } = await openAs(E('admina'), { hash: 'logs' });
  const lb = await page.evaluate(() => [...document.querySelectorAll('main button')].map((b) => b.innerText.trim()));
  rec('AC-11 Entry/exit log is read-only + export (no entry/exit/mark-exit actions)', !lb.some((b) => /entry|exit|check.?out|mark/i.test(b) && !/export/i.test(b)) && lb.some((b) => /Export/i.test(b)), lb.join(' | ').slice(0, 300));
  await page.goto(URL + '/#/inventory'); await page.waitForTimeout(1500);
  const ib = await page.evaluate(() => [...document.querySelectorAll('main button')].map((b) => b.innerText.trim()));
  rec('AC-11 Inventory has no Mark exit / entry action', !ib.some((b) => /exit|entry/i.test(b)), [...new Set(ib)].join(' | ').slice(0, 300));
  await page.goto(URL + '/#/employees'); await page.waitForTimeout(1500);
  const tabs = await page.locator('[role=tab]').allInnerTexts();
  rec('AC-11 Registration + Approvals = one "Employees & vehicles" page (tabs Requests / Registered / Rejected)', tabs.map((t) => t.replace(/\s*\d+$/, '').trim()).join('|') === 'Requests|Registered|Rejected', tabs.join('|'));
  const refreshBtns = [];
  for (const r of R1) {
    await page.goto(URL + '/#/' + r); await page.waitForTimeout(1500);
    const up = await page.locator('.pf-updated').innerText().catch(() => '');
    const rb = await page.locator('main button').filter({ hasText: /refresh|reload/i }).count();
    if (!/^Updated /.test(up) || rb) refreshBtns.push(`${r}: "${up}" refresh×${rb}`);
  }
  rec('AC-11 one refresh mechanism on R1 screens: "Updated Xs ago", no manual refresh buttons', refreshBtns.length === 0, refreshBtns.join(', ') || 'Overview, Live parking, Employees: Updated …');
  // the auto-refresh actually re-fetches (15 s)
  const n0 = (await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/v1/registrations')).length));
  await page.waitForTimeout(16500);
  const n1 = (await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/v1/registrations')).length));
  rec('AC-11 auto-refresh re-fetches every ~15 s while visible', n1 > n0, `${n0} → ${n1} calls in 16.5 s`);
  await ctx.close();
  const mctx = await openAs(MASTER, { hash: 'sites' });
  const nav = (await navOf(mctx.page)).flatMap((g) => g.items.map((i) => i.text));
  rec('AC-11 "ParkFlows Field" and "Employee Smart Pass" previews gone from admin nav', !nav.some((t) => /Field|Smart Pass/.test(t)), nav.join(' | '));
  await mctx.ctx.close();
}

// ---------------------------------------------------------------- AC-12 tables (R1 screens)
async function tableInfo(page) {
  return page.evaluate(() => {
    const t = [...document.querySelectorAll('main table')].find((x) => x.getBoundingClientRect().height > 0);
    if (!t) return null;
    const ths = [...t.querySelectorAll('thead th')].filter((th) => th.getBoundingClientRect().width > 0);
    const data = ths.filter((th) => th.innerText.trim() && !th.querySelector('input[type=checkbox]'));
    return { cols: data.map((th) => th.innerText.trim()), rows: t.querySelectorAll('tbody tr').length, pager: document.querySelector('.pf-pagination, nav[aria-label*="agination" i], .pf-pager')?.innerText.replace(/\s+/g, ' ') || '', sizes: [...document.querySelectorAll('main select')].map((s) => [...s.options].map((o) => o.text).join('/')).filter((x) => /\b25\b/.test(x)) };
  });
}
if (want.has('tables')) {
  const cases = [[E('admina'), 'employees', null, 'Requests'], [E('admina'), 'employees', null, 'Registered'], [MASTER, 'sites', null, null], [MASTER, 'demo-requests', null, null], [MASTER, 'employees', A, 'Registered']];
  for (const [email, route, site, tab] of cases) {
    const { ctx, page } = await openAs(email, { hash: route, siteId: site });
    if (tab) { await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click(); await page.waitForTimeout(1200); }
    const t = await tableInfo(page);
    const big = route === 'employees';
    const ok = t && t.cols.length <= 7 && t.rows <= 50 && (!big || (t.rows === 25 && /Showing 1–25 of/.test(t.pager)));
    rec(`AC-12 ${route}${tab ? '/' + tab : ''} (${email.split('@')[0]}): ≤7 default columns, ≤50 rows, pages at 25`, ok, JSON.stringify(t));
    if (big && t?.sizes) {
      rec(`AC-12 ${route}/${tab}: rows-per-page offers 25 / 50`, t.sizes.some((s) => /25/.test(s) && /50/.test(s)), JSON.stringify(t.sizes));
    }
    // row click → detail panel
    const row = page.locator('main table tbody tr').first();
    await row.click({ position: { x: 120, y: 12 } }); await page.waitForTimeout(800);
    const panel = await page.evaluate(() => { const d = document.querySelector('dialog[open]'); return d ? (d.querySelector('h2')?.innerText || d.innerText.slice(0, 60)) : null; });
    rec(`AC-12 ${route}${tab ? '/' + tab : ''}: clicking a row opens a detail panel`, !!panel, panel);
    if (panel) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    await ctx.close();
  }
}

// ---------------------------------------------------------------- AC-13 formats on R1 screens
if (want.has('formats')) {
  const pages = [[E('admina'), 'overview', null], [E('admina'), 'live-parking', null], [E('admina'), 'employees', null], [MASTER, 'sites', null], [MASTER, 'demo-requests', null], [E('admind'), 'live-parking', null]];
  for (const [email, route, site] of pages) {
    const { ctx, page } = await openAs(email, { hash: route, siteId: site });
    const t = await mainText(page);
    const enums = [...new Set(t.match(ENUM) || [])];
    const iso = t.match(/\d{4}-\d{2}-\d{2}(T|\s\d)/g) || [];
    const ampm = t.match(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/gi) || [];
    const dates = [...new Set(t.match(/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/g) || [])];
    const raw = t.match(/\b\d{3,} ?mins?\b|INR ?\d/g) || [];
    rec(`AC-13 ${route} (${email.split('@')[0]}): no enum codes, ISO dates, AM/PM times, raw minutes or "INR"`, !enums.length && !iso.length && !ampm.length && !raw.length, `enums ${enums} · iso ${iso.slice(0, 2)} · ampm ${ampm.slice(0, 2)} · raw ${raw} · dates ${dates.slice(0, 3)}`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------- AC-14 Live parking on a 1,080-slot site (F5)
if (want.has('live')) {
  const { ctx, page, reqs } = await openAs(E('admind'), { hash: 'live-parking', width: 1440, height: 1000 });
  const t = await mainText(page);
  const cards = await page.locator('main article.pf-slot').count();
  const levels = await page.evaluate(() => [...document.querySelectorAll('main .pf-level-btn')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  rec('AC-14 1,080-slot site: 20 cards by default, one pager "Showing 1–20 of …"', cards === 20 && (t.match(/Showing 1–20 of [\d,]+/g) || []).length === 1, `cards ${cards} · ${t.match(/Showing [^A-Z]+/g)}`);
  rec('AC-14 level buttons with free/total', levels.length >= 4 && levels.every((l) => /\d[\d,]* free \/ [\d,]+/.test(l)), levels.join(' | '));
  const sel = page.locator('main select').filter({ has: page.locator('option', { hasText: /^36$/ }) });
  const opts = await sel.first().locator('option').allInnerTexts().catch(() => []);
  rec('AC-14 page size 12 / 20 / 36 / 60 (default 20)', opts.join('/') === '12/20/36/60' && (await sel.first().inputValue()) === '20', opts.join('/'));
  for (const n of ['12', '36', '60']) {
    await sel.first().selectOption(n); await page.waitForTimeout(500);
    const c = await page.locator('main article.pf-slot').count();
    if (c !== Number(n)) rec(`AC-14 page size ${n} shows ${n} cards`, false, `${c}`);
  }
  await sel.first().selectOption('20'); await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Next page/ }).click(); await page.waitForTimeout(400);
  const p2 = (await mainText(page)).match(/Showing [\d,]+–[\d,]+ of [\d,]+/)?.[0];
  await page.getByLabel(/Search/).first().fill('B1-0'); await page.waitForTimeout(700);
  const af = (await mainText(page)).match(/Showing [\d,]+–[\d,]+ of [\d,]+/)?.[0];
  rec('AC-14 next page then a filter change returns to page 1', /Showing 21–40/.test(p2 || '') && /Showing 1–/.test(af || ''), `${p2} → after search ${af}`);
  await page.getByLabel(/Search/).first().fill(''); await page.waitForTimeout(500);
  // card → modal; Esc and outside click close; PLC line honest
  await page.locator('main article.pf-slot .pf-slot-hit').first().click(); await page.waitForTimeout(600);
  const modal = await page.evaluate(() => document.querySelector('dialog[open]')?.innerText.replace(/\s+/g, ' ') || '');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const escClosed = !(await page.locator('dialog[open]').count());
  await page.locator('main article.pf-slot .pf-slot-hit').nth(1).click(); await page.waitForTimeout(600);
  await page.mouse.click(5, 5); await page.waitForTimeout(400);
  const outClosed = !(await page.locator('dialog[open]').count());
  rec('AC-14 card opens the slot modal; Esc closes; outside click closes', modal.length > 0 && escClosed && outClosed, `esc ${escClosed} · outside ${outClosed} · ${modal.slice(0, 160)}`);
  rec('AC-04/AC-06 slot modal: "Stacker controller (PLC) — not connected", no fabricated PLC/lock/sensor/camera values', /PLC\)?\s*—?\s*not connected/i.test(modal) && !/PLC OPERATIONAL|Lock: OK|Hydraulic Lift Ready|Safety Sensor|CLEAR|G-ANPR-CAM01|FPS/i.test(modal), modal.slice(0, 300));
  // Cards | List remembered after reload
  await page.getByRole('radio', { name: 'List' }).click(); await page.waitForTimeout(500);
  const listRows = await page.locator('main table tbody tr, main .pf-slot-row').count();
  await page.reload(); await page.waitForTimeout(2000);
  const stillList = await page.getByRole('radio', { name: 'List' }).getAttribute('aria-checked');
  rec('AC-14 Cards/List switch, List remembered after reload', listRows > 0 && stillList === 'true', `list rows ${listRows} · after reload aria-checked=${stillList}`);
  await page.getByRole('radio', { name: 'Cards' }).click(); await page.waitForTimeout(300);
  // Puzzle wise view: 6 stackers per page, top level first
  await page.getByRole('tab', { name: /Puzzle wise status/ }).click().catch(async () => page.getByRole('radio', { name: /Puzzle wise status/ }).click());
  await page.waitForTimeout(800);
  const pz = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('main .pf-puzzle')].filter((g) => g.getBoundingClientRect().height > 0);
    return { groups: groups.length, first: groups[0]?.innerText.replace(/\s+/g, ' ').slice(0, 200), levels: groups[0] ? [...groups[0].innerText.matchAll(/Level (\d+)/g)].map((m) => +m[1]) : [] };
  });
  const pzText = await mainText(page);
  rec('AC-14 Puzzle wise status: 6 stackers per page, top level first', pz.groups === 6 && pz.levels.length >= 2 && pz.levels.every((v, i, a) => i === 0 || a[i - 1] >= v), `${JSON.stringify(pz)} · ${(pzText.match(/Showing [^A-Z]+/) || [''])[0]}`);
  // the table/cards never render hundreds at once
  const dom = await page.evaluate(() => document.querySelectorAll('main article.pf-slot').length);
  rec('AC-12/AC-14 never hundreds of slots rendered at once (1,080-slot site)', dom <= 60, `${dom} slot cards in the DOM`);
  await ctx.close();
}

// ---------------------------------------------------------------- AC-06 predictive
if (want.has('predictive')) {
  const { ctx, page } = await openAs(E('admina'), { hash: 'reports' });
  const link = page.locator('main a, main button').filter({ hasText: /Predictive analytics/ });
  const reach = await link.count();
  await page.goto(URL + '/#/predictive'); await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const t = document.querySelector('main').innerText;
    const charts = [...document.querySelectorAll('main svg, main canvas, main .recharts-wrapper')].filter((e) => e.getBoundingClientRect().height > 60);
    const unlabeled = charts.filter((c) => { let n = c; for (let i = 0; i < 6 && n; i++) { if (/sample data/i.test(n.innerText || n.textContent || '')) return false; n = n.parentElement; } return true; }).length;
    return { banner: /Sample data — not live/.test(t), count: (t.match(/sample data/gi) || []).length, charts: charts.length, unlabeled, lstm: /LSTM|neural|AI model accuracy/i.test(t) };
  });
  rec('AC-06 Predictive analytics stays (reachable from Reports), "Sample data — not live" on the page and on every chart, no LSTM copy', reach > 0 && r.banner && r.unlabeled === 0 && !r.lstm, `link ${reach} · ${JSON.stringify(r)}`);
  await ctx.close();
}

// ---------------------------------------------------------------- AC-19 + NFR-4 per R1 screen and width
if (want.has('a11y')) {
  const screens = [[E('admina'), 'overview', null], [E('admina'), 'live-parking', null], [E('admina'), 'employees', null], [MASTER, 'sites', null], [MASTER, 'demo-requests', null], [E('adminc'), 'overview', null], [E('adminc'), 'employees', null]];
  for (const width of [360, 768, 1280]) {
    for (const [email, route] of screens) {
      const { ctx, page } = await openAs(email, { hash: route, width, touch: width <= 768 });
      const v = await axe(page); const m = await measure(page);
      rec(`AC-19 ${route} (${email.split('@')[0]}) @${width}${width <= 768 ? ' touch' : ''}: 0 axe, no h-scroll, text ≥12px, body ≥14px, targets ≥${width <= 768 ? 44 : 24}px`,
        v.length === 0 && m.sw <= m.iw && m.minFont[0] >= 12 && m.small.length === 0 && m.smallBody === 0, `axe ${v.join('; ') || 0} · sw ${m.sw}/${m.iw} · min ${m.minFont} · small ${JSON.stringify(m.small.slice(0, 4))} · body<14 ${m.smallBody}`);
      if (width === 1280 && route === 'employees' && email === E('admina')) {
        // keyboard: every tab stop has a visible focus ring
        const noRing = []; const seen = new Set(); let first = null;
        for (let i = 0; i < 120; i++) {
          await page.keyboard.press('Tab');
          const f = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const k = (e.getAttribute('aria-label') || e.innerText || e.tagName).trim().slice(0, 30) + '@' + Math.round(e.getBoundingClientRect().top);
            const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' || (e.matches('input[type=checkbox]') && getComputedStyle(e.nextElementSibling || e).boxShadow !== 'none'); return { k, ring }; });
          if (!f) continue; if (first === null) first = f.k; else if (f.k === first) break; if (seen.has(f.k)) continue; seen.add(f.k); if (!f.ring) noRing.push(f.k);
        }
        rec('AC-19 Employees: every control keyboard-reachable with a visible focus ring', seen.size > 15 && noRing.length === 0, `${seen.size} stops · no ring: ${noRing.slice(0, 6).join(' | ')}`);
      }
      if (width === 360 && route === 'overview' && email === E('admina')) {
        const menu = page.getByRole('button', { name: 'Menu' }); const sw = page.locator('[aria-haspopup=listbox]');
        rec('AC-18/F1 at 360: Menu button opens the drawer; site switcher reachable', (await menu.count()) === 1 && (await sw.count()) >= 0, `menu ${await menu.count()} · switcher ${await sw.count()}`);
      }
      await ctx.close();
    }
  }
}

// ---------------------------------------------------------------- AC-21 naming
if (want.has('naming')) {
  const bad = [];
  for (const [email, routes, site] of [[MASTER, ['sites', 'billing', 'audit', 'settings', 'demo-requests', 'users', 'overview', 'live-parking', 'logs', 'alerts', 'reports', 'predictive', 'valet', 'employees', 'inventory'], A]]) {
    const { ctx, page } = await openAs(email, { siteId: site });
    for (const r of routes) {
      await page.goto(URL + '/#/' + r); await page.waitForTimeout(1500);
      const t = await page.evaluate(() => document.body.innerText + ' ' + document.title);
      const hits = t.match(/ParkFlow(?!s)|ParkOrbit|Park Orbit/g);
      if (hits) bad.push(`${r}: ${hits.join(',')}`);
      const logos = await page.evaluate(() => [...document.querySelectorAll('img[src*="logo"], img[src*="brand"], .pf-brand img, .pf-brand svg')].map((i) => (i.getAttribute('src') || 'svg').split('/').pop().replace(/-[\w]+\.svg$/, '')));
      if (new Set(logos).size > 1) bad.push(`${r}: logos ${logos}`);
    }
    rec('AC-21 every console page (Master, 15 pages): "ParkFlow"/"ParkOrbit" 0 times, title "ParkFlows · Console", one logo', bad.length === 0 && (await page.title()) === 'ParkFlows · Console', bad.join(' | ') || 'clean');
    await ctx.close();
  }
}

// ---------------------------------------------------------------- AC-24 All sites
if (want.has('allsites')) {
  const pages = ['employees', 'logs', 'alerts', 'inventory', 'valet', 'reports', 'overview', 'live-parking'];
  const { ctx, page, reqs } = await openAs(MASTER, { siteId: 'ALL', hash: 'employees' });
  const siteNames = (await api(MASTER, 'GET', '/sites/summary')).json.flatMap((s) => [s.siteName, s.siteCode]);
  await page.evaluate((n) => { window.__siteNames = n; }, siteNames);
  const out = [];
  for (const r of pages) {
    await page.goto(URL + '/#/' + r); await page.waitForTimeout(1800);
    await page.evaluate((n) => { window.__siteNames = n; }, siteNames);
    const st = await page.evaluate(() => {
      const t = document.querySelector('main').innerText;
      const guarded = [...document.querySelectorAll('main [data-write-guard]')];
      const enabledGuarded = guarded.filter((b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true').length;
      const rows = [...document.querySelectorAll('main table tbody tr')].slice(0, 30);
      const hasSite = (tr) => !!tr.querySelector('.pf-site-tag') || /SITE-DEFAULT/.test(tr.innerText) || window.__siteNames.some((n) => n && tr.innerText.includes(n)); // legacy demo rows carry siteId site-default, shown as its code
      const rowsWithSite = rows.filter(hasSite).length;
      const noSite = rows.filter((tr) => !hasSite(tr)).map((tr) => tr.innerText.replace(/\s+/g, ' ').slice(0, 60));
      return { banner: /viewing all sites|Select one site|Choose a site/i.test(t), guarded: guarded.length, enabledGuarded, rows: rows.length, rowsWithSite, title: guarded[0]?.getAttribute('title'), noSite: noSite.slice(0, 2) };
    });
    out.push([r, st]);
  }
  const bad = out.filter(([r, s]) => s.enabledGuarded > 0 || (s.rows > 0 && s.rowsWithSite < s.rows) || !s.banner);
  rec('AC-24 Master "All sites": each list row shows its site; write actions disabled with a "Choose a site" prompt', bad.length === 0, (bad.length ? 'BAD ' + bad.map(([r, s]) => `${r}:${JSON.stringify(s)}`).join(' ') : '') + ' · all: ' + out.map(([r, s]) => `${r} ${s.rowsWithSite}/${s.rows} guarded ${s.guarded} enabled ${s.enabledGuarded} banner ${s.banner}`).join('; '));
  // unguarded sweep: click every enabled main button, confirm in any dialog; count non-GET calls
  const before = reqs.filter((x) => x.m !== 'GET').length;
  page.on('dialog', (d) => d.accept().catch(() => {})); // native confirm() → accept, to see whether a write would follow
  const t0 = Date.now();
  for (const r of ['employees', 'inventory', 'alerts', 'valet']) {
    if (Date.now() - t0 > 150000) break;
    await page.goto(URL + '/#/' + r); await page.waitForTimeout(1500);
    const n = await page.locator('main button:not([disabled])').count();
    for (let i = 0; i < Math.min(n, 25); i++) {
      if (Date.now() - t0 > 150000) break;
      const b = page.locator('main button:not([disabled])').nth(i);
      if (/QA |Tech Park|Cyber|BKC|All sites/.test(await b.innerText({ timeout: 1000 }).catch(() => ''))) continue; // don't pick a site
      if (!(await b.isVisible().catch(() => false))) continue;
      const label = (await b.innerText({ timeout: 1000 }).catch(() => '')).trim().slice(0, 30);
      const n0 = reqs.length;
      await b.click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(150);
      for (const w of reqs.slice(n0)) if (w.m !== 'GET') w.button = `${r}: "${label}"`;
      const d = page.locator('dialog[open] button.pf-btn--primary:not([disabled]), dialog[open] button.pf-btn--destructive:not([disabled])');
      if (await d.count()) await d.first().click({ timeout: 1000 }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  const writes = reqs.filter((x) => x.m !== 'GET').slice(before).filter((x) => !/auth|demo-requests\?/.test(x.u));
  const chip = await page.locator('header [aria-haspopup=listbox]').first().getAttribute('aria-label').catch(() => '');
  rec('AC-24 "All sites" click sweep: 0 non-GET requests attempted while "All sites" is selected', writes.filter((w) => !w.site || w.site === 'ALL').length === 0, (writes.map((w) => `${w.m} ${w.u} [x-site-id ${w.site}] after ${w.button || '?'}`).join(', ') || 'none') + ` · chip at end: ${chip}`);
  await ctx.close();
}

// ---------------------------------------------------------------- AC-27 + AC-05 states
if (want.has('states')) {
  // loading skeleton
  const s = await openAs(E('admina'), { hash: 'overview', latency: 2500 });
  await s.page.goto(URL + '/#/employees'); await s.page.waitForTimeout(600);
  const sk = await s.page.evaluate(() => document.querySelectorAll('main .pf-skel, main [aria-busy=true]').length);
  rec('AC-27 loading: standard skeleton while a list loads', sk > 0, `${sk} skeleton/aria-busy nodes`);
  await s.ctx.close();
  // empty states with reason + next step (site C: no requests, no employees, no logs)
  const c = await openAs(E('adminc'), { hash: 'overview' });
  const ov = await mainText(c.page);
  rec('AC-05 Overview on a new site: "—" + one-line reason, never 0 shown as a real count', /—/.test(ov) && /No vehicles logged today|No entries yet|no history|No data yet/i.test(ov), ov.slice(0, 400));
  await c.page.goto(URL + '/#/employees'); await c.page.waitForTimeout(1800);
  const em = await c.page.evaluate(() => { const s = document.querySelector('main .pf-state'); return s ? s.innerText.replace(/\s+/g, ' ') : ''; });
  info('AC-27 Employees/Requests on a new site (copy as UX 02 S4: reason only; "Add employee" is the page action)', em);
  await c.page.getByRole('tab', { name: /^Registered/ }).click(); await c.page.waitForTimeout(1000);
  const em2 = await c.page.evaluate(() => { const s = document.querySelector('main .pf-state'); return s ? s.innerText.replace(/\s+/g, ' ') : ''; });
  const em2Btn = await c.page.locator('main .pf-state a, main .pf-state button').count();
  rec('AC-27 empty: standard empty state with reason + next step (Employees/Registered on a new site)', em2.length > 0 && em2Btn > 0, `${em2} · actions ${em2Btn}`);
  await c.page.goto(URL + '/#/live-parking'); await c.page.waitForTimeout(1800);
  await c.page.getByLabel(/Search/).first().fill('ZZZ-NOPE'); await c.page.waitForTimeout(600);
  const em3 = await c.page.evaluate(() => { const s = document.querySelector('main .pf-state'); return s ? s.innerText.replace(/\s+/g, ' ') : ''; });
  rec('AC-27 empty: Live parking no-match → "No slots match these filters" + Clear filters', /No slots match these filters/.test(em3) && /Clear filters/.test(em3), em3);
  await c.ctx.close();
  // error state: server error → plain message + Retry, never "Offline"
  for (const [route, api] of [['overview', '/api/v1/overview'], ['live-parking', '/api/v1/slots'], ['employees', '/api/v1/registrations']]) {
    const e = await openAs(E('admina'), { hash: 'sites' });
    await e.page.route(`**${api}*`, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false,"message":"boom"}' }));
    await e.page.goto(URL + '/#/' + route); await e.page.waitForTimeout(2200);
    const st = await e.page.evaluate(() => { const s = document.querySelector('main .pf-state--error'); return s ? s.innerText.replace(/\s+/g, ' ') : ''; });
    const retry = await e.page.locator('main .pf-state--error button').filter({ hasText: /Try again|Retry/ }).count();
    rec(`AC-27 error on ${route}: error state with plain message + Try again; not "Offline"`, st && retry && !/offline/i.test(st), st);
    if (route === 'overview') {
      await e.page.unroute(`**${api}*`); await e.page.locator('main .pf-state--error button').first().click(); await e.page.waitForTimeout(1500);
      rec('AC-27 Try again reloads the data', !(await e.page.locator('main .pf-state--error').count()), await h1(e.page));
    }
    await e.ctx.close();
  }
  // real offline → "You're offline"
  const o = await openAs(E('admina'), { hash: 'overview' });
  await o.ctx.setOffline(true); await o.page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await o.page.waitForTimeout(17000);
  const ot = await mainText(o.page);
  rec('AC-27 "You\'re offline" only for real loss of network', /offline/i.test(ot), (ot.match(/[^.]*offline[^.]*/i) || [''])[0].slice(0, 160));
  await o.ctx.close();
}

// ---------------------------------------------------------------- NFR-5 tables by width
if (want.has('nfr5')) {
  for (const [email, route, site, tab] of [[MASTER, 'sites', null, null], [E('admina'), 'employees', null, 'Registered'], [MASTER, 'demo-requests', null, null]]) {
    const res = {};
    for (const width of [1280, 1024, 768, 360]) {
      const { ctx, page } = await openAs(email, { hash: route, width, siteId: site });
      if (tab) { await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click(); await page.waitForTimeout(1000); }
      res[width] = await page.evaluate(() => {
        const t = [...document.querySelectorAll('main table')].find((x) => x.getBoundingClientRect().height > 0);
        const wrap = t?.closest('.pf-table-wrap') || t?.parentElement;
        const cards = [...document.querySelectorAll('main .pf-table-cards')].filter((x) => x.getBoundingClientRect().height > 0).length;
        return { cols: t ? [...t.querySelectorAll('thead th')].filter((th) => th.getBoundingClientRect().width > 0 && th.innerText.trim()).length : 0, sideScroll: wrap ? wrap.scrollWidth - wrap.clientWidth : 0, cards, pageSW: document.documentElement.scrollWidth - innerWidth };
      });
      await ctx.close();
    }
    const ok = res[1280].cols >= res[1024].cols && res[1024].cols >= res[768].cols && res[1280].cols > res[768].cols && res[360].cards > 0 && res[360].cols === 0 && [1280, 1024, 768].every((w) => res[w].sideScroll <= 1) && Object.values(res).every((r) => r.pageSW <= 0);
    rec(`NFR-5 ${route}${tab ? '/' + tab : ''}: full set ≥1280, priority set 768–1279, cards <768, no sideways scroll`, ok, JSON.stringify(res));
  }
}

// ---------------------------------------------------------------- F10 Demo requests (AC-32d console)
if (want.has('demo')) {
  // a second Master for "view-as another Master" (Delete must be disabled there)
  let m2 = (await api(MASTER, 'GET', '/rbac/users')).json; m2 = (m2.users || m2).find((u) => u.email === 'qa.master2@qa-parkflows.test');
  if (!m2) m2 = (await api(MASTER, 'POST', '/rbac/users', { body: { username: 'qa.master2', fullName: 'QA Master Two', email: 'qa.master2@qa-parkflows.test', roleId: 'role-master-admin', siteScopeType: 'ALL_SITES', assignedSiteIds: [], status: 'ACTIVE', plainPassword: 'QaTestPassword#2026' } })).json.user;
  const { ctx, page, reqs } = await openAs(MASTER, { hash: 'demo-requests' });
  const before = (await api(MASTER, 'GET', '/demo-requests')).json.requests;
  const rows = await page.locator('main table tbody tr').count();
  const t = await mainText(page);
  rec('F10 Demo requests: Master sees every stored request in the table (7 columns)', rows === before.length && (await tableInfo(page)).cols.length === 7, `${rows} rows vs API ${before.length}`);
  const target = before.find((r) => r.name === 'Neha Iyer') || before[0];
  await page.getByRole('row', { name: new RegExp(target.name) }).first().click(); await page.waitForTimeout(700);
  const panel = await page.evaluate(() => document.querySelector('dialog[open]')?.innerText.replace(/\s+/g, ' ') || '');
  rec('F10 row → side panel with every field (name, company, email, phone, city, facility, consent date) and plain-text message', panel.includes(target.name) && panel.includes(target.company) && panel.includes(target.workEmail) && /\+91/.test(panel), panel.slice(0, 260));
  // status change with a note
  await page.locator('dialog[open]').getByLabel(/Contacted/).check().catch(async () => page.locator('dialog[open]').getByText('Contacted', { exact: true }).click());
  await page.locator('dialog[open]').getByLabel('Note').fill('Called on Tuesday');
  await page.locator('dialog[open]').getByRole('button', { name: /^Save/ }).click(); await page.waitForTimeout(1200);
  const after = (await api(MASTER, 'GET', '/demo-requests')).json.requests.find((r) => r.id === target.id);
  rec('F10 status → Contacted with a note (saved on the server)', after?.status === 'CONTACTED' && after?.note === 'Called on Tuesday', JSON.stringify({ status: after?.status, note: after?.note }));
  // Delete: ⋯ → confirm modal → Delete
  const dlg = page.locator('dialog[open]');
  if (!(await dlg.count())) { await page.getByRole('row', { name: new RegExp(target.name) }).first().click(); await page.waitForTimeout(600); }
  await page.locator('dialog[open]').getByRole('button', { name: /More actions/ }).click(); await page.waitForTimeout(300);
  await page.getByRole('menuitem', { name: 'Delete request' }).click(); await page.waitForTimeout(500);
  const conf = await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map((d) => d.innerText.replace(/\s+/g, ' ')).join(' || '));
  rec('F10 Delete asks first: "Delete this request? This permanently removes {name}\'s details from ParkFlows…" with Delete / Cancel', /Delete this request\?/.test(conf) && conf.includes(`permanently removes ${target.name}`) && /Cancel/.test(conf), conf.slice(0, 300));
  const delBtn = page.locator('dialog[open]').filter({ hasText: 'Delete this request?' }).getByRole('button', { name: /^Delete$/ });
  await delBtn.click(); await page.waitForTimeout(1500);
  const toast = await page.evaluate(() => [...document.querySelectorAll('.pf-toast')].map((x) => x.innerText).join(' | '));
  const rows2 = await page.locator('main table tbody tr').count();
  const apiAfter = (await api(MASTER, 'GET', '/demo-requests')).json.requests;
  const delReq = reqs.find((r) => r.m === 'DELETE');
  rec('F10 Delete: panel closes, row leaves the table, toast "Request deleted", record gone on the server', !(await page.locator('dialog[open]').count()) && rows2 === rows - 1 && /Request deleted/.test(toast) && !apiAfter.some((r) => r.id === target.id) && !!delReq, `toast "${toast}" · rows ${rows}→${rows2} · ${delReq?.m} ${delReq?.u}`);
  // export
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.getByRole('button', { name: /Export CSV/ }).click()]);
  rec('F10 Export CSV downloads a file', !!dl, dl ? dl.suggestedFilename() : 'no download');
  await ctx.close();
  // view-as another Master: page visible, Delete + Save disabled
  const v = await openAs(MASTER, { viewAsId: m2.id, hash: 'demo-requests' });
  await v.page.locator('main table tbody tr').first().click(); await v.page.waitForTimeout(600);
  const saveDisabled = await v.page.locator('dialog[open]').getByRole('button', { name: /^Save/ }).isDisabled().catch(() => null);
  await v.page.locator('dialog[open]').getByRole('button', { name: /More actions/ }).click().catch(() => {}); await v.page.waitForTimeout(300);
  const delItem = v.page.getByRole('menuitem', { name: 'Delete request' });
  const delDisabled = (await delItem.count()) ? ((await delItem.isDisabled()) || (await delItem.getAttribute('aria-disabled')) === 'true') : null;
  rec('F10 view-as (another Master): Delete request and Save are disabled', delDisabled === true && saveDisabled === true, `delete disabled ${delDisabled} · save disabled ${saveDisabled}`);
  await v.ctx.close();
  // Site Admin: no nav item, No access
  const sa = await openAs(E('admina'), { hash: 'demo-requests' });
  const nav = (await navOf(sa.page)).flatMap((g) => g.items.map((i) => i.href));
  rec('F10 Site Admin: no "Demo requests" nav item; the route shows No access; no /demo-requests call', !nav.includes('#/demo-requests') && (await h1(sa.page)) === 'No access' && !sa.reqs.some((r) => r.u.includes('/demo-requests')), `${await h1(sa.page)} · calls ${sa.reqs.filter((r) => r.u.includes('demo')).length}`);
  await sa.ctx.close();
}

// ---------------------------------------------------------------- F7 Sites
if (want.has('sites')) {
  const { ctx, page } = await openAs(MASTER, { hash: 'sites' });
  const t = await tableInfo(page);
  const api0 = (await api(MASTER, 'GET', '/sites/summary')).json;
  rec('F7 Sites table from /sites/summary: one row per site, ≤7 columns', t.rows === api0.length && t.cols.length <= 7, `${t.rows} rows vs ${api0.length} · ${t.cols.join('|')}`);
  await page.getByRole('row', { name: /QA Site C/ }).first().click(); await page.waitForTimeout(800);
  const panel = await page.evaluate(() => document.querySelector('dialog[open]')?.innerText.replace(/\s+/g, ' ') || '');
  rec('F7 site panel shows details; no fabricated contact values (03 gap 8)', panel.includes('QA Site C') && !/Site Facility Manager|admin@qac\.com|9800000000|Parking Complex/.test(panel), panel.slice(0, 300));
  // Edit site with server field errors
  const edit = page.locator('dialog[open]').getByRole('button', { name: /Edit site/ });
  if (await edit.count()) {
    await edit.click(); await page.waitForTimeout(500);
    const em = page.locator('dialog[open]').getByLabel(/Contact email/i);
    await em.fill('not-an-email'); await page.locator('dialog[open]').getByRole('button', { name: /^Save/ }).click(); await page.waitForTimeout(900);
    const errs = await page.evaluate(() => [...document.querySelectorAll('dialog[open] .pf-field-error')].map((e) => e.innerText).join(' | '));
    await em.fill('ops@qa-c.in'); await page.locator('dialog[open]').getByRole('button', { name: /^Save/ }).click(); await page.waitForTimeout(1200);
    const after = (await api(MASTER, 'GET', '/sites')).json; const c = (after.sites || after).find((s) => s.id === C);
    rec('F7 Edit site: server field errors shown under the field; a valid edit saves', errs.length > 0 && c?.contactEmail === 'ops@qa-c.in', `errors "${errs}" · saved ${c?.contactEmail}`);
  } else rec('F7 Edit site action present', false, 'no Edit site button');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // status change needs a reason for On hold
  await page.getByRole('row', { name: /QA Site C/ }).first().click(); await page.waitForTimeout(700);
  const cs = page.locator('dialog[open]').getByRole('button', { name: /Change status/ });
  if (await cs.count()) {
    await cs.click(); await page.waitForTimeout(400);
    await page.locator('dialog[open]').last().getByLabel(/On hold/).check();
    await page.locator('dialog[open]').last().getByRole('button', { name: 'Save status' }).click(); await page.waitForTimeout(600);
    const e = await page.evaluate(() => [...document.querySelectorAll('dialog[open] .pf-field-error, dialog[open] [role=alert]')].map((x) => x.innerText).join(' | '));
    const st = (await api(MASTER, 'GET', '/sites/summary')).json.find((x) => x.id === C)?.status;
    rec('F7 On hold requires a reason (nothing sent, site stays Active)', /reason/i.test(e) && st === 'ACTIVE', `${e} · server ${st}`);
  } else rec('F7 Change status action present', false, 'none');
  await ctx.close();
  // Site Admin / view-as: Sites = No access
  const sa = await openAs(E('multiab'), { siteId: A, hash: 'sites' }); // with a site chosen (no site → BUG-R1B-2 family)
  rec('F7 multi-site Site Admin: Sites = No access, no /sites/summary call', (await h1(sa.page)) === 'No access' && !sa.reqs.some((r) => r.u.includes('/sites/summary')), await h1(sa.page));
  await sa.ctx.close();
}

// ---------------------------------------------------------------- F6 Employees & vehicles
if (want.has('employees')) {
  const { ctx, page, reqs } = await openAs(E('admina'), { hash: 'employees' });
  const p0 = (await api(E('admina'), 'GET', '/registrations', { site: A })).json.pendingCount;
  const row = page.locator('main table tbody tr').first();
  const name = (await row.innerText()).split('\n')[0];
  await row.getByRole('button', { name: 'Approve' }).click(); await page.waitForTimeout(1500);
  const toast = await page.evaluate(() => [...document.querySelectorAll('.pf-toast')].map((x) => x.innerText).join(' | '));
  const p1 = (await api(E('admina'), 'GET', '/registrations', { site: A })).json.pendingCount;
  rec('F6 approve one request → toast "1 request approved", pending −1 on the server', /1 request approved/.test(toast) && p1 === p0 - 1, `toast "${toast}" · pending ${p0}→${p1}`);
  // bulk reject requires a reason
  const boxes = page.locator('main table tbody input[type=checkbox]');
  await boxes.nth(0).check({ force: true }); await boxes.nth(1).check({ force: true });
  await page.locator('.pf-bulkbar, main').getByRole('button', { name: /^Reject/ }).first().click(); await page.waitForTimeout(400);
  await page.locator('dialog[open]').getByRole('button', { name: /^Reject/ }).click(); await page.waitForTimeout(400);
  const err = await page.evaluate(() => document.querySelector('dialog[open]')?.innerText || '');
  rec('F6 bulk reject requires a reason ("Choose a reason. The employee needs to know why.")', /Choose a reason\. The employee needs to know why\./.test(err), err.replace(/\s+/g, ' ').slice(0, 200));
  await page.keyboard.press('Escape');
  // Add employee panel
  await page.getByRole('button', { name: 'Add employee' }).click(); await page.waitForTimeout(500);
  rec('F6 Add employee opens a side panel with labelled fields', /Name|Vehicle/.test(await page.evaluate(() => document.querySelector('dialog[open]')?.innerText || '')), '');
  await ctx.close();
  // site isolation: Site Admin A never sees B markers on Employees (any tab)
  const iso = await openAs(E('admina'), { hash: 'employees' });
  let leak = '';
  for (const tab of ['Requests', 'Registered', 'Rejected']) {
    await iso.page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click(); await iso.page.waitForTimeout(900);
    const t = await mainText(iso.page); if (/MH14QB|MH01QD/.test(t)) leak += tab;
  }
  rec('AC-23 Site Admin A: Employees tabs show no Site B/D data', !leak, leak || 'none');
  await iso.ctx.close();
}

// ---------------------------------------------------------------- site switching per site (multi-site admin)
if (want.has('switch')) {
  const { ctx, page } = await openAs(E('multiab'), { hash: 'overview', siteId: A, latency: 800 });
  const res = [];
  for (const r of ['overview', 'live-parking', 'employees']) {
    await page.goto(URL + '/#/' + r); await page.waitForTimeout(2500);
    const a = await mainText(page);
    await page.locator('header [aria-haspopup=listbox]').first().click(); await page.waitForTimeout(200);
    await page.locator('[role=listbox] [role=option]').filter({ hasText: 'QA Site B' }).first().click();
    await page.waitForTimeout(3500);
    const b = await mainText(page);
    const chip = await page.locator('header [aria-haspopup=listbox]').first().getAttribute('aria-label');
    res.push([r, /MH12QA/.test(a) || r === 'overview', !/MH12QA/.test(b), /QA Site B/.test(chip)]);
    await page.locator('header [aria-haspopup=listbox]').first().click(); await page.waitForTimeout(200);
    await page.locator('[role=listbox] [role=option]').filter({ hasText: 'QA Site A' }).first().click(); await page.waitForTimeout(2500);
  }
  rec('AC-23 multi-site Site Admin: switching A → B shows only B data on Overview, Live parking and Employees; site named only in the switcher', res.every((x) => x[2] && x[3]), JSON.stringify(res));
  const names = await page.evaluate(() => (document.querySelector('main').innerText.match(/QA Site [AB]/g) || []).length);
  rec('AC-23 current site shown only in the switcher (not repeated in page content)', names === 0, `${names} mentions in main`);
  await ctx.close();
}

// ---------------------------------------------------------------- F4 Overview numbers = API
if (want.has('overview')) {
  for (const [email, site] of [[E('admina'), A], [E('admind'), D]]) {
    const { ctx, page } = await openAs(email, { hash: 'overview' });
    const o = (await api(email, 'GET', '/overview', { site })).json;
    const t = await mainText(page);
    const fmt = (n) => n.toLocaleString('en-IN');
    const ok = t.includes(`${fmt(o.occupied)} / ${fmt(o.total)}`) && (o.pendingRequests === 0 || t.includes(String(o.pendingRequests)));
    rec(`F4/AC-04 Overview (${email.split('@')[0]}): figures match GET /overview (occupied/total, pending)`, ok, `api ${o.occupied}/${o.total} pending ${o.pendingRequests} entries ${o.entriesToday} · ${t.slice(0, 260)}`);
    const fab = t.match(/₹4\.2L|48\/60|94%|96%|100% uptime|CONNECTED|VERIFIED|System healthy|Zero Violations|Today, 08:30 AM|LSTM/g);
    rec(`AC-04 Overview (${email.split('@')[0]}): none of the UI-review fabricated values`, !fab, fab?.join(',') || 'none');
    await ctx.close();
  }
}

await browser.close();
finish(process.argv[3] || 'console-results');
