import { browser, openPage, login, nav, pickSite, shot, MASTER, URL } from './lib.mjs';
import fs from 'node:fs';
const fx = JSON.parse(fs.readFileSync(`${process.env.QA_OUT || './qa-out'}/fixtures.json`));
const R = []; const rec = (id, pass, note) => { R.push({ id, pass, note }); console.log(pass ? 'PASS' : 'FAIL', id, note); };
const b = await browser();
// Domain panel as Site Admin A
{
  const { page, ctx } = await openPage(b, { height: 1400 });
  await login(page, fx.users.admina.email);
  await nav(page, 'Employee & Vehicle Approval'); await page.waitForTimeout(2000);
  const panel = page.locator('section, div').filter({ has: page.getByText('Allowed email domains', { exact: false }) }).filter({ hasText: 'qa-corp.in' }).last();
  await panel.scrollIntoViewIfNeeded().catch(() => {});
  const txt = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ');
  const rows = await panel.locator('span.rounded-lg.font-mono').all();
  const info = [];
  for (const r of rows) {
    const t = (await r.innerText()).replace(/\s+/g, ' ').trim();
    if (!/@?[a-z0-9-]+\.[a-z]/.test(t)) continue;
    const rm = await r.locator('button[aria-label^="Remove"]').count();
    info.push({ t: t.slice(0, 60), remove: rm > 0 });
  }
  await shot(page, 'DOM-admina-panel');
  const hasOwn = info.some((i) => /mh12qa-only\.in/.test(i.t)), hasPlat = info.some((i) => /qa-corp\.in/.test(i.t)), hasB = /mh14qb-only/.test(txt);
  const removeOk = info.every((i) => (/This site/.test(i.t) ? i.remove : !i.remove));
  rec('DOM-01 (AC-57 UI)', hasOwn && hasPlat && !hasB && removeOk, `rows=${JSON.stringify(info)}; Site B domain visible=${hasB}; hint="${(txt.match(/New domains apply[^.]*\./) || [''])[0]}"`);
  // add + remove own domain through the UI
  const input = panel.locator('input').first();
  await input.fill('qa-ui-added.in');
  await panel.getByRole('button', { name: /^Add/i }).first().click(); await page.waitForTimeout(1500);
  const after = (await panel.innerText()).replace(/\s+/g, ' ');
  const row = panel.locator('span.rounded-lg.font-mono').filter({ hasText: 'qa-ui-added.in' }).first();
  const lbl = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
  await row.locator('button[aria-label^="Remove"]').click().catch(() => {}); await page.waitForTimeout(400);
  const confirm = page.getByRole('button', { name: /^(Remove|Yes|Confirm)/i }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(1500);
  const gone = !(await panel.locator('span.rounded-lg.font-mono').filter({ hasText: 'qa-ui-added.in' }).count());
  rec('DOM-02 (AC-57 UI)', /qa-ui-added\.in/.test(after) && /This site/.test(lbl) && gone, `after add: row="${lbl}"; message="${(after.match(/@qa-ui-added\.in allowed[^.]*\./) || [''])[0]}"; removed via UI=${gone}`);
  await shot(page, 'DOM-admina-after');
  await ctx.close();
}
// Master in All sites: domain panel Add stays enabled (platform-wide) — known exception
{
  const { page, ctx } = await openPage(b, { height: 1400 });
  await login(page, MASTER);
  await page.getByRole('button', { name: /All sites/ }).first().click(); await page.waitForTimeout(1200);
  await nav(page, 'Master Site Config'); await page.waitForTimeout(2000);
  const txt = (await page.innerText('main')).replace(/\s+/g, ' ');
  await shot(page, 'DOM-master-all');
  rec('DOM-03 (L-3 exception)', /New domains apply to every site/.test(txt) && /QAA/.test(txt) && /QAB/.test(txt), `hint shown=${/New domains apply to every site/.test(txt)}; site codes on entries QAA=${/QAA/.test(txt)} QAB=${/QAB/.test(txt)}`);
  await ctx.close();
}
// M-2 UI / m-5 with a non-Master holding USER_MANAGEMENT (seeded account qa.uma)
{
  const { page, reqs, ctx } = await openPage(b, { height: 1200 });
  await login(page, fx.users.uma.email);
  const side = await page.locator('aside').first().innerText();
  await nav(page, 'User & RBAC'); await page.waitForTimeout(1500);
  const tabs = await page.locator('main button').allInnerTexts();
  const simTab = tabs.some((t) => /Role View Simulator/i.test(t));
  await page.getByRole('button', { name: /Module Permission Matrix/i }).first().click().catch(() => {}); await page.waitForTimeout(1200);
  const main = page.locator('main');
  const btns = main.locator('button').filter({ hasText: /save|delete|new role|create role|\+ role/i });
  const n = await btns.count(); let en = 0; const lab = [];
  for (let i = 0; i < n; i++) { const d = await btns.nth(i).isDisabled(); if (!d && await btns.nth(i).isVisible()) { en++; lab.push((await btns.nth(i).innerText()).trim()); } }
  const boxes = main.locator('input[type=checkbox]'); const nb = await boxes.count(); let eb = 0;
  for (let i = 0; i < nb; i++) if (!(await boxes.nth(i).isDisabled())) eb++;
  await shot(page, 'M2-uma-matrix');
  rec('M-2 UI / m-5', !simTab && !/InfoSec/.test(side) && en === 0 && eb === 0, `Role View Simulator tab visible=${simTab}; InfoSec in sidebar=${/InfoSec/.test(side)}; matrix save/delete/new buttons enabled=${en} ${JSON.stringify(lab)}; enabled permission checkboxes=${eb}/${nb}`);
  // own account edit refused (server) – check the UI message when uma edits own email via API from page
  const r = await page.evaluate(async (id) => { const x = await fetch('/api/v1/rbac/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, email: 'x@qa.test' }) }); return { s: x.status, b: await x.json() }; }, fx.users.uma.id);
  rec('M-1/R4-2 from console', r.s === 403, `uma changing own email from the page -> ${r.s} ${r.b.errorCode} "${r.b.message}"`);
  await ctx.close();
}
fs.writeFileSync(`${process.env.QA_OUT || './qa-out'}/res-dom.json`, JSON.stringify(R, null, 2));
await b.close();
