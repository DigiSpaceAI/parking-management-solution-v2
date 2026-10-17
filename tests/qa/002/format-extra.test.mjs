// 002 QA, R1-pre T4: extra format.ts cases for AC-18 (compact, fixed-shape strings that fit
// narrow cards at 360px) and AC-21 (product naming in the R1 files). Adds to tests/qa/002-format.test.mjs.
// Runs with `npm run test:qa` under any TZ (the report runs it under UTC, LA, Kolkata, Kiritimati).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Repo root: the nearest folder above this file with a package.json (works from tests/qa/ or tests/qa/002/). */
function findRoot(dir) { while (!existsSync(join(dir, 'package.json'))) { const up = dirname(dir); if (up === dir) throw new Error('no package.json'); dir = up; } return dir; }
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const {
  formatDate, formatTime, formatDateTime, formatSince, formatINR, formatDuration, formatAgo,
} = await import(pathToFileURL(join(ROOT, 'src/utils/format.ts')).href);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

test('AC-18: every month is a 3-letter abbreviation; dates ≤ 11 chars, date-times ≤ 18 chars', () => {
  for (let m = 0; m < 12; m++) {
    const iso = new Date(Date.UTC(2026, m, 28, 6, 0)).toISOString(); // 11:30 IST, same day
    assert.equal(formatDate(iso), `28 ${MON[m]} 2026`);
    assert.ok(formatDate(iso).length <= 11);
    assert.ok(formatDateTime(iso).length <= 18, formatDateTime(iso));
    assert.match(formatTime(iso), /^\d{2}:\d{2}$/);
  }
});

test('IST rolls over year and leap-day boundaries correctly', () => {
  assert.equal(formatDateTime('2026-12-31T18:29:00Z'), '31 Dec 2026, 23:59');
  assert.equal(formatDateTime('2026-12-31T18:30:00Z'), '1 Jan 2027, 00:00');
  assert.equal(formatDate('2028-02-28T18:30:00Z'), '29 Feb 2028');
  assert.equal(formatDate('2027-02-28T18:30:00Z'), '1 Mar 2027');
});

test('Date, epoch number and ISO string inputs give the same output', () => {
  const ms = Date.UTC(2026, 9, 7, 3, 44);
  const want = '7 Oct 2026, 09:14';
  assert.equal(formatDateTime(ms), want);
  assert.equal(formatDateTime(new Date(ms)), want);
  assert.equal(formatDateTime('2026-10-07T09:14:00+05:30'), want);
  assert.equal(formatDateTime('2026-10-07T03:44:00.000Z'), want);
});

test('"In since": today vs an earlier day across month and year boundaries', () => {
  // now = 1 Jan 2027, 00:30 IST
  const now = '2026-12-31T19:00:00Z';
  assert.equal(formatSince('2026-12-31T18:45:00Z', now), '00:15'); // 00:15 IST same day
  assert.equal(formatSince('2026-12-31T18:00:00Z', now), '31 Dec 2026, 23:30');
  // now = 1 Nov, an entry on 31 Oct
  assert.equal(formatSince('2026-10-31T10:00:00Z', '2026-11-01T04:00:00Z'), '31 Oct 2026, 15:30');
  // a multi-day stay never reads as today's time
  assert.equal(formatSince('2026-09-28T03:44:00Z', '2026-10-06T03:44:00Z'), '28 Sep 2026, 09:14');
  assert.equal(formatSince('2026-10-06T03:44:00Z', 'bad now'), '—');
  // Date / number inputs behave the same
  assert.equal(formatSince(Date.parse('2026-10-06T03:44:00Z'), new Date('2026-10-06T10:00:00Z')), '09:14');
});

