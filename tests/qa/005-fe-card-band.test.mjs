// 005 AC-25 (frontend-dev): the slot cards show no "Level N" band and no pallet text. Slot data (palletLevel, puzzleNumber) is untouched.
// The real SlotCard is bundled with esbuild (already a dev dependency) and rendered to static HTML.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const src = (p) => readFileSync(path.join(root, p), 'utf8');
let R;

before(async () => {
  const dir = path.join(root, 'node_modules', '.cache', 'pf-005-card');
  mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, 'entry.tsx');
  writeFileSync(entry, `export { SlotCard } from ${JSON.stringify(path.join(root, 'src/design-system/components/SlotCard.tsx'))};
export { decodeSlot } from ${JSON.stringify(path.join(root, 'src/utils/slots.ts'))};`);
  const out = path.join(dir, 'out.mjs');
  await build({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', logLevel: 'silent', absWorkingDir: root });
  const mod = await import(pathToFileURL(out).href);
  const React = (await import(pathToFileURL(path.join(root, 'node_modules/react/index.js')).href)).default;
  const { renderToStaticMarkup } = await import(pathToFileURL(path.join(root, 'node_modules/react-dom/server.node.js')).href);
  R = { ...mod, h: (C, props) => renderToStaticMarkup(React.createElement(C, props)) };
});

const puzzleSlot = { slotNumber: 'B1-P03-S6', parkingType: 'PUZZLE', puzzleNumber: 'B1-P03', palletLevel: 6, floorLocation: 'North' };

test('AC-25 a puzzle slot card shows no "Level N" band and no pallet text', () => {
  for (const compact of [true, false]) {
    const html = R.h(R.SlotCard, { code: 'B1-P03-S6', status: 'VACANT', decode: R.decodeSlot(puzzleSlot, false), slotType: 'SEDAN', compact, heightM: 2, lengthM: 5 });
    assert.doesNotMatch(html, /Level\s*\d/i, 'no Level band');
    assert.doesNotMatch(html, /Pallet/i, 'no pallet text');
    assert.doesNotMatch(html, /pf-slot-band-end/);
    assert.match(html, /Puzzle 03/, 'the stacker is still named');
  }
  // data is not touched: the modal's own decode still knows the pallet (deferred O-8), the card just doesn't ask for it
  assert.equal(R.decodeSlot(puzzleSlot), 'Puzzle 03 · Pallet 6');
  assert.equal(R.decodeSlot({ ...puzzleSlot, palletLevel: undefined }, false), 'Puzzle 03');
  assert.equal(R.decodeSlot({ slotNumber: 'G-14', parkingType: 'GROUND' }, false), 'Ground · Bay 14');
});


test('AC-25 static: no level reaches a card from the Live parking views, the preview or the styles', () => {
  for (const f of ['src/screens/LiveParking/PuzzleView.tsx', 'src/screens/LiveParking/SlotsView.tsx']) {
    const t = src(f);
    assert.doesNotMatch(t, /level=\{|palletLevelOf\(/, f + ': no level on a card');
    assert.match(t, /decodeSlot\([a-z]+, false\)/, f);
  }
  assert.doesNotMatch(src('src/design-system/components/SlotCard.tsx'), /Level \{|level\?:|band-end/);
  assert.doesNotMatch(src('src/design-system/components.css'), /pf-slot-band-end/);
  assert.doesNotMatch(src('src/design-system/preview/sections57.tsx'), /level=\{|Pallet \d/);
});
