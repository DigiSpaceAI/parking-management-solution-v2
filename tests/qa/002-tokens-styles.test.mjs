// 002 QA, R1-pre T1–T3: token pipeline and lint:styles (AC-01, AC-02).
// Written by qa-engineer (06-test-report.md, tests/qa/002/), adopted on feature/002-design-system by frontend-dev in
// round 2: the R2-1/R2-2 probes that were pinned as expected misses are now caught and live in SEEDED below.
// Runs with `npm run test:qa` (node:test, Node built-ins only). Every mutation happens in a
// temporary copy of scripts/ + src/design-system/ (+ a seeded file); the repo is never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root: the nearest folder above this file with a package.json (works from tests/qa/ or tests/qa/002/). */
function findRoot(dir) { while (!existsSync(join(dir, 'package.json'))) { const up = dirname(dir); if (up === dir) throw new Error('no package.json'); dir = up; } return dir; }
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));

/** A throwaway copy with the layout the two scripts expect (ROOT = scripts/..). */
function tempCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'pf-qa-002-'));
  cpSync(join(ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true });
  cpSync(join(ROOT, 'src', 'design-system'), join(dir, 'src', 'design-system'), { recursive: true });
  cpSync(join(ROOT, 'src', 'utils', 'format.ts'), join(dir, 'src', 'utils', 'format.ts'));
  return dir;
}
const run = (dir, script, ...args) => spawnSync(process.execPath, [join(dir, 'scripts', script), ...args], { encoding: 'utf8' });

// ---------- T1/T2 tokens ----------

