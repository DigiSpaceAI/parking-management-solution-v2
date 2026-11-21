// 008 observation 2 (grey oval): in a zone card (a flex column inside a 2-column grid) the occupancy bar
// must keep its own height. `.pf-occ-track` is `flex: 1 1 auto` for horizontal rows; inside the column it grew
// to fill a card stretched by a taller neighbour. Node built-ins only; reads the stylesheet, changes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../../src/design-system/components.css', import.meta.url)), 'utf8');

test('zone card: the occupancy bar does not grow vertically', () => {
  const m = css.match(/\.pf-zone-pallet\s+\.pf-occ-track\s*\{([^}]*)\}/);
  assert.ok(m, 'a .pf-zone-pallet .pf-occ-track rule exists');
  assert.match(m[1], /flex:\s*(0\s+0\s+auto|none)\s*;/, 'flex does not grow');
});

test('the shared bar rule is unchanged (other screens keep their horizontal layout)', () => {
  assert.match(css, /\.pf-occ-track\s*\{[^}]*flex:\s*1\s+1\s+auto;/);
});

test('the zone card is still a flex column', () => {
  assert.match(css, /\.pf-zone-pallet\s*\{[^}]*flex-direction:\s*column;/);
});
