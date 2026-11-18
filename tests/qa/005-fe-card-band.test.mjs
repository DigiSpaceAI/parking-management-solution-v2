// 005 AC-25 v1.3d (frontend-dev): the slot cards show no "Level N" band, no "Puzzle 03" line and no pallet text. Slot data (palletLevel, puzzleNumber) is untouched.
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
export { decodeSlot, cardDecode } from ${JSON.stringify(path.join(root, 'src/utils/slots.ts'))};`);
  const out = path.join(dir, 'out.mjs');
  await build({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', logLevel: 'silent', absWorkingDir: root });
  const mod = await import(pathToFileURL(out).href);
  const React = (await import(pathToFileURL(path.join(root, 'node_modules/react/index.js')).href)).default;
  const { renderToStaticMarkup } = await import(pathToFileURL(path.join(root, 'node_modules/react-dom/server.node.js')).href);
  R = { ...mod, h: (C, props) => renderToStaticMarkup(React.createElement(C, props)) };
});

const puzzleSlot = { slotNumber: 'B1-P03-S6', parkingType: 'PUZZLE', puzzleNumber: 'B1-P03', palletLevel: 6, floorLocation: 'North' };

test('AC-25 a puzzle slot card shows no "Level N" band, no "Puzzle 03" line and no pallet text', () => {
  assert.equal(R.cardDecode(puzzleSlot), '', 'a puzzle slot has no decode line on a card');
  assert.equal(R.cardDecode({ ...puzzleSlot, palletLevel: undefined }), '');
  for (const compact of [true, false]) {
    const html = R.h(R.SlotCard, { code: 'B1-P03-S6', status: 'VACANT', decode: R.cardDecode(puzzleSlot), slotType: 'SEDAN', compact, heightM: 2, lengthM: 5 });
    assert.doesNotMatch(html, /Level\s*\d/i, 'no Level band');
    assert.doesNotMatch(html, /Pallet/i, 'no pallet text');
    assert.doesNotMatch(html, /Puzzle\s*\d/i, 'no "Puzzle 03" line');
    assert.doesNotMatch(html, /pf-slot-band-end|pf-slot-decode/);
    assert.match(html, /B1-P03-S6/, 'the slot code is still there');
  }
  // data is not touched: the slot modal's own decode still knows the pallet (finding 8, PM), the card just doesn't ask for it
  assert.equal(R.decodeSlot(puzzleSlot), 'Puzzle 03 · Pallet 6');
  assert.equal(R.cardDecode({ slotNumber: 'G-14', parkingType: 'GROUND' }), 'Ground · Bay 14');
});

test('AC-25 the Puzzle-wise view keeps its stacker header with "n slots", not "n pallets"', () => {
  const t = src('src/screens/LiveParking/PuzzleView.tsx');
  assert.match(t, /Puzzle stacker <SlotCode code=\{m\.id\} \/>/, 'stacker id stays');
  assert.match(t, /\{pallets\.length\} slots<\/span>/);
  assert.doesNotMatch(t, /pallets ·|top level first<|\} pallets/, 'no "n pallets" in the header');
});

test('AC-25 static: no level reaches a card from the Live parking views, the preview or the styles', () => {
  for (const f of ['src/screens/LiveParking/PuzzleView.tsx', 'src/screens/LiveParking/SlotsView.tsx']) {
    const t = src(f);
    assert.doesNotMatch(t, /level=\{|palletLevelOf\(/, f + ': no level on a card');
    assert.match(t, /cardDecode\([a-z]+\)/, f + ': cards use cardDecode');
    assert.doesNotMatch(t, /decodeSlot\(/, f + ': no pallet-aware decode on a card');
  }
  assert.doesNotMatch(src('src/design-system/components/SlotCard.tsx'), /Level \{|level\?:|band-end/);
  assert.doesNotMatch(src('src/design-system/components.css'), /pf-slot-band-end/);
  assert.doesNotMatch(src('src/design-system/preview/sections57.tsx'), /level=\{|Pallet \d/);
});