test('tokens --check passes on the committed files', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-tokens.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test('tokens --check detects drift: tokens.json edited but not regenerated', (t) => {
  const dir = tempCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = join(dir, 'src/design-system/tokens.json');
  const json = JSON.parse(readFileSync(f, 'utf8'));
  json.color.tokens[0].value = '#000001';
  writeFileSync(f, JSON.stringify(json, null, 2));
  const r = run(dir, 'build-tokens.mjs', '--check');
  assert.equal(r.status, 1, 'stale generated files must fail the check');
  // regenerating fixes it
  assert.equal(run(dir, 'build-tokens.mjs').status, 0);
  assert.equal(run(dir, 'build-tokens.mjs', '--check').status, 0);
  assert.match(readFileSync(join(dir, 'src/design-system/tokens.css'), 'utf8'), /#000001/);
});

test('tokens --check detects a hand edit of tokens.css and of theme.css', (t) => {
  for (const file of ['tokens.css', 'theme.css']) {
    const dir = tempCopy();
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const f = join(dir, 'src/design-system', file);
    writeFileSync(f, readFileSync(f, 'utf8').replace(/: #[0-9a-f]{6};/, ': #123456;'));
    assert.equal(run(dir, 'build-tokens.mjs', '--check').status, 1, `${file} hand edit not detected`);
  }
});

test('theme.css has no Tailwind default reset in R1 (K3 step 1)', () => {
  const css = readFileSync(join(ROOT, 'src/design-system/theme.css'), 'utf8');
  assert.match(css, /@theme\s*\{/);
  assert.doesNotMatch(css, /--[\w*-]*\*\s*:\s*initial/, 'no `--*: initial` / `--color-*: initial` reset');
  assert.doesNotMatch(css, /:\s*initial\s*;/);
});

test('reduced motion sets every duration token to 0ms', () => {
  const css = readFileSync(join(ROOT, 'src/design-system/tokens.css'), 'utf8');
  const durations = [...css.matchAll(/^\s*(--duration-[\w-]+)\s*:/gm)].map((m) => m[1]);
  assert.ok(durations.length > 0, 'duration tokens exist');
  const block = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css);
  assert.ok(block, 'reduce-motion block present');
  for (const d of new Set(durations)) assert.match(block[1], new RegExp(`${d}:\\s*0ms;`), `${d} → 0ms`);
});

// ---------- T3 lint:styles ----------

test('lint:styles self-test passes and the R1 files are clean', () => {
  const s = spawnSync(process.execPath, [join(ROOT, 'scripts/check-styles.mjs'), '--self-test'], { encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr);
  assert.match(s.stdout, /(\d+)\/\1 cases behave as expected/);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/check-styles.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /R1 file\(s\) clean/);
});

/** One seeded sample per rule; each must be reported (by line) when placed in an R1 folder. */
const SEEDED = {
  'src/design-system/components/QaSeeded.tsx': [
    ['jsx inline style', 'const a = <div style={{ color: "var(--ink)" }} />;', /inline style \(only/],
    ['style expression', 'const b = <div style={s} />;', /style=\{…\} must be the literal/],
    ['style: expression key', 'const c = React.createElement("div", { style: s });', /style: <expression>/],
    ['style shorthand', 'const d = <div {...{ style }} />;', /shorthand/],
    ['DOM style write', 'el.style.width = "3px";', /script sets an inline style/],
    ['hex colour', 'const e = "#ff0000";', /colour literal #ff0000/],
    ['functional colour', 'const f = "rgb(1, 2, 3)";', /colour literal rgb/],
    ['named colour attribute', 'const g = <path fill="red" />;', /named colour in an attribute/],
    ['named colour string', "const h = ['tomato'];", /named colour string/],
    ['arbitrary value', 'const i = <p className="w-[37px]" />;', /arbitrary Tailwind value/],
    ['non-token colour util', 'const j = <p className="text-rose-600" />;', /non-token colour class/],
    ['default text size', 'const k = <p className="text-sm" />;', /default text size/],
    ['default radius', 'const l = <p className="rounded-2xl" />;', /default radius/],
    ['bare rounded', 'const m = <p className="rounded" />;', /Tailwind default rounded/],
    ['default shadow', 'const n = <p className="shadow-lg" />;', /default shadow/],
    ['bare shadow', 'const o = <p className="shadow" />;', /Tailwind default shadow/],
    ['leading', 'const p = <p className="leading-6" />;', /leading-6/],
    ['tracking', 'const q = <p className="tracking-tight" />;', /tracking-tight/],
    ['font weight default', 'const r = <p className="font-bold" />;', /font-bold/],
    ['mono outside data components', 'const u = <p className="font-mono" />;', /outside PlateText/],
    // Formerly pinned as known misses (05 round 2, R2-1 / R2-2); caught since the round-2 fix.
    ['R2-1 arbitrary property', 'const v = <p className="[color:red]" />;', /arbitrary Tailwind property/],
    ['R2-1 arbitrary property radius', 'const w = <p className="[border-radius:7px]" />;', /arbitrary Tailwind property/],
    ['R2-1 TW4 var shorthand', 'const x = <p className="p-(--x) bg-(--brand)" />;', /variable shorthand/],
    ['R2-1 drop-shadow default', 'const y = <p className="drop-shadow-lg" />;', /Tailwind default drop-shadow-lg/],
    ['R2-1 text-shadow default', 'const z = <p className="text-shadow-md" />;', /Tailwind default text-shadow-md/],
    ['R2-1 inset-shadow default', 'const aa = <p className="inset-shadow-sm" />;', /Tailwind default inset-shadow-sm/],
    ['R2-2 // inside a string', 'const u = "a//b"; const ab = <p style={{ color: "red" }} className="text-rose-600" />;', /inline style \(only|non-token colour class/],
  ],
  'src/design-system/qa-seeded.css': [
    ['css hex', '.a { color: #abcdef; }', /colour literal #abcdef/],
    ['css named', '.b { background: navy; }', /named colour "navy"/],
    ['css oklch', '.c { color: oklch(0.6 0.1 250); }', /colour literal oklch/],
    ['@apply default', '.d { @apply rounded-3xl; }', /default radius/],
  ],
  'marketing/qa-seeded.html': [
    ['html style attr', '<p style="width:3px">x</p>', /inline style attribute/],
    ['html <style> named', '<style>.a { color: red }</style>', /named colour "red"/],
    ['html svg named fill', '<svg><path fill="black" d="M0 0"/></svg>', /named colour in an attribute/],
    ['html default class', '<p class="text-xs bg-white">x</p>', /default text size/],
  ],
  'marketing/qa-seeded.js': [
    ['DOM cssText', 'el.style.cssText = "a";', /script sets an inline style/],
    ['setAttribute style', 'el.setAttribute("style", "a");', /script sets an inline style/],
    ['setProperty non --pf', "el.style.setProperty('width', '1px');", /script sets an inline style/],
  ],
};

test('a seeded file in a temporary copy trips every rule (exit 1, each line reported)', (t) => {
  const dir = tempCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'marketing'), { recursive: true });
  for (const [file, cases] of Object.entries(SEEDED)) writeFileSync(join(dir, file), cases.map((c) => c[1]).join('\n') + '\n');
  const r = run(dir, 'check-styles.mjs');
  assert.equal(r.status, 1, 'seeded files must fail the gate');
  const lines = r.stderr.split('\n');
  for (const [file, cases] of Object.entries(SEEDED)) {
    cases.forEach(([name, , expect], i) => {
      const hit = lines.some((l) => l.startsWith(`${file}:${i + 1} `) && expect.test(l));
      assert.ok(hit, `rule not reported: ${name} (${file}:${i + 1})`);
    });
  }
  // and without the seeded files the copy is clean again
  for (const file of Object.keys(SEEDED)) rmSync(join(dir, file));
  assert.equal(run(dir, 'check-styles.mjs').status, 0);
});
