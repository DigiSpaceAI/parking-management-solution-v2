// 002 T4: display formats (AC-13). Runs with `npm run test:qa` (node:test, no dependencies).
// Node 22.18+ strips TypeScript types, so the .ts module is imported directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDate, formatTime, formatDateTime, formatINR, formatNumber, formatDuration,
  formatAgo, formatPlate, enumLabel, statusTone,
} from '../../src/utils/format.ts';

test('dates and times are shown in IST, whatever the machine time zone', () => {
  // 18:44 UTC on 25 Sep = 00:14 IST on 26 Sep: the IST calendar day wins
  assert.equal(formatDate('2026-09-25T18:44:00Z'), '26 Sep 2026');
  assert.equal(formatTime('2026-09-25T18:44:00Z'), '00:14');
  assert.equal(formatDate('2026-09-25T03:44:00Z'), '25 Sep 2026');
  assert.equal(formatTime('2026-09-25T03:44:00Z'), '09:14');
  assert.equal(formatDateTime('2026-09-25T03:44:00Z'), '25 Sep 2026, 09:14');
  assert.equal(formatDate(new Date(Date.UTC(2026, 9, 3, 6, 0))), '3 Oct 2026');
  assert.equal(formatTime('2026-01-01T12:00:00+05:30'), '12:00', 'an explicit IST offset round-trips');
  assert.equal(formatTime('2026-10-03T23:59:59Z'), '05:29');
});

test('invalid dates show a dash, not "Invalid Date"', () => {
  assert.equal(formatDate('not a date'), '—');
  assert.equal(formatTime(NaN), '—');
  assert.equal(formatDateTime(''), '—');
});

test('rupees and numbers use Indian digit grouping', () => {
  assert.equal(formatINR(177000), '₹1,77,000');
  assert.equal(formatINR(0), '₹0');
  assert.equal(formatINR(999), '₹999');
  assert.equal(formatINR(1000), '₹1,000');
  assert.equal(formatINR(123456789), '₹12,34,56,789');
  assert.equal(formatINR(1499.5), '₹1,499.50');
  assert.equal(formatINR(2000, { paise: true }), '₹2,000.00');
  assert.equal(formatINR(-2500), '−₹2,500');
  assert.equal(formatNumber(1080), '1,080');
  assert.equal(formatNumber(100000), '1,00,000');
  assert.equal(formatNumber(2300), '2,300');
  assert.equal(formatNumber(NaN), '—');
});

test('values that round to zero have no sign, and huge values show a dash (05 m-5)', () => {
  assert.equal(formatNumber(-0.4), '0');
  assert.equal(formatNumber(-0.004, 2), '0.00');
  assert.equal(formatNumber(-0.6), '−1');
  assert.equal(formatINR(-0.001), '₹0');
  assert.equal(formatINR(-0.004, { paise: true }), '₹0.00');
  assert.equal(formatINR(-1499.5), '−₹1,499.50');
  assert.equal(formatNumber(1e21), '—');
  assert.equal(formatNumber(-1e21), '—');
  assert.equal(formatINR(1e21), '—');
  assert.equal(formatNumber(999999999999999), '99,99,99,99,99,99,999');
});

test('durations read as days+hours, hours+minutes or minutes', () => {
  const m = 60000, h = 60 * m, d = 24 * h;
  assert.equal(formatDuration(7 * d + 22 * h + 15 * m), '7d 22h');
  assert.equal(formatDuration(2 * d), '2d');
  assert.equal(formatDuration(3 * h + 5 * m), '3h 05m');
  assert.equal(formatDuration(45 * m + 59 * 1000), '45m');
  assert.equal(formatDuration(30 * 1000), '<1m');
  assert.equal(formatDuration(-1), '—');
});

test('"ago" strings for "Updated …" and last activity', () => {
  const now = Date.parse('2026-10-03T10:00:00Z');
  assert.equal(formatAgo(now - 12 * 1000, now), '12s ago');
  assert.equal(formatAgo(now - 2 * 60 * 1000, now), '2 min ago');
  assert.equal(formatAgo(now - 3 * 3600 * 1000, now), '3h ago');
  assert.equal(formatAgo(now - 2 * 1000, now), 'just now');
  assert.equal(formatAgo(now - 3 * 86400 * 1000, now), '30 Sep 2026');
});

test('plates are shown with spaces', () => {
  assert.equal(formatPlate('KA05MN1234'), 'KA 05 MN 1234');
  assert.equal(formatPlate('ka-05-mn-1234'), 'KA 05 MN 1234');
  assert.equal(formatPlate('MH12AB123'), 'MH 12 AB 123');
  assert.equal(formatPlate('DL3CAB1234'), 'DL 3 CAB 1234');
  assert.equal(formatPlate('22BH1234AA'), '22 BH 1234 AA');
  assert.equal(formatPlate('TEMP-001'), 'TEMP001');
  assert.equal(formatPlate(''), '—');
});

test('enum codes become plain words (never ON_HOLD)', () => {
  assert.equal(enumLabel('ON_HOLD'), 'On hold');
  assert.equal(enumLabel('OCCUPIED'), 'Occupied');
  assert.equal(enumLabel('VACANT'), 'Vacant');
  assert.equal(enumLabel('MAINTENANCE'), 'Maintenance');
  assert.equal(enumLabel('PENDING'), 'Pending');
  assert.equal(enumLabel('TWO_WHEELER'), 'Two-wheeler');
  assert.equal(enumLabel('EV'), 'EV');
  assert.equal(enumLabel('SUV'), 'SUV');
  assert.equal(enumLabel('ANPR_AUTO'), 'ANPR (automatic)');
  assert.equal(enumLabel('RETRIEVAL_REQUESTED'), 'Retrieval requested');
  assert.equal(enumLabel('VIP_EXECUTIVE'), 'VIP executive');
  assert.equal(enumLabel('SOME_NEW_STATE'), 'Some new state');
  assert.equal(enumLabel(undefined), '—');
});

test('status values map to the fixed status colours', () => {
  assert.equal(statusTone('VACANT'), 'success');
  assert.equal(statusTone('APPROVED'), 'success');
  assert.equal(statusTone('OCCUPIED'), 'danger');
  assert.equal(statusTone('REJECTED'), 'danger');
  assert.equal(statusTone('RESERVED'), 'warning');
  assert.equal(statusTone('PENDING'), 'warning');
  assert.equal(statusTone('ON_HOLD'), 'warning');
  assert.equal(statusTone('MAINTENANCE'), 'neutral');
  assert.equal(statusTone('whatever'), 'neutral');
});
