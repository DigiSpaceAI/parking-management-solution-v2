#!/usr/bin/env node
/**
 * lint:styles — keeps the R1 files on the design system (002 tech design T3, K3).
 * Node built-ins only. Fails (exit 1) on:
 *   - inline styles, in every form we know of (05 round 1, M-3):
 *       JSX `style={{…}}` / `style = { { … } }` unless every key is a `--pf-*` custom property
 *       (the one allowed form, for data values such as a bar height); any non-literal `style={…}`;
 *       `style:` keys in object literals (createElement props, spread props, plain objects) with the
 *       same `--pf-*` rule; `{ style }` shorthand; HTML `style=` attributes in any letter case;
 *       DOM writes: `.style.x =`, `.style[…]`, `.style =`, `.style.cssText`, `Object.assign(el.style…)`,
 *       `setAttribute('style', …)`, `.style.setProperty()` of anything but `--pf-*`
 *   - colour literals outside the generated token files: #hex, rgb()/rgba()/hsl()/hsla(),
 *       oklch()/oklab()/lab()/lch()/hwb()/color-mix()/color(), the 148 CSS named colours in CSS
 *       declarations (and HTML <style> blocks), in colour attributes (fill/stroke/color/stop-color/…)
 *       and as bare string literals in code
 *   - arbitrary Tailwind values (`-[…]`), arbitrary properties (`[color:red]`) and the Tailwind 4
 *       variable shorthand (`p-(--x)`) — any of them lets a non-token value through (R2-1)
 *   - Tailwind defaults that are not tokens (K3 step 1): colours (text-rose-600, bg-white, …),
 *       text sizes (text-xs … text-9xl), radii (rounded, rounded-3xl; tokens: sm md lg xl full),
 *       shadows (shadow, shadow-2xl; tokens: 1 2 3 focus-ring), drop-/text-/inset-shadow-* (R2-1), leading-*, tracking-*,
 *       font weights (font-thin … font-black) and font-sans / font-serif; also inside CSS `@apply`
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
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const EXTS = new Set([...CODE_EXTS, '.css', '.html']);
/** The only components allowed to use mono type. */
const MONO_OK = new Set(['PlateText.tsx', 'SlotCode.tsx', 'IdText.tsx']);

const tokens = JSON.parse(readFileSync(join(ROOT, 'src/design-system/tokens.json'), 'utf8'));
const TOKEN_COLOURS = new Set(tokens.color.tokens.map((c) => c.name));
/** Tailwind radius / shadow values that exist because tokens.json defines them (theme.css), plus "none". */
const RADIUS_OK = new Set([...tokens.radius.tokens.map((t) => t.name.replace(/^radius-/, '')), 'none']);
const SHADOW_OK = new Set([...tokens.shadow.tokens.map((t) => t.name.replace(/^shadow-/, '')), 'focus-ring', 'none']);
const TW_PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black';
const COLOUR_UTIL = new RegExp(String.raw`(?<![\w-])(?:[a-z0-9]+:)*(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|outline|divide|fill|stroke|from|via|to|placeholder|accent|caret|decoration|shadow)-((?:${TW_PALETTE})(?:-\d{2,3})?)(?:\/\d+)?(?![\w-])`, 'g');
const TW_TEXT_SIZE = /(?<![\w-])(?:[a-z0-9]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g;
const TW_ROUNDED = /(?<![\w-])(?:[a-z0-9]+:)*rounded(?:-(?:tl|tr|br|bl|ss|se|es|ee|[trblse]))?-([a-z0-9]+)(?![\w-])/g;
const TW_SHADOW = /(?<![\w-])(?:[a-z0-9]+:)*shadow-([a-z0-9-]+?)(?:\/\d+)?(?![\w-])/g;
const TW_LEADING_TRACKING = /(?<![\w-])(?:[a-z0-9]+:)*(?:leading|tracking)-[a-z0-9.]+(?![\w-])/g;
const TW_FONT_DEFAULT = /(?<![\w-])(?:[a-z0-9]+:)*font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|sans|serif)(?![\w-])/g;
/** Bare `rounded` / `shadow` (Tailwind's default radius / shadow) — only inside class strings, since they are English words. */
const CLASS_STRING = /\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*[`'"]([^`'"]*)[`'"]\s*\})/g;
const TW_BARE = /(?<![\w-])(?:[a-z0-9]+:)*(rounded|shadow|drop-shadow|text-shadow|inset-shadow)(?![\w-])/g;
const ARBITRARY = /(?<![\w-])(?:[a-z0-9]+:)*[a-z][\w-]*-\[[^\]\s]+\]/g;
/** Tailwind 4 arbitrary properties `[color:red]` / `hover:![border-radius:7px]` (05 round 2, R2-1). No whitespace inside,
 *  so a TypeScript index signature `[key: string]` is not mistaken for one. */
