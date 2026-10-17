// 002 R1b re-test (535f6fa): BUG-R1B-1 / BUG-R1B-2 with repeated fresh sign-ins and reloads, slowed APIs,
// sign-out / sign-in, view-as enter / leave, and the code-review nit N-1 (prompt shown while roles load).
//   same env as console.mjs (see lib.mjs);  node tests/qa/002/r1b/retest.mjs [bug1,bug2,viewas,n1]
import { URL, fx, fx2, MASTER, PW, rec, info, browser, openAs, api, finish, sleep } from './lib.mjs';

const want = new Set((process.argv[2] || 'bug1,bug2,viewas,n1').split(','));
const A = fx.sites.A.id;
const E = (k) => (fx.users[k] || fx2.users[k]).email;

/** Visible state of the console: hash, H1, whether it is still "Loading" (no H1, skeleton or "Loading"). */
const state = (p) => p.evaluate(() => {
  const h1 = [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()).join(' / ');
  const t = (document.querySelector('main') || document.body).innerText.replace(/\s+/g, ' ').trim();
  // multi-site / Master: the switcher's label; single-site: the site name shown in the top bar
  const chip = document.querySelector('header [aria-haspopup=listbox]')?.getAttribute('aria-label') || (document.querySelector('header')?.innerText.match(/QA Site [A-D]|QA Big D/) || [''])[0];
  const busy = !!document.querySelector('[aria-busy=true], .pf-skeleton');
  return { hash: location.hash, h1, loading: !h1 && (busy || /Loading/.test(t) || t.length < 3), chip, va: (document.body.innerText.match(/Viewing as [^\n]+/) || [''])[0], text: t.slice(0, 90) };
});

/** Sample every 100 ms for `ms`; returns the timeline compressed to changes, and the final state. */
async function watch(p, ms = 7000) {
  const tl = []; const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < ms) {
    const s = await state(p).catch(() => null);
    if (s) { const k = `${s.hash}|${s.h1}|${s.loading}`; if (k !== last) { tl.push({ t: Date.now() - t0, ...s }); last = k; } }
    await sleep(100);
  }
  return { tl, final: await state(p) };
}

async function slow(page, { roles = 0, mySites = 0 } = {}) {
  if (roles) await page.route('**/api/v1/rbac/roles', async (r) => { await sleep(roles); await r.continue(); });
  if (mySites) await page.route('**/api/v1/my-sites', async (r) => { await sleep(mySites); await r.continue(); });
}

async function signIn(page, email) {
  await page.goto(URL + '/'); await page.waitForSelector('input[type=password]', { timeout: 15000 });
  await page.locator('input[autocomplete=username], input[type=email]').first().fill(email);
  await page.locator('input[type=password]').first().fill(PW);
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await sleep(600);
    const msg = await page.evaluate(() => document.body.innerText);
    if (!/Too many|try again in/i.test(msg) || !(await page.locator('input[type=password]').count())) break;
    await sleep(15000); // login throttle; not what is under test
  }
}
async function signOut(page) {
  await page.locator('.pf-account').first().click(); await sleep(200);
  await page.getByRole('menuitem', { name: 'Sign out' }).click(); await sleep(1200);
}
async function chooseSite(page, name) {
  await page.locator('header [aria-haspopup=listbox]').first().click(); await sleep(250);
  await page.locator('[role=listbox] [role=option]').filter({ hasText: name }).first().click(); await sleep(2500);
}
const fmt = (r) => r.ok ? 'ok' : `${r.final.hash || '(no hash)'}:"${r.final.h1 || (r.final.loading ? 'Loading' : r.final.text.slice(0, 20))}"`;

// ------------------------------------------------------------------ BUG-R1B-1: single-site users at "/"
if (want.has('bug1')) {
  for (const who of ['atta', 'admina']) {
    for (const [label, opt, n] of [['no delay', {}, 8], ['/rbac/roles +1.5 s', { roles: 1500 }, 4], ['/rbac/roles +3 s', { roles: 3000 }, 2]]) {
      // fresh sign-ins: a new browser each time, through the Login screen
      const runs = []; let maxLoad = 0;
      for (let i = 0; i < n; i++) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const p = await ctx.newPage(); await slow(p, opt);
        await signIn(p, E(who));
        const w = await watch(p, 4000 + (opt.roles || 0));
        const ok = w.final.hash === '#/overview' && w.final.h1 === 'Overview' && !w.final.loading;
        const firstOk = w.tl.find((x) => x.h1 === 'Overview'); maxLoad = Math.max(maxLoad, firstOk ? firstOk.t : 99999);
        runs.push({ ok, final: w.final });
        // reloads in the same signed-in browser
        if (label === 'no delay' && i < 6 || label !== 'no delay' && i < 2) {
          const rr = [];
          await p.goto(URL + '/'); // "/" with no hash, as a bookmark would
          await p.reload();
          const w2 = await watch(p, 4000 + (opt.roles || 0));
          rr.push(w2.final.hash === '#/overview' && w2.final.h1 === 'Overview' && !w2.final.loading);
          runs.push({ ok: rr[0], final: w2.final, reload: true });
        }
        await ctx.close();
      }
      const si = runs.filter((r) => !r.reload), rl = runs.filter((r) => r.reload);
      rec(`BUG-R1B-1 ${who} (${label}): fresh sign-ins ${si.filter((r) => r.ok).length}/${si.length} → Overview; reloads of "/" ${rl.filter((r) => r.ok).length}/${rl.length} → Overview; never a blank "Loading"`,
        runs.every((r) => r.ok), `sign-ins ${si.map(fmt).join(', ')} · reloads ${rl.map(fmt).join(', ')} · slowest time to Overview ${maxLoad} ms after sign-in`);
    }
  }
}

