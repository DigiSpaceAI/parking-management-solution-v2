// 002 QA: R1a copy check. Compares the built /privacy/ and /demo/ with 01-prd.md "PM copy for R1a"
// (v1.5): every quoted sentence, the section headings they sit under, the meta description and the
// "Delete my enquiry" mailto. Flag OFF must have them; flag ON must have none of the flag-OFF-only text.
//   MODE=off|on PW=<playwright/index.mjs> CHROME=<chromium> node tests/qa/002/browser/r1a-copy.mjs <base-url> <path/to/01-prd.md>
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.PW || 'playwright');
const BASE = process.argv[2].replace(/\/$/, '');
const prd = readFileSync(process.argv[3], 'utf8');
const MODE = process.env.MODE === 'on' ? 'on' : 'off';
const results = [];
const rec = (id, pass, detail = '') => results.push({ id, pass: !!pass, detail: String(detail) });

// ---- parse the PRD section ----
const sec = prd.slice(prd.indexOf('## PM copy for R1a'), prd.indexOf('## Bug triage'));
const privBlock = sec.slice(sec.indexOf('**`/privacy/` (flag OFF):**'), sec.indexOf('**`/demo/`'));
const quoted = (s) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const privItems = privBlock.split('\n').filter((l) => l.startsWith('- ')).map((l) => {
  const label = (/\*\*([^*]+?):?\*\*/.exec(l) || [])[1] || (/^- (Intro|Meta description)/.exec(l) || [])[1] || '';
  return { label: label.replace(/:$/, ''), quotes: quoted(l), line: l };
});
const meta = privItems.find((i) => /^Meta description/.test(i.line.slice(2))).quotes[0];
const subject = (/mailto subject: "([^"]+)"/.exec(privBlock) || [])[1];
const sentences = privItems.filter((i) => !/^Meta description/.test(i.line.slice(2)) && !/unchanged/.test(i.line))
  .map((i) => ({ label: i.label, text: i.quotes.filter((q) => q !== subject)[0] })).filter((x) => x.text);
const demoLine = quoted(sec.slice(sec.indexOf('**`/demo/`'), sec.indexOf('**Condition'))).filter((q) => q !== 'What happens next').pop();
rec('PRD parsed: 01 v1.5 "PM copy for R1a"', sentences.length === 6 && meta && subject && /^We reply by email/.test(demoLine),
  `${sentences.length} privacy sentences, meta, subject "${subject}", demo line "${demoLine}"`);

const norm = (s) => s.replace(/\s+/g, ' ').replace(/[’]/g, "'").trim();
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
for (const width of [360, 1280]) {
  for (const js of [true, false]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: js });
    const page = await ctx.newPage();
    const tag = `flag ${MODE.toUpperCase()} JS ${js ? 'on' : 'off'} @${width}`;
    // /privacy/
    await page.goto(BASE + '/privacy/', { waitUntil: 'networkidle' });
    const p = await page.evaluate(() => ({
      text: document.querySelector('main').innerText,
      meta: document.querySelector('meta[name=description]')?.content,
      sections: [...document.querySelectorAll('main h2')].map((h) => { let t = ''; let n = h.nextElementSibling; while (n && n.tagName !== 'H2') { t += ' ' + n.innerText; n = n.nextElementSibling; } return { h: h.innerText, t }; }),
      mail: [...document.querySelectorAll('main a[href^="mailto:"]')].map((a) => a.getAttribute('href')),
    }));
    const text = norm(p.text);
    if (MODE === 'off') {
      const missing = sentences.filter((s) => !text.includes(norm(s.text)));
      const misplaced = sentences.filter((s) => s.label && s.label !== 'Intro').filter((s) => {
        const sec = p.sections.find((x) => norm(x.h).toLowerCase() === s.label.toLowerCase());
        return !sec || !norm(sec.t).includes(norm(s.text));
      });
      rec(`${tag} /privacy/: all 6 PRD sentences verbatim`, missing.length === 0, missing.map((m) => m.label + ': ' + m.text.slice(0, 50)).join(' | ') || 'all present');
      rec(`${tag} /privacy/: each sentence under its PRD heading`, misplaced.length === 0, misplaced.map((m) => m.label).join(', ') || p.sections.map((s) => s.h).join(' · '));
      rec(`${tag} /privacy/: meta description = PRD`, p.meta === meta, p.meta);
      rec(`${tag} /privacy/: delete mailto subject "${subject}"`, p.mail.some((m) => m === `mailto:sales@parkflows.in?subject=${encodeURIComponent(subject)}`), p.mail.join(', '));
      const stale = [/Book a demo form/i, /IP address/i, /ParkFlows system/i, /\bform\b/i, /browser details/i].filter((r) => r.test(text)).map(String);
      rec(`${tag} /privacy/: no flag-ON (form/B6) wording`, stale.length === 0, stale.join(', ') || 'none');
      rec(`${tag} /privacy/: Cookies and tracking + Contact unchanged`, /This website sets no cookies and runs no analytics or advertising scripts\./.test(text) && /Email sales@parkflows\.in or call \+91 98206 03518/.test(text), p.sections.filter((s) => /Cookies|Contact/.test(s.h)).map((s) => s.h + ':' + norm(s.t)).join(' | '));
    } else {
      const leaked = sentences.filter((s) => text.includes(norm(s.text)));
      rec(`${tag} /privacy/: none of the flag-OFF sentences`, leaked.length === 0, leaked.map((l) => l.label).join(', ') || 'none');
      rec(`${tag} /privacy/: form wording kept (B6 promises)`, /Book a demo form/.test(text) && /IP address/.test(text) && p.meta !== meta, p.meta);
    }
    // /demo/
    await page.goto(BASE + '/demo/', { waitUntil: 'networkidle' });
    const d = norm(await page.evaluate(() => document.querySelector('main').innerText));
    const next = norm(await page.evaluate(() => { const h = [...document.querySelectorAll('h2')].find((x) => /What happens next/.test(x.innerText)); return h ? h.parentElement.innerText : ''; }));
    if (MODE === 'off') rec(`${tag} /demo/: "What happens next" = PRD line`, next.includes(norm(demoLine)) && !/We contact you the way you choose/.test(d), next);
    else rec(`${tag} /demo/: flag-OFF line absent (form version kept)`, !d.includes(norm(demoLine)), next);
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
