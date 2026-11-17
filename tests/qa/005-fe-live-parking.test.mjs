// 005 F3 (frontend-dev): Live parking reads every list/label from slotFields. The real SlotCard is bundled with esbuild (already a dev dependency) and rendered to static HTML.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const src = (p) => readFileSync(path.join(root, p), 'utf8');
let R; // { React, html(el) , SlotCard, SlotRow }

before(async () => {
  // inside node_modules (git-ignored) so the bundle finds react and lucide-react
  const dir = path.join(root, 'node_modules', '.cache', 'pf-005-live');
  mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, 'entry.tsx');
  writeFileSync(entry, `export { SlotCard, SlotRow } from ${JSON.stringify(path.join(root, 'src/design-system/components/SlotCard.tsx'))};
export { heightOf } from ${JSON.stringify(path.join(root, 'src/utils/slots.ts'))};`);
  const out = path.join(dir, 'out.mjs');
  await build({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', logLevel: 'silent', absWorkingDir: root });
  const mod = await import(pathToFileURL(out).href);
  const React = (await import(pathToFileURL(path.join(root, 'node_modules/react/index.js')).href)).default;
  const { renderToStaticMarkup } = await import(pathToFileURL(path.join(root, 'node_modules/react-dom/server.node.js')).href);
  R = { ...mod, h: (C, props) => renderToStaticMarkup(React.createElement(C, props)) };
});

test('F3 the card chip reads labels from slotFields (Hatchback, CSUV, Two-wheeler) and marks an old value', () => {
  const chip = (slotType) => R.h(R.SlotCard, { code: 'X', status: 'VACANT', slotType });
  assert.match(chip('HATCHBACK'), />Hatchback</);
  assert.match(chip('CSUV'), />CSUV</);
  assert.match(chip('TWO_WHEELER'), />Two-wheeler</);
  assert.match(chip('Compact SUV'), /Compact SUV \(old\)/);
  assert.match(R.h(R.SlotCard, { code: 'X', status: 'MAINTENANCE' }), />Maintenance</);
});

test('F3 height reads codes and old labels through the shared parser', () => {
  assert.equal(R.heightOf({ height: '2.5m' }), 2.5);
  assert.equal(R.heightOf({ height: 'High Clearance (2.5m)' }), 2.5);
  assert.equal(R.heightOf({ height: '3.0m' }), 3);
  assert.equal(R.heightOf({ height: 'Puzzle 2-Tier' }), null);
  assert.equal(R.heightOf({ height: '2.0m', heightM: 2.1 }), 2.1, 'the API value still wins');
});

test('F3 static: Live parking keeps no list of its own', () => {
  const idx = src('src/screens/LiveParking/index.tsx');
  const modal = src('src/screens/LiveParking/SlotModal.tsx');
  assert.match(idx, /optionsFor\('slotType'\)/); assert.match(idx, /optionsFor\('status'\)/);
  assert.doesNotMatch(idx, /value: 'TWO_WHEELER'|value: 'CSUV'|value: 'VACANT'/);
  assert.match(modal, /optionsFor\('slotType'\)/);
  assert.doesNotMatch(modal, /value: 'HATCHBACK'|value: 'SEDAN'|enumLabel/);
  assert.match(modal, /labelFor\('allocation'/);
  assert.match(src('src/design-system/components/SlotCard.tsx'), /labelFor\('slotType', slotType\)/);
});
