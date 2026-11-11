// 003 BUG-1 (06-test-report, PM decision 9 Nov): parkflows.in/tv must reach the TV page. The marketing
// Hosting target redirects /tv (and /tv/) to https://admin.parkflows.in/tv; nothing else changes.
//   node --test tests/qa/003-tv-redirect.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'docs/features/002-ui-redesign/d1/firebase.json'), 'utf8'));
const marketing = cfg.hosting.find((h) => h.target === 'marketing');
const admin = cfg.hosting.find((h) => h.target === 'admin');

test('marketing target: /tv and /tv/ redirect to https://admin.parkflows.in/tv (302), nothing else does', () => {
  assert.ok(marketing, 'marketing target');
  assert.equal(marketing.redirects.length, 1);
  const r = marketing.redirects[0];
  assert.equal(r.destination, 'https://admin.parkflows.in/tv');
  assert.equal(r.type, 302, 'temporary: the TV address may move later');
  const re = new RegExp(r.regex);
  for (const p of ['/tv', '/tv/']) assert.ok(re.test(p), p);
  for (const p of ['/', '/tvx', '/tv/x', '/demo/', '/privacy/', '/atv', '/TV']) assert.ok(!re.test(p), p);
  // The TV link's #k= fragment is never sent to a server; browsers keep it across the redirect.
});

test('the admin target and the marketing headers / rewrites are unchanged', () => {
  assert.equal(admin.redirects, undefined, 'admin.parkflows.in serves /tv itself');
  assert.equal(marketing.trailingSlash, true);
  assert.deepEqual(marketing.rewrites.map((x) => x.source), ['/api/v1/demo-requests']);
  assert.ok(marketing.headers.some((h) => h.source === '**' && h.headers.some((k) => k.key === 'Content-Security-Policy')));
});

test('the marketing site has no page of its own at /tv (exact-match static files would win over the redirect)', () => {
  for (const p of ['marketing/tv', 'marketing/tv.html', 'marketing/public/tv', 'marketing/public/tv.html']) assert.equal(existsSync(join(ROOT, p)), false, p);
});
