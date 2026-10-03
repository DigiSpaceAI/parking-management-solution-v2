#!/usr/bin/env node
/**
 * lint:styles — keeps the R1 files on the design system (002 tech design T3, K3).
 * Node built-ins only. Fails (exit 1) on:
 *   - inline styles: `style={{` in TSX, unless every key is a `--pf-*` custom
 *     property (the one allowed form, for data values such as a bar height);
 *     any `style="…"` attribute in marketing HTML
 *   - colour literals (#hex, rgb(), rgba(), hsl()) outside the generated token files
 *   - arbitrary Tailwind values (`-[…]`)
 *   - Tailwind colours that are not tokens (text-rose-600, bg-white, …) and
 *     Tailwind's default text sizes (text-xs … text-9xl) — K3 step 1
 *   - `font-mono` / `pf-mono` outside the data-text components (PlateText,
 *     SlotCode, IdText) — mono is for plates, slot codes, IDs and times only (AC-22)
 *
 *   npm run lint:styles              check the R1 file list
 *   node scripts/check-styles.mjs --self-test   prove each rule catches a seeded sample
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The R1 file list (03: "grows in R1.1"). Folders that don't exist yet are skipped. */
export const R1_FILES = [
  'src/design-system',     // tokens, fonts, components, preview
  'src/utils/format.ts',
  'src/screens',           // R1 screens (F3–F7), after the 001 merge
  'src/routes.ts',         // F2
  'src/utils/useAutoRefresh.ts',
  'src/utils/slots.ts',
  'marketing',             // parkflows.in (T6)
];
/** Generated or third-party files inside those folders that may hold literal values. */
const SKIP = new Set(['src/design-system/tokens.css', 'src/design-system/theme.css', 'src/design-system/tokens.json']);
const SKIP_DIRS = new Set(['node_modules', 'fonts', 'brand']);
const EXTS = new Set(['.ts', '.tsx', '.css', '.html', '.js', '.mjs']);
/** The only components allowed to use mono type. */
const MONO_OK = new Set(['PlateText.tsx', 'SlotCode.tsx', 'IdText.tsx']);