// ------------------------------------------------------------------ BUG-R1B-2: multi-site Site Admin, nothing remembered
if (want.has('bug2')) {
  for (const [label, opt, n] of [['no delay', {}, 8], ['/rbac/roles +1.5 s', { roles: 1500 }, 3], ['/my-sites +1.5 s', { mySites: 1500 }, 3]]) {
    const runs = [];
    for (let i = 0; i < n; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const p = await ctx.newPage(); await slow(p, opt);
      await signIn(p, E('multiab'));
      const w = await watch(p, 4500 + (opt.roles || opt.mySites || 0));
      const ok = w.final.h1 === 'Choose a site' && /Choose a site/.test(w.final.chip) && !w.final.loading;
      runs.push({ ok, final: w.final });
      if (i === 0 && label === 'no delay') {
        // choose A → Overview (AC-10); reload → remembered A's Overview
        await chooseSite(p, 'QA Site A');
        const s1 = await state(p);
        rec('BUG-R1B-2 multiab: after choosing QA Site A the landing page is Overview (AC-10)', s1.hash === '#/overview' && s1.h1 === 'Overview' && /QA Site A/.test(s1.chip), JSON.stringify(s1));
        await p.goto(URL + '/'); await p.reload(); const w2 = await watch(p, 4500);
        rec('BUG-R1B-2 multiab: reload of "/" → the remembered site\'s Overview', w2.final.hash === '#/overview' && w2.final.h1 === 'Overview' && /QA Site A/.test(w2.final.chip), JSON.stringify(w2.final));
        // pages the role can't open, an unknown route, and a site page with no site chosen
        await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('parkflows.site.')) localStorage.removeItem(k); });
        const pages = {};
        for (const r of ['sites', 'demo-requests', 'billing', 'nope', 'live-parking', 'employees', 'overview']) {
          await p.goto(URL + '/#/' + r); await p.reload(); const w3 = await watch(p, 3500); pages[r] = `${w3.final.h1}${/Choose a site/.test(w3.final.text) ? ' +prompt' : ''}`;
        }
        rec('BUG-R1B-2 multiab, no site: #/sites, #/demo-requests, #/billing and an unknown route → No access; #/live-parking, #/employees, #/overview → the Choose a site prompt with that page\'s title',
          ['sites', 'demo-requests', 'billing', 'nope'].every((r) => pages[r] === 'No access') && pages['live-parking'] === 'Live parking +prompt' && pages.employees === 'Employees & vehicles +prompt' && pages.overview === 'Overview +prompt', JSON.stringify(pages));
        // deep links with a site chosen
        await chooseSite(p, 'QA Site B');
        const withSite = {};
        for (const r of ['live-parking', 'employees', 'sites', 'nope']) { await p.goto(URL + '/#/' + r); await p.reload(); const w4 = await watch(p, 3500); withSite[r] = `${w4.final.h1}${/Choose a site/.test(w4.final.text) ? ' +prompt' : ''}|${/QA Site B/.test(w4.final.chip) ? 'B' : w4.final.chip}`; }
        rec('Deep links with a site chosen (multiab, site B): site pages open for B; #/sites and an unknown route → No access', withSite['live-parking'] === 'Live parking|B' && withSite.employees === 'Employees & vehicles|B' && withSite.sites.startsWith('No access') && withSite.nope.startsWith('No access'), JSON.stringify(withSite));
        // sign out, sign in as a different user (single-site), then back as multiab
        await signOut(p);
        const out = await state(p);
        await signIn(p, E('admina')); const w5 = await watch(p, 4500);
        const leak = /QA Site B|MH14QB/.test(await p.evaluate(() => document.body.innerText));
        rec('Sign out, then sign in as another user (qa.admina): Overview of site A, nothing of the previous user', /Sign in/.test(out.h1 + out.text) && w5.final.hash === '#/overview' && /QA Site A/.test(w5.final.chip) && !leak, `after sign-out: ${out.h1 || out.text.slice(0, 30)} · then ${JSON.stringify(w5.final)} · leak ${leak}`);
        await signOut(p); await signIn(p, E('multiab')); const w6 = await watch(p, 4500);
        rec('Sign in again as qa.multiab after another user: its own remembered site (B) and Overview, not the other user\'s', w6.final.hash === '#/overview' && /QA Site B/.test(w6.final.chip), JSON.stringify(w6.final));
      }
      await ctx.close();
    }
    rec(`BUG-R1B-2 multiab fresh browser (${label}): "Choose a site" ${runs.filter((r) => r.ok).length}/${runs.length}, never an endless "Loading"`, runs.every((r) => r.ok), runs.map(fmt).join(', '));
  }
}

