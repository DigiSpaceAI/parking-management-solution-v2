// 003 F1: tv-* design tokens (03 v1.2 "tv-* type tokens in the design system").
// Done-when: tokens --check OK; --tv-code-size = 2.7083vw; a tv-* use outside src/display fails lint:styles.
// Node built-ins only; nothing in the repo is changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = () => readFileSync(join(ROOT, 'src/design-system/tokens.css'), 'utf8');
const varOf = (name) => {
  const m = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(css());
  return m && m[1].trim();
};

test('tokens --check passes with the TV group', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/build-tokens.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test('every tv-* type style and size has a vw twin (value / 1920 x 100vw)', () => {
  assert.equal(varOf('--tv-code-size'), '2.7083vw');
  assert.equal(varOf('--tv-code-line'), '3.125vw');
  assert.equal(varOf('--tv-total-size'), '5vw');
  assert.equal(varOf('--tv-message-size'), '3.75vw');
  assert.equal(varOf('--tv-card-h-vw'), '13.6458vw');
  assert.equal(varOf('--tv-card-w-vw'), '23.1771vw');
  assert.equal(varOf('--tv-gap-vw'), '1.0417vw');
  // px originals and the font shorthand keep the 1920 px values; each style keeps its own family
  assert.equal(varOf('--text-tv-code-size'), '52px');
  assert.equal(varOf('--type-tv-code'), '600 52px/60px var(--font-mono)');
  assert.equal(varOf('--type-tv-status'), '600 36px/44px var(--font-text)');
  assert.equal(varOf('--type-tv-total'), '700 96px/104px var(--font-display)');
  assert.equal(varOf('--text-tv-plate-tracking'), '0.04em');
  assert.equal(varOf('--tv-off'), '#000000');
  const tokens = JSON.parse(readFileSync(join(ROOT, 'src/design-system/tokens.json'), 'utf8'));
  const names = [
    ...tokens.type.groups.flatMap((g) => g.styles.map((s) => s.name)),
  ].filter((n) => n.startsWith('tv-'));
  assert.equal(names.length, 9);
  for (const n of names) {
    assert.match(varOf(`--${n}-size`) || '', /^\d+(\.\d+)?vw$/, `${n} size twin`);
    assert.match(varOf(`--${n}-line`) || '', /^\d+(\.\d+)?vw$/, `${n} line twin`);
  }
});

test('theme.css (Tailwind) has no tv-* utility, so the console cannot use one', () => {
  const theme = readFileSync(join(ROOT, 'src/design-system/theme.css'), 'utf8');
  assert.doesNotMatch(theme, /tv-/);
});

test('lint:styles refuses tv-* outside src/display and allows it inside', async () => {
  const { checkText } = await import(join(ROOT, 'scripts/check-styles.mjs'));
  assert.ok(checkText('src/screens/Displays/x.css', '.a { font-size: var(--tv-code-size); }').some((p) => /TV token/.test(p)));
  assert.ok(checkText('src/screens/Displays/X.tsx', 'const a = <p className="text-tv-code" />;').some((p) => /TV token/.test(p)));
  assert.ok(checkText('marketing/x.css', '.a { background: var(--tv-off); }').some((p) => /TV token/.test(p)));
  assert.deepEqual(checkText('src/display/display.css', '.a { font-size: var(--tv-code-size); height: var(--tv-card-h-vw); }'), []);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/check-styles.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