test('durations at unit boundaries stay short', () => {
  const s = 1000, m = 60 * s, h = 60 * m, d = 24 * h;
  assert.equal(formatDuration(59 * s), '<1m');
  assert.equal(formatDuration(60 * s), '1m');
  assert.equal(formatDuration(59 * m + 59 * s), '59m');
  assert.equal(formatDuration(h), '1h 00m');
  assert.equal(formatDuration(23 * h + 59 * m), '23h 59m');
  assert.equal(formatDuration(d), '1d');
  assert.equal(formatDuration(d + 59 * m), '1d');
  assert.equal(formatDuration(365 * d + 5 * h), '365d 5h');
  assert.equal(formatDuration(NaN), '—');
});

test('"ago" at unit boundaries, and future times', () => {
  const now = Date.parse('2026-10-07T10:00:00Z');
  assert.equal(formatAgo(now - 4999, now), 'just now');
  assert.equal(formatAgo(now - 5000, now), '5s ago');
  assert.equal(formatAgo(now - 59 * 1000, now), '59s ago');
  assert.equal(formatAgo(now - 60 * 1000, now), '1 min ago');
  assert.equal(formatAgo(now - 59 * 60 * 1000, now), '59 min ago');
  assert.equal(formatAgo(now - 60 * 60 * 1000, now), '1h ago');
  assert.equal(formatAgo(now - 23 * 3600 * 1000, now), '23h ago');
  assert.equal(formatAgo(now - 24 * 3600 * 1000, now), '6 Oct 2026');
  assert.equal(formatAgo(now + 60 * 60 * 1000, now), 'just now');
  assert.equal(formatAgo('x', now), '—');
});

test('rupee amounts: paise rounding edge and lakh/crore widths', () => {
  assert.equal(formatINR(0.005), '₹0.01');
  assert.equal(formatINR(99.999), '₹100'); // rounds to a whole rupee → no paise shown
  assert.equal(formatINR(10000000), '₹1,00,00,000');
  assert.equal(formatINR(Infinity), '—');
});

// ---------- AC-21 naming in the R1-pre files ----------
const R1 = ['src/design-system', 'src/utils/format.ts', 'marketing'];
const SKIP_DIRS = new Set(['node_modules', 'fonts']);
const TEXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.svg', '.json', '.txt', '.xml']);
function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  if (statSync(abs).isDirectory()) {
    if (SKIP_DIRS.has(basename(abs))) return;
    for (const n of readdirSync(abs)) walk(join(rel, n), out);
  } else if (TEXT.has(extname(abs))) out.push(rel);
}

test('AC-21 (R1-pre files): "ParkFlow" / "ParkOrbit" occur 0 times; the name is "ParkFlows"', () => {
  const files = [];
  for (const r of R1) walk(r, files);
  assert.ok(files.length > 30, `walked ${files.length} files`);
  const bad = [];
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const m of text.matchAll(/ParkOrbit|ParkFlow(?!s)|Park Flows|PARKFLOW(?!S)/gi)) {
      // lower-case code identifiers/paths like "parkflows-logo.svg" are fine; "parkflow" without s is not
      bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('AC-21 (R1-pre files): one logo — every marketing page and the console favicon use the shared brand SVGs', () => {
  const brand = readdirSync(join(ROOT, 'src/design-system/brand')).filter((f) => f.endsWith('.svg'));
  assert.deepEqual(brand.sort(), [
    'parkflows-favicon.svg', 'parkflows-logo-reversed.svg', 'parkflows-logo.svg',
    'parkflows-mark-mono.svg', 'parkflows-mark-reversed.svg', 'parkflows-mark.svg',
  ]);
  const html = ['marketing/partials/header.html', 'marketing/partials/footer.html', 'marketing/partials/head.html']
    .map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  const imgs = [...html.matchAll(/(?:src|href)="([^"]+\.svg)"/g)].map((m) => m[1]);
  assert.ok(imgs.length > 0, 'marketing references brand SVGs');
  for (const i of imgs) assert.match(i, /parkflows-(logo|mark|favicon)/, `non-brand logo ${i}`);
  // no other logo files anywhere in marketing/
  const other = [];
  walk('marketing', other);
  assert.deepEqual(other.filter((f) => /logo/i.test(f) && f.endsWith('.svg')), []);
});