// ------------------------------------------------------------------ view-as enter / leave as the Master
if (want.has('viewas')) {
  const users = (((r) => r.users || r)((await api(MASTER, 'GET', '/rbac/users')).json));
  for (const [who, expect] of [['multiab', 'Choose a site'], ['admina', 'Overview'], ['atta', 'Overview']]) {
    const id = users.find((u) => u.email === E(who)).id;
    for (const opt of [{}, { roles: 1500 }]) {
      const { ctx, page } = await openAs(MASTER, { siteId: A, hash: 'sites' });
      await slow(page, opt);
      await page.evaluate((id) => localStorage.setItem('parkflows.viewAs', id), id);
      // go to "/" without starting a second load first: a reload while the view-as check is in flight
      // ends the view (BUG-R1B-8), which is not what this check is about
      await page.evaluate(() => history.replaceState(null, '', '/')); await page.reload();
      const w = await watch(page, 4500 + (opt.roles || 0));
      const ok = w.final.h1 === expect && /Viewing as/.test(w.final.va) && !w.final.loading && (who !== 'multiab' || /Choose a site/.test(w.final.chip));
      const s = await state(page);
      const exitBtn = await page.getByRole('button', { name: 'Exit view' }).count();
      await page.getByRole('button', { name: 'Exit view' }).click({ timeout: 5000 }).catch(() => {}); const w2 = await watch(page, 3500);
      rec(`View-as ${who}${opt.roles ? ' (roles +1.5 s)' : ''}: enter → ${expect} with the bar; Exit view → the Master again (no bar, Master pages)`, ok && !w2.final.va && !w2.final.loading && w2.final.h1 !== '' && w2.final.h1 !== 'No access',
        `in: ${s.hash} "${s.h1}" ${s.va} chip "${s.chip}" exit buttons ${exitBtn} · out: ${w2.final.hash} "${w2.final.h1}" chip "${w2.final.chip}"`);
      await ctx.close();
    }
  }
  // the UI path: Sites panel "⋯ → View as" multiab (site A) then Exit view
  const { ctx, page } = await openAs(MASTER, { hash: 'sites' });
  await page.getByRole('row', { name: /QA Site A/ }).first().click(); await sleep(800);
  await page.locator('dialog[open]').getByRole('button', { name: /More actions/ }).first().click(); await sleep(300);
  const va = page.locator('[role=menu] [role=menuitem]').filter({ hasText: /View as QA multiab/ });
  if (await va.count()) { await va.first().focus(); await page.keyboard.press('Enter'); }
  const w = await watch(page, 4000);
  await page.getByRole('button', { name: 'Exit view' }).click().catch(() => {}); const w2 = await watch(page, 3000);
  rec('View-as qa.multiab from the Sites panel (⋯ → View as): "Choose a site" with the bar, no "Loading"; Exit view → back to Sites', /Viewing as QA multiab/.test(w.final.va) && w.final.h1 === 'Choose a site' && !w.final.loading && !w2.final.va && w2.final.hash === '#/sites',
    `in ${JSON.stringify(w.final)} · out ${w2.final.hash} "${w2.final.h1}"`);
  await ctx.close();
}

// ------------------------------------------------------------------ N-1: forbidden deep link while roles load
if (want.has('n1')) {
  for (const [who, delay] of [['multiab', 0], ['multiab', 1500], ['multiab', 3000], ['admina', 1500], ['atta', 1500]]) {
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const { ctx, page } = await openAs(E(who), {});
      await slow(page, { roles: delay });
      await page.goto(URL + '/#/sites'); await page.reload();
      const w = await watch(page, 3000 + delay);
      const prompt = w.tl.filter((x) => /Choose a site/.test(x.h1) || (/Choose a site/.test(x.text) && x.h1 !== 'No access'));
      const firstNo = w.tl.find((x) => x.h1 === 'No access');
      const shown = prompt.length ? ((w.tl[w.tl.indexOf(prompt[prompt.length - 1]) + 1]?.t ?? w.tl.at(-1).t) - prompt[0].t) : 0;
      samples.push({ shown, noAccessAt: firstNo?.t ?? null, final: w.final.h1 });
      await ctx.close();
    }
    info(`N-1 ${who} deep link #/sites, /rbac/roles +${delay} ms: "Choose a site" visible for ${samples.map((s) => s.shown + ' ms').join(', ')} before No access`, JSON.stringify(samples));
    rec(`N-1 ${who} deep link #/sites, roles +${delay} ms: always ends on No access`, samples.every((s) => s.final === 'No access'), JSON.stringify(samples));
  }
}

await browser.close();
finish(process.argv[3] || 'retest');
