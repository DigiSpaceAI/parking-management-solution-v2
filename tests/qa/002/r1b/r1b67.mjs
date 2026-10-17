// 002 R1b QA (9ac2843): BUG-R1B-6 (bell / account names start with their visible text, WCAG 2.5.3) and BUG-R1B-7
// (onboarding stores no made-up address/contact; the Sites panel shows "— not entered", also for the four values old
// onboarding made up; Edit site leaves them blank and saving clears them).
//   same env as console.mjs;  node tests/qa/002/r1b/r1b67.mjs [tag]
import { openAs, MASTER, URL, browser, api, fx, fx2, rec, finish, sleep, axe } from './lib.mjs';

// ---------------------------------------------------------------- BUG-R1B-6
for (const width of [360, 768, 1280]) {
  for (const [who, email] of [['Site Admin A', fx.users.admina.email], ['Master', MASTER], ['multi-site', fx.users.multiab.email], ['Site Admin C (nothing pending)', fx2.users.adminc.email]]) {
    const { ctx, page } = await openAs(email, { width, siteId: email === MASTER ? fx.sites.A.id : undefined });
    await sleep(1500);
    const names = await page.evaluate(() => ['.pf-bell', '.pf-account'].map((sel) => {
      const b = document.querySelector(sel); if (!b) return null;
      const visible = [...b.querySelectorAll('*')].filter((e) => !e.closest('.pf-sr-only') && e.children.length === 0 && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0)
        .map((e) => e.textContent.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      return { sel, name: (b.getAttribute('aria-label') || '').trim(), visible };
    }).filter(Boolean));
    const ok = names.length > 0 && names.every((n) => !n.visible || n.name.toLowerCase().startsWith(n.visible.toLowerCase()));
    const v = (await axe(page)).filter((x) => x.startsWith('label-content-name-mismatch'));
    rec(`BUG-R1B-6 ${who} @${width}: the bell and account buttons' accessible names start with their visible text; axe label-content-name-mismatch 0`, ok && v.length === 0, `${JSON.stringify(names)} · axe ${v.join('; ') || 0}`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------- BUG-R1B-7 server: onboarding
const stamp = Date.now().toString().slice(-4);
const blank = (await api(MASTER, 'POST', '/sites/onboard', { body: { siteName: `QA Blank ${stamp}`, siteCode: `QB${stamp}`, city: 'Nashik', totalSlots: 3 } })).json.site;
const typed = (await api(MASTER, 'POST', '/sites/onboard', { body: { siteName: `QA Typed ${stamp}`, siteCode: `QT${stamp}`, city: 'Thane', totalSlots: 3, address: '  12 MG Road, Thane  ', contactPerson: ' Meera Joshi ', contactEmail: 'meera@thane-mall.in', contactPhone: '+91 98200 11223' } })).json.site;
const all = ((r) => r.sites || r)((await api(MASTER, 'GET', '/sites')).json);
const b = all.find((s) => s.id === blank.id), t = all.find((s) => s.id === typed.id);
rec('BUG-R1B-7 onboarding with no address/contact stores them empty (no "<city> Parking Complex", "Site Facility Manager", admin@<code>.com, +91 9800000000)',
  b && b.address === '' && b.contactPerson === '' && b.contactEmail === '' && b.contactPhone === '', JSON.stringify({ address: b?.address, contactPerson: b?.contactPerson, contactEmail: b?.contactEmail, contactPhone: b?.contactPhone }));
rec('BUG-R1B-7 onboarding keeps what the Master typed (trimmed)', t && t.address === '12 MG Road, Thane' && t.contactPerson === 'Meera Joshi' && t.contactEmail === 'meera@thane-mall.in' && /98200\s?11223/.test(t.contactPhone),
  JSON.stringify({ address: t?.address, contactPerson: t?.contactPerson, contactEmail: t?.contactEmail, contactPhone: t?.contactPhone }));

// legacy: a site that still holds the four old made-up values (set through Edit site's API, as old onboarding left them)
const B = all.find((s) => s.id === fx.sites.B.id);
const legacy = { siteId: B.id, address: `${B.city} Parking Complex`, contactPerson: 'Site Facility Manager', contactEmail: `admin@${B.siteCode.toLowerCase()}.com`, contactPhone: '+91 9800000000' };
const up = await api(MASTER, 'POST', '/sites/update', { body: legacy });
info0(`legacy values on ${B.siteName}: /sites/update ${up.status}`);
function info0(s) { console.error('INFO ' + s); }

// ---------------------------------------------------------------- BUG-R1B-7 console: Sites panel + Edit site
const rows = async (page) => page.evaluate(() => {
  const dl = document.querySelector('dialog[open] .pf-dl'); if (!dl) return {};
  const o = {}; const dts = [...dl.querySelectorAll('dt')];
  for (const dt of dts) o[dt.innerText.trim()] = dt.nextElementSibling?.innerText.trim();
  return o;
});
const { ctx, page } = await openAs(MASTER, { hash: 'sites' });
const panelOf = async (name) => { await page.keyboard.press('Escape').catch(() => {}); await sleep(300); await page.getByRole('row', { name: new RegExp(name) }).first().click(); await sleep(900); return rows(page); };
const KEYS = ['Address', 'Contact person', 'Contact email', 'Contact phone'];
for (const [label, name, expectFn] of [
  ['new site, nothing entered (QA Blank)', `QA Blank ${stamp}`, (r) => KEYS.every((k) => r[k] === '— not entered')],
  ['new site, values entered (QA Typed)', `QA Typed ${stamp}`, (r) => r.Address === '12 MG Road, Thane' && r['Contact person'] === 'Meera Joshi' && r['Contact email'] === 'meera@thane-mall.in' && /98200/.test(r['Contact phone'] || '')],
  ['seeded site C (onboarded on 9ac2843 with no contact)', 'QA Site C', (r) => KEYS.every((k) => r[k] === '— not entered')],
  [`legacy made-up values (${B.siteName})`, B.siteName, (r) => KEYS.every((k) => r[k] === '— not entered')],
]) {
  const r = await panelOf(name);
  const txt = await page.evaluate(() => document.querySelector('dialog[open]')?.innerText || '');
  rec(`BUG-R1B-7 Sites panel, ${label}: Address / Contact person / email / phone on their own rows, entered value or "— not entered"; no made-up value shown`,
    expectFn(r) && !/Site Facility Manager|Parking Complex|9800000000|admin@qa[a-d]\.com/i.test(txt), JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, r[k]]))));
}
// Edit site on the legacy site: fields blank + note; saving clears them on the server
await panelOf(B.siteName);
await page.locator('dialog[open]').getByRole('button', { name: /Edit site/ }).click(); await sleep(600);
const form = await page.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].pop(); const v = {}; for (const i of d.querySelectorAll('input')) v[i.labels?.[0]?.innerText.replace('*', '').trim() || i.name] = i.value; return { v, note: /filled in automatically/.test(d.innerText) }; });
rec('BUG-R1B-7 Edit site on a legacy site: the four made-up values are left blank, with the "filled in automatically … Saving clears them" note',
  ['Address', 'Contact person', 'Contact email', 'Contact phone'].every((k) => form.v[k] === '') && form.note, JSON.stringify(form));
await page.locator('dialog[open]').getByRole('button', { name: /^Save/ }).first().click(); await sleep(1500);
const after = ((r) => r.sites || r)((await api(MASTER, 'GET', '/sites')).json).find((s) => s.id === B.id);
rec('BUG-R1B-7 saving that form clears them on the server (stored "")', after.address === '' && after.contactPerson === '' && after.contactEmail === '' && after.contactPhone === '',
  JSON.stringify({ address: after.address, contactPerson: after.contactPerson, contactEmail: after.contactEmail, contactPhone: after.contactPhone }));
await ctx.close();
// view-as / Site Admin can't reach the panel (unchanged): Sites = No access
const sa = await openAs(fx.users.admina.email, { hash: 'sites' });
rec('Sites (and its panel) stays Master-only: Site Admin → No access', (await sa.page.evaluate(() => document.querySelector('h1')?.innerText)) === 'No access', '');
await sa.ctx.close();
await browser.close();
finish(process.argv[3] || process.argv[2] || 'r1b67');