const ARBITRARY_PROP = /(?<![\w-])(?:[a-z0-9-]+:)*!?\[[a-z][a-z-]*:[^\]\s]+\]/g;
/** Tailwind 4 CSS-variable shorthand `p-(--x)`, `bg-(--brand)`: any value, so it bypasses every token rule (R2-1). */
const VAR_SHORTHAND = /(?<![\w-])(?:[a-z0-9-]+:)*!?[a-z][\w-]*-\(--[\w-]+\)/g;
/** drop-shadow-*, text-shadow-*, inset-shadow-* (Tailwind 4.x defaults): tokens.json defines only box shadows (R2-1). */
const TW_OTHER_SHADOW = /(?<![\w-])(?:[a-z0-9-]+:)*!?((?:drop|text|inset)-shadow)(?:-([a-z0-9-]+?))?(?:\/\d+)?(?![\w-])/g;
const HEX = /(?<![\w&%-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const FUNC_COLOUR = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix|color)\(/g;
const MONO = /(?<![\w-])(?:font-mono|pf-mono)(?![\w-])/g;
/** The 148 CSS named colours (CSS Color 4). transparent / currentColor / inherit are fine and not in the list. */
const NAMED_COLOURS = ('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown '
  + 'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod '
  + 'darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen '
  + 'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue '
  + 'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew '
  + 'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan '
  + 'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray '
  + 'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid '
  + 'mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream '
  + 'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen '
  + 'paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown '
  + 'royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow '
  + 'springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' ');
const NAMED_ALT = NAMED_COLOURS.join('|');
const NAMED_WORD = new RegExp(String.raw`(?<![\w-])(?:${NAMED_ALT})(?![\w-])`, 'gi');
const NAMED_ATTR = new RegExp(String.raw`\b(?:fill|stroke|color|stop-?color|flood-?color|lighting-?color|bgcolor)\s*=\s*\{?\s*["'\`]\s*(?:${NAMED_ALT})\s*["'\`]`, 'gi');
const NAMED_STRING = new RegExp(String.raw`["'\`](?:${NAMED_ALT})["'\`]`, 'gi');
/** CSS declarations: property: value; (value scanned for named colours). */
const CSS_DECL = /([\w-]+)\s*:\s*([^;{}]*)(?=[;}])/g;

/**
 * Strip comments so documentation can mention the forbidden things.
 * Code files go through a small scanner that knows string and template literals (05 round 2, R2-2):
 * a `//` or `/*` inside "a//b", 'x', `…` or src="//cdn…" is text, not a comment, so the rest of the
 * line is still checked. ' and " strings end at the line end (JS strings can't span lines), so a stray
 * apostrophe in JSX text can only make the scanner keep more text, never hide code. A `//` right after
 * `:` (a URL in JSX text, "https://…") is not treated as a comment either.
 */
function stripCodeComments(t) {
  let out = '';
  let quote = null; // ', " or `
  for (let i = 0; i < t.length; ) {
    const c = t[i];
    const d = t[i + 1];
    if (quote) {
      if (c === '\\') { out += c + (d ?? ''); i += 2; continue; }
      if (c === '\n' && quote !== '`') quote = null;
      else if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '/' && d === '/' && t[i - 1] !== ':') {
      let j = t.indexOf('\n', i);
      if (j < 0) j = t.length;
      out += ' '.repeat(j - i); i = j; continue;
    }
    if (c === '/' && d === '*') {
      let j = t.indexOf('*/', i + 2);
      j = j < 0 ? t.length : j + 2;
      out += t.slice(i, j).replace(/[^\n]/g, ' '); i = j; continue;
    }
    out += c; i++;
  }
  return out;
}

function stripComments(text, ext) {
  if (CODE_EXTS.has(ext)) return stripCodeComments(text);
  let t = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (ext === '.html') t = t.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  return t;
}
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

/** Literal style objects — JSX `style={{…}}` (any spacing) and `style: {…}` keys in object literals —
 *  are allowed only when every key is a quoted '--pf-…' custom property and nothing is spread in. */
function styleObjectProblems(text) {
  const out = [];
  const re = /\bstyle\s*(?:=\s*\{\s*|:\s*)\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 1, i = m.index + m[0].length;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
    }
    const body = text.slice(m.index + m[0].length, i - 1);
    const keys = [...body.matchAll(/(?:^|,)\s*(['"]?)([\w-]+)\1\s*:/g)].map((k) => k[2]);
    const ok = keys.length > 0 && keys.every((k) => k.startsWith('--pf-')) && !/\.\.\./.test(body);
    if (!ok) out.push({ idx: m.index, msg: `inline style (only { '--pf-…': value } is allowed): ${m[0]}${body.trim().slice(0, 60)}}` });
  }
  return out;
}

/** Tailwind defaults that are not tokens (K3) in one piece of class-bearing text. */
function tailwindProblems(t, add, offset = 0) {
  for (const m of t.matchAll(ARBITRARY)) add(offset + m.index, `arbitrary Tailwind value ${m[0]}`);
  for (const m of t.matchAll(ARBITRARY_PROP)) add(offset + m.index, `arbitrary Tailwind property ${m[0]} (use a token class)`);
  for (const m of t.matchAll(VAR_SHORTHAND)) add(offset + m.index, `Tailwind variable shorthand ${m[0]} (use a token class)`);
  for (const m of t.matchAll(TW_OTHER_SHADOW)) if (m[2] && m[2] !== 'none' && !TOKEN_COLOURS.has(m[2])) add(offset + m.index, `Tailwind default ${m[0]} (tokens define box shadows only: shadow-1/2/3)`);
  for (const m of t.matchAll(COLOUR_UTIL)) if (!TOKEN_COLOURS.has(m[1])) add(offset + m.index, `non-token colour class ${m[0]}`);
  for (const m of t.matchAll(TW_TEXT_SIZE)) add(offset + m.index, `Tailwind default text size ${m[0]} (use a type token, e.g. text-body)`);
  for (const m of t.matchAll(TW_ROUNDED)) if (!RADIUS_OK.has(m[1])) add(offset + m.index, `Tailwind default radius ${m[0]} (tokens: rounded-${[...RADIUS_OK].join('/')})`);
  for (const m of t.matchAll(TW_SHADOW)) if (!SHADOW_OK.has(m[1]) && !TOKEN_COLOURS.has(m[1])) add(offset + m.index, `Tailwind default shadow ${m[0]} (tokens: shadow-1/2/3)`);
  for (const m of t.matchAll(TW_LEADING_TRACKING)) add(offset + m.index, `Tailwind default ${m[0]} (line height and tracking come with the type token)`);
  for (const m of t.matchAll(TW_FONT_DEFAULT)) add(offset + m.index, `Tailwind default ${m[0]} (use a type token or font-display/font-text)`);
}

/** Named colours inside CSS declarations (property: value). Quoted strings are ignored. */
function cssNamedColourProblems(css, add, offset = 0) {
  for (const d of css.matchAll(CSS_DECL)) {
    const value = d[2].replace(/(["'])(?:\\.|(?!\1).)*\1/g, (q) => ' '.repeat(q.length));
    const valueStart = d.index + d[0].length - d[2].length;
    for (const m of value.matchAll(NAMED_WORD)) add(offset + valueStart + m.index, `named colour "${m[0]}" in ${d[1]} (use a colour token)`);
  }
}

export function checkText(file, text) {
  const ext = extname(file);
  const t = stripComments(text, ext);
  const problems = [];
  const add = (idx, msg) => problems.push(`${file}:${lineOf(t, idx)}  ${msg}`);
  const code = CODE_EXTS.has(ext);

  // Inline styles
  if (code) {
    for (const p of styleObjectProblems(t)) add(p.idx, p.msg);
    for (const m of t.matchAll(/\bstyle\s*=\s*\{(?!\s*\{)/g)) add(m.index, "style={…} must be the literal { '--pf-…': value } form so it can be checked");
    for (const m of t.matchAll(/\bstyle\s*:\s*(?![\s{])/g)) add(m.index, "style: <expression> must be the literal { '--pf-…': value } form so it can be checked");
    for (const m of t.matchAll(/[{,]\s*style\s*(?=[,}])/g)) add(m.index, '`{ style }` shorthand passes an unchecked style object');
    const DOM_STYLE = /\.style\s*\.\s*(?!setProperty\b)[a-zA-Z]+\s*=(?!=)|\.style\s*\[|\.style\s*=(?!=)|\.style\s*\.\s*cssText\b|\.style\s*\.\s*setProperty\(\s*['"`](?!--pf-)|Object\.assign\(\s*[\w.$]+\.style\b|setAttribute\(\s*['"`]style['"`]/g;
    for (const m of t.matchAll(DOM_STYLE)) add(m.index, 'script sets an inline style (only .style.setProperty(\'--pf-…\', v) is allowed)');
  }
  if (ext === '.html') for (const m of t.matchAll(/\sstyle\s*=/gi)) add(m.index, 'inline style attribute in HTML');

  // Colour literals
  for (const m of t.matchAll(HEX)) add(m.index, `colour literal ${m[0]} (use a colour token)`);
  for (const m of t.matchAll(FUNC_COLOUR)) add(m.index, `colour literal ${m[0]}…) (use a colour token)`);
  for (const m of t.matchAll(NAMED_ATTR)) add(m.index, `named colour in an attribute: ${m[0]} (use currentColor or a token)`);
  if (ext === '.css') cssNamedColourProblems(t, add);
  if (ext === '.html') for (const m of t.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) cssNamedColourProblems(m[1], add, m.index + m[0].indexOf('>') + 1);
  if (code) for (const m of t.matchAll(NAMED_STRING)) add(m.index, `named colour string ${m[0]} (use a colour token)`);

  // Tailwind defaults (K3) and mono
  if (ext === '.css') {
    for (const m of t.matchAll(/@apply\s+([^;]+);/g)) tailwindProblems(m[1], add, m.index + m[0].indexOf(m[1]));
  } else {
    tailwindProblems(t, add);
    for (const c of t.matchAll(CLASS_STRING)) {
      const cls = c[1] ?? c[2] ?? c[3] ?? '';
      const start = c.index + c[0].indexOf(cls);
      for (const m of cls.matchAll(TW_BARE)) add(start + m.index, `Tailwind default ${m[0]} (use rounded-md / shadow-1 …)`);
    }
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
    // inline styles (original)
    ['x/Bad.tsx', 'export const A = () => <div style={{ color: "red" }} />;', /inline style/],
    ['x/Bad.tsx', 'export const A = () => <div style={{ "--pf-w": "40%", width: 3 }} />;', /inline style/],
    ['x/Ok.tsx', 'export const A = () => <div style={{ "--pf-w": "40%" } as React.CSSProperties} />;', null],
    ['x/Bad.tsx', 'const a = <p style={cond ? { color: "red" } : undefined} />;', /must be the literal/],
    ['x/bad.html', '<p style="color: var(--ink)">x</p>', /inline style attribute/],
    ['x/bad.js', 'el.style.color = "red";', /inline style/],
    ['x/ok.js', "el.style.setProperty('--pf-occ', '40%');", null],
    // inline-style bypasses from 05 round 1, M-3
    ['x/Bad.tsx', 'const a = <div style = { { width: 3 } } />;', /inline style/],
    ['x/Bad.tsx', 'const a = <div style={ {width: 3} } />;', /inline style/],
    ['x/bad.html', '<p STYLE="width: 3px">x</p>', /inline style attribute/],
    ['x/bad.html', '<p Style=width:3px>x</p>', /inline style attribute/],
    ['x/Bad.jsx', 'const a = <div style={{ width: 3 }} />;', /inline style/],
    ['x/Bad.tsx', 'const s = { width: 3 }; const a = <div {...{ style: s }} />;', /style: <expression>/],
    ['x/Bad.tsx', 'const a = React.createElement("div", { style: { width: 3 } });', /inline style/],
    ['x/bad.ts', 'export const props = { className: "x", style: { color: "var(--ink)" } };', /inline style/],
    ['x/Bad.tsx', 'const style = { width: 3 }; const a = <div {...{ style }} />;', /shorthand/],
    ['x/bad.js', 'el.setAttribute("style", "width:3px");', /inline style/],
    ['x/bad.js', "el.style['color'] = 'var(--ink)';", /inline style/],
    ['x/bad.js', 'el.style.cssText = "width:3px";', /inline style/],
    ['x/bad.js', 'Object.assign(el.style, { width: "3px" });', /inline style/],
    ['x/bad.js', "el.style.setProperty('width', '3px');", /inline style/],
    ['x/ok.ts', 'export const s = { "--pf-occ": "40%" }; const o = { style: { "--pf-w": "3px" } };', null],
    // colour literals (original)
    ['x/bad.css', '.a { color: #ff0000; }', /colour literal #ff0000/],
    ['x/bad.css', '.a { color: rgb(1,2,3); }', /colour literal rgb/],
    ['x/ok.css', '.a { color: var(--ink); } /* #fff in a comment is fine */', null],
    // colour bypasses from M-3
    ['x/bad.css', '.a { color: red; }', /named colour "red"/],
    ['x/bad.css', '.a { border: 1px solid WhiteSmoke; }', /named colour/],
    ['x/bad.css', '.a { color: oklch(0.6 0.1 250); }', /colour literal oklch/],
    ['x/bad.css', '.a { color: color-mix(in srgb, var(--ink) 50%, var(--surface-0)); }', /colour literal color-mix/],
    ['x/bad.css', '.a { color: lab(50% 20 30); }', /colour literal lab/],
    ['x/bad.html', '<style>.a { background: navy }</style>', /named colour "navy"/],
    ['x/bad.html', '<svg><path fill="red" d="M0 0"/></svg>', /named colour in an attribute/],
    ['x/Bad.tsx', 'const a = <path stroke="black" />;', /named colour in an attribute/],
    ['x/Bad.tsx', "const a = <stop stopColor={'white'} />;", /named colour in an attribute/],
    ['x/bad.ts', "export const SERIES = ['tomato', 'var(--ink)'];", /named colour string/],
    ['x/ok.css', '.a { color: var(--navy-600); background: transparent; border-color: currentColor; }', null],
    ['x/ok.css', '.a:hover, .b:focus-visible { white-space: nowrap; content: "red"; }', null],
    ['x/Ok.tsx', 'const a = <p>Reserved bays are shown in amber on the floor plan.</p>;', null],
    // Tailwind defaults (original)
    ['x/Bad.tsx', 'const a = <p className="text-rose-600" />;', /non-token colour class/],
    ['x/Bad.tsx', 'const a = <p className="bg-white" />;', /non-token colour class/],
    ['x/Ok.tsx', 'const a = <p className="bg-navy-600 text-success-700 p-4 text-title-1" />;', null],
    ['x/Bad.tsx', 'const a = <p className="text-[10px]" />;', /arbitrary Tailwind value/],
    ['x/Bad.tsx', 'const a = <p className="text-xs" />;', /default text size/],
    ['x/Bad.tsx', 'const a = <p className="font-mono" />;', /outside PlateText/],
    ['x/PlateText.tsx', 'const a = <p className="pf-mono" />;', null],
    // K3 bypasses from M-3
    ['x/Bad.tsx', 'const a = <p className="rounded-3xl" />;', /default radius rounded-3xl/],
    ['x/Bad.tsx', 'const a = <p className="md:rounded-t-2xl" />;', /default radius/],
    ['x/Bad.tsx', 'const a = <p className="rounded" />;', /Tailwind default rounded/],
    ['x/Bad.tsx', 'const a = <p className="shadow-2xl" />;', /default shadow shadow-2xl/],
    ['x/Bad.tsx', 'const a = <p className="shadow" />;', /Tailwind default shadow/],
    ['x/Bad.tsx', 'const a = <p className="leading-7" />;', /leading-7/],
    ['x/Bad.tsx', 'const a = <p className="tracking-widest" />;', /tracking-widest/],
    ['x/Bad.tsx', 'const a = <p className="font-semibold" />;', /font-semibold/],
    ['x/Bad.tsx', 'const a = <p className="font-sans" />;', /font-sans/],
    ['x/bad.css', '.a { @apply rounded-3xl shadow-2xl; }', /default radius/],
    ['x/Ok.tsx', 'const a = <p className="rounded-md rounded-t-lg rounded-full shadow-1 shadow-3 shadow-none font-display font-text" />;', null],
    ['x/Ok.tsx', 'const a = <p>A rounded card with a soft shadow, leading the way.</p>;', null],
    // R2-1 (05 round 2): Tailwind 4 escape hatches
    ['x/Bad.tsx', 'const a = <p className="[color:red]" />;', /arbitrary Tailwind property/],
    ['x/Bad.tsx', 'const a = <p className="hover:![border-radius:7px]" />;', /arbitrary Tailwind property/],
    ['x/Bad.tsx', 'const a = <p className="p-(--x)" />;', /variable shorthand p-\(--x\)/],
    ['x/Bad.tsx', 'const a = <p className="md:bg-(--brand)" />;', /variable shorthand/],
    ['x/Bad.tsx', 'const a = <p className="drop-shadow-lg" />;', /Tailwind default drop-shadow-lg/],
    ['x/Bad.tsx', 'const a = <p className="text-shadow-md" />;', /Tailwind default text-shadow-md/],
    ['x/Bad.tsx', 'const a = <p className="inset-shadow-sm" />;', /Tailwind default inset-shadow-sm/],
    ['x/Bad.tsx', 'const a = <p className="drop-shadow" />;', /Tailwind default drop-shadow/],
    ['x/bad.html', '<p class="[color:red] p-(--x)">x</p>', /arbitrary Tailwind property/],
    ['x/Ok.tsx', 'const a = <p className="drop-shadow-none text-shadow-none" />; interface M { [key: string]: number }', null],
    // R2-2 (05 round 2): // and /* inside strings are not comments
    ['x/Bad.tsx', 'const u = "a//b"; const a = <p style={{ color: "red" }} className="text-rose-600" />;', /inline style/],
    ['x/Bad.tsx', 'const u = "a//b"; const a = <p className="text-rose-600" />;', /non-token colour class/],
    ['x/Bad.tsx', "const u = 'x/*y'; const a = <p className=\"text-rose-600\" />; const v = '*/';", /non-token colour class/],
    ['x/Bad.tsx', 'const a = <img src="//cdn.example/x.png" className="text-rose-600" />;', /non-token colour class/],
    ['x/Bad.tsx', 'const t = `a//b ${x}`; const a = <p className="rounded-3xl" />;', /default radius/],
    ['x/Ok.tsx', 'const a = 1; // a comment may mention text-rose-600 and style={{ color: "red" }}', null],
    ['x/Ok.tsx', 'const a = 1; /* block comment: #ff0000 rounded-3xl */ const b = 2;', null],
    ['x/Ok.tsx', 'const a = <a href="https://example.com/x">Docs</a>;', null],
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