const tokens = JSON.parse(readFileSync(join(ROOT, 'src/design-system/tokens.json'), 'utf8'));
const TOKEN_COLOURS = new Set(tokens.color.tokens.map((c) => c.name));
const TW_PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black';
const COLOUR_UTIL = new RegExp(String.raw`(?<![\w-])(?:[a-z0-9]+:)*(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|outline|divide|fill|stroke|from|via|to|placeholder|accent|caret|decoration|shadow)-((?:${TW_PALETTE})(?:-\d{2,3})?)(?:\/\d+)?(?![\w-])`, 'g');
const TW_TEXT_SIZE = /(?<![\w-])(?:[a-z0-9]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g;
const ARBITRARY = /(?<![\w-])(?:[a-z0-9]+:)*[a-z][\w-]*-\[[^\]\s]+\]/g;
const HEX = /(?<![\w&%-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const FUNC_COLOUR = /\b(?:rgba?|hsla?)\(/g;
const MONO = /(?<![\w-])(?:font-mono|pf-mono)(?![\w-])/g;

/** Strip comments so documentation can mention the forbidden things. */
function stripComments(text, ext) {
  let t = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (ext === '.html') t = t.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  if (ext !== '.css' && ext !== '.html') t = t.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/[^\n]/g, ' '));
  return t;
}
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

/** `style={{ … }}` blocks: allowed only when every key is a quoted '--pf-…' custom property. */
function inlineStyleProblems(text) {
  const out = [];
  const re = /style=\{\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 2, i = m.index + m[0].length;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
    }
    const body = text.slice(m.index + m[0].length, i - 2);
    const keys = [...body.matchAll(/(?:^|,)\s*(['"]?)([\w-]+)\1\s*:/g)].map((k) => k[2]);
    const ok = keys.length > 0 && keys.every((k) => k.startsWith('--pf-')) && !/\.\.\./.test(body);
    if (!ok) out.push({ idx: m.index, msg: `inline style (only { '--pf-…': value } is allowed): style={{${body.trim().slice(0, 60)}}}` });
  }
  return out;
}

export function checkText(file, text) {
  const ext = extname(file);
  const t = stripComments(text, ext);
  const problems = [];
  const add = (idx, msg) => problems.push(`${file}:${lineOf(t, idx)}  ${msg}`);
  if (ext === '.tsx' || ext === '.ts' || ext === '.js' || ext === '.mjs') for (const p of inlineStyleProblems(t)) add(p.idx, p.msg);
  if (ext === '.html') for (const m of t.matchAll(/\sstyle\s*=\s*["']/g)) add(m.index, 'inline style attribute in HTML');
  if (ext === '.tsx' || ext === '.jsx') for (const m of t.matchAll(/\bstyle=\{(?!\{)/g)) add(m.index, 'style={…} must be the literal { \'--pf-…\': value } form so it can be checked');
  if (ext === '.tsx' || ext === '.html') {
    // React's `style` objects are caught above; this catches `.style.x = …` in scripts.
  }
  if (ext === '.js' || ext === '.mjs') for (const m of t.matchAll(/\.style\.(?!setProperty\(\s*['"]--pf-)[a-zA-Z]+\s*=|\.style\.setProperty\(\s*['"](?!--pf-)/g)) add(m.index, 'script sets an inline style (only --pf-* custom properties are allowed)');
  for (const m of t.matchAll(HEX)) add(m.index, `colour literal ${m[0]} (use a colour token)`);
  for (const m of t.matchAll(FUNC_COLOUR)) add(m.index, `colour literal ${m[0]}…) (use a colour token)`);
  if (ext !== '.css') {
    for (const m of t.matchAll(ARBITRARY)) add(m.index, `arbitrary Tailwind value ${m[0]}`);
    for (const m of t.matchAll(COLOUR_UTIL)) if (!TOKEN_COLOURS.has(m[1])) add(m.index, `non-token colour class ${m[0]}`);
    for (const m of t.matchAll(TW_TEXT_SIZE)) add(m.index, `Tailwind default text size ${m[0]} (use a type token, e.g. text-body)`);
    if (!MONO_OK.has(basename(file))) for (const m of t.matchAll(MONO)) add(m.index, `${m[0]} outside PlateText/SlotCode/IdText (mono is for data only)`);
  }
  return problems;
}

function walk(rel, files) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(basename(abs))) return;
    for (const name of readdirSync(abs)) walk(join(rel, name), files);
  } else if (EXTS.has(extname(abs)) && !SKIP.has(rel.split('\\').join('/'))) files.push(rel.split('\\').join('/'));
}

function selfTest() {
  const cases = [
    ['x/Bad.tsx', 'export const A = () => <div style={{ color: "red" }} />;', /inline style/],
    ['x/Bad.tsx', 'export const A = () => <div style={{ "--pf-w": "40%", width: 3 }} />;', /inline style/],
    ['x/Ok.tsx', 'export const A = () => <div style={{ "--pf-w": "40%" } as React.CSSProperties} />;', null],
    ['x/Bad.tsx', 'const a = <p style={cond ? { color: "red" } : undefined} />;', /must be the literal/],
    ['x/Bad.tsx', 'const a = <p className="text-rose-600" />;', /non-token colour class/],
    ['x/Bad.tsx', 'const a = <p className="bg-white" />;', /non-token colour class/],
    ['x/Ok.tsx', 'const a = <p className="bg-navy-600 text-success-700 p-4 text-title-1" />;', null],
    ['x/Bad.tsx', 'const a = <p className="text-[10px]" />;', /arbitrary Tailwind value/],
    ['x/Bad.tsx', 'const a = <p className="text-xs" />;', /default text size/],
    ['x/Bad.tsx', 'const a = <p className="font-mono" />;', /outside PlateText/],
    ['x/PlateText.tsx', 'const a = <p className="pf-mono" />;', null],
    ['x/bad.css', '.a { color: #ff0000; }', /colour literal #ff0000/],
    ['x/bad.css', '.a { color: rgb(1,2,3); }', /colour literal rgb/],
    ['x/ok.css', '.a { color: var(--ink); } /* #fff in a comment is fine */', null],
    ['x/bad.html', '<p style="color: var(--ink)">x</p>', /inline style attribute/],
    ['x/bad.js', 'el.style.color = "red";', /inline style/],
    ['x/ok.js', "el.style.setProperty('--pf-occ', '40%');", null],
  ];
  let failed = 0;
  for (const [file, text, expect] of cases) {
    const got = checkText(file, text);
    const pass = expect ? got.some((g) => expect.test(g)) : got.length === 0;
    if (!pass) { failed++; console.error(`self-test FAILED: ${file}: ${text}\n  got: ${JSON.stringify(got)}`); }
  }
  console.log(`self-test: ${cases.length - failed}/${cases.length} cases behave as expected`);
  process.exit(failed ? 1 : 0);
}

if (process.argv.includes('--self-test')) selfTest();
else {
  const files = [];
  for (const rel of R1_FILES) walk(rel, files);
  const problems = files.flatMap((f) => checkText(f, readFileSync(join(ROOT, f), 'utf8')));
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`lint:styles: ${problems.length} problem(s) in ${files.length} R1 file(s)`);
    process.exit(1);
  }
  console.log(`lint:styles: ${files.length} R1 file(s) clean`);
}
