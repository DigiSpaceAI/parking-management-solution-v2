/**
 * TV summary layouts (003 v1.5, PRD US-19/20, AC-39..AC-46; UX boards S1–S8, S11, S12).
 *
 * - Main-gate grid (several basements): one row per basement, one column per vehicle type in the
 *   order the feed sends (never a fixed list: a new type such as Hatchback appears by itself), a
 *   Total column and a Total row (all basements, never a page), word + icon column heads.
 * - One basement: large tiles — "All of Basement B1" and one per type.
 * - Summary + slot cards: the compact version (a tile row, or a small grid) above the cards.
 * - A cell is a free count, "Full" (word + icon + danger colour, never colour alone) or, for a
 *   type a basement doesn't have, a dashed "none here" (not Full, not 0).
 *
 * Plain DOM, ES2015-safe. The structure is rebuilt only when its shape changes (types, rows on the
 * page, mode, size); otherwise a frame only changes text and classes, like the cards (NFR-4).
 * Feed text goes in through textContent only.
 */
import type { SummaryModel } from './app';
import type { FeedLayout, FeedSummaryCell } from './types';
import { groupIndian } from './layout';
import { svgIcon } from './icons';

const TYPE_WORD: { [t: string]: string } = { SUV: 'SUV', CSUV: 'Compact SUV', SEDAN: 'Sedan', HATCHBACK: 'Hatchback', TWO_WHEELER: 'Two-wheeler', EV: 'EV' };
/** UX copy: "Sedan", "Compact SUV", …; an unknown future code still reads as words ("MINI_TRUCK" → "Mini truck"). */
export function typeWord(code: string): string {
  if (TYPE_WORD[code]) return TYPE_WORD[code];
  const w = code.toLowerCase().replace(/_/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}
export function typeIcon(code: string): string {
  const k = 'type-' + code.toLowerCase();
  return k === 'type-sedan' || k === 'type-hatchback' || k === 'type-suv' || k === 'type-csuv' || k === 'type-two_wheeler' || k === 'type-ev' ? k : 'type-sedan';
}
/** "Basement B1" for B-levels, the level's own name otherwise (Ground, Driveway). */
export function levelName(level: string): string {
  return /^B\d+$/.test(level) ? 'Basement ' + level : level;
}
/** The grid's row head: the short code for basements ("B1"), the name otherwise. */
function rowHead(level: string): string {
  return level;
}

/** What one cell shows (UX S1–S3, AC-43; 03 "total: 0 → none here"). */
export type CellState = 'COUNT' | 'FULL' | 'NONE';
export function cellState(c: { free: number; total: number }, full: boolean): CellState {
  if (!(c.total > 0)) return 'NONE';
  return full || c.free <= 0 ? 'FULL' : 'COUNT';
}

/** The number size class for the rows on a page (UX S1–S4): 1–2, 3–4, 5–6; one step smaller under a banner. */
export function sizeClass(rowsOnPage: number, banner: boolean): 'n2' | 'n4' | 'n6' {
  const steps: ('n2' | 'n4' | 'n6')[] = ['n2', 'n4', 'n6'];
  let i = rowsOnPage <= 2 ? 0 : rowsOnPage <= 4 ? 1 : 2;
  if (banner && i < 2) i += 1;
  return steps[i];
}

export type SummaryMode = 'GRID' | 'TILES' | 'COMPACT_GRID' | 'COMPACT_TILES';
export function summaryMode(layout: FeedLayout, allRows: number): SummaryMode {
  if (layout === 'SUMMARY_CARDS') return allRows === 1 ? 'COMPACT_TILES' : 'COMPACT_GRID';
  return allRows === 1 ? 'TILES' : 'GRID';
}

// ---- DOM helpers (as render.ts) --------------------------------------------------------------
function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function add<T extends Node>(parent: Node, child: T): T {
  parent.appendChild(child);
  return child;
}
function text(node: Node, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}
function cls(node: Element, value: string): void {
  if (node.getAttribute('class') !== value) node.setAttribute('class', value);
}
function show(node: Element, on: boolean): void {
  if (on) {
    if (node.hasAttribute('hidden')) node.removeAttribute('hidden');
  } else if (!node.hasAttribute('hidden')) node.setAttribute('hidden', '');
}

/** One count / Full / none-here cell. Built once; each frame sets its state. */
interface Cell {
  root: HTMLElement;
  icon: SVGSVGElement;
  num: HTMLElement;
  word: HTMLElement;
  base: string;
}
function makeCell(tag: string, base: string): Cell {
  const root = el(tag, base);
  // The icon and the number/"Full" stay on one line in every cell shape.
  const val = add(root, el('span', 'tv-sum-val'));
  const icon = add(val, svgIcon('full', 2.5));
  const num = add(val, el('span', 'tv-sum-num'));
  const word = add(root, el('small', 'tv-sum-word'));
  return { root, icon, num, word, base };
}
function fillCell(c: Cell, v: { free: number; total: number }, full: boolean, freeWord: boolean): void {
  const st = cellState(v, full);
  cls(c.root, c.base + (st === 'FULL' ? ' tv-sum-cell--full' : st === 'NONE' ? ' tv-sum-cell--none' : ''));
  show(c.icon, st === 'FULL');
  text(c.num, st === 'COUNT' ? groupIndian(v.free) : st === 'FULL' ? 'Full' : 'none here');
  show(c.word, st === 'COUNT' && freeWord);
  text(c.word, st === 'COUNT' && freeWord ? 'free' : '');
}

function typeHead(tag: string, base: string, code: string): HTMLElement {
  const h = el(tag, base);
  h.appendChild(svgIcon(typeIcon(code), 2));
  add(h, el('span', 'tv-sum-type', typeWord(code)));
  if (tag === 'th') h.setAttribute('scope', 'col');
  return h;
}

export interface SummaryView {
  root: HTMLElement;
  render(s: SummaryModel | null, layout: FeedLayout, banner: boolean): void;
}

export function createSummary(): SummaryView {
  const root = el('section', 'tv-sum');
  root.setAttribute('aria-labelledby', 'tv-sum-caption');
  const caption = add(root, el('h2', 'tv-sum-caption', 'Free slots by basement and vehicle type'));
  caption.id = 'tv-sum-caption';
  const body = add(root, el('div', 'tv-sum-body'));

  let key = '';
  let fill: ((s: SummaryModel) => void) | null = null;

  function build(s: SummaryModel, mode: SummaryMode, size: string): void {
    while (body.firstChild) body.removeChild(body.firstChild);
    if (mode === 'GRID' || mode === 'COMPACT_GRID') {
      const compact = mode === 'COMPACT_GRID';
      // UX decision 1: the compact grid has room for 2 basements; with more it keeps the Total row only.
      const rowsShown = compact && s.rows.length > 2 ? [] : s.rows;
      // Every body row (basements + Total) gets the same height, whatever its cells hold.
      const table = add(body, el('table', 'tv-sum-table ' + (compact ? 'tv-sum-table--compact' : 'tv-sum--' + size + ' tv-sum-rows-' + Math.min(7, rowsShown.length + 1))));
      table.setAttribute('aria-labelledby', 'tv-sum-caption');
      const thead = add(table, el('thead'));
      const hr = add(thead, el('tr'));
      const corner = add(hr, el('th', 'tv-sum-corner', 'Basement'));
      corner.setAttribute('scope', 'col');
      for (let i = 0; i < s.types.length; i++) add(hr, typeHead('th', 'tv-sum-colhead', s.types[i]));
      const tc = add(hr, el('th', 'tv-sum-colhead tv-sum-colhead--total', 'Total'));
      tc.setAttribute('scope', 'col');
      const tbody = add(table, el('tbody'));
      const rowCells: { level: string; cells: Cell[]; total: Cell }[] = [];
      for (let r = 0; r < rowsShown.length; r++) {
        const tr = add(tbody, el('tr'));
        const th = add(tr, el('th', 'tv-sum-rowhead', rowHead(rowsShown[r].level)));
        th.setAttribute('scope', 'row');
        th.setAttribute('aria-label', levelName(rowsShown[r].level));
        const cells: Cell[] = [];
        for (let i = 0; i < s.types.length; i++) {
          const c = makeCell('td', 'tv-sum-cell');
          tr.appendChild(c.root);
          cells.push(c);
        }
        const total = makeCell('td', 'tv-sum-cell tv-sum-cell--sum');
        rowCells.push({ level: rowsShown[r].level, cells: cells, total: total });
        tr.appendChild(total.root);
      }
      const ttr = add(tbody, el('tr', 'tv-sum-totalrow'));
      const tth = add(ttr, el('th', 'tv-sum-rowhead tv-sum-rowhead--total'));
      tth.setAttribute('scope', 'row');
      add(tth, el('span', '', 'Total'));
      const allWord = add(tth, el('small', 'tv-sum-all-rows'));
      const totals: Cell[] = [];
      for (let i = 0; i < s.types.length; i++) {
        const c = makeCell('td', 'tv-sum-cell tv-sum-cell--sum');
        ttr.appendChild(c.root);
        totals.push(c);
      }
      const grand = makeCell('td', 'tv-sum-cell tv-sum-cell--sum tv-sum-cell--grand');
      ttr.appendChild(grand.root);
      fill = (m) => {
        const freeWord = !compact && (size === 'n2' || size === 'n4');
        for (let r = 0; r < rowCells.length; r++) {
          const row = m.rows[r];
          if (!row) continue;
          for (let i = 0; i < rowCells[r].cells.length; i++) fillCell(rowCells[r].cells[i], row.cells[i] || { free: 0, total: 0 }, m.full, freeWord);
          fillCell(rowCells[r].total, row, m.full, freeWord);
        }
        for (let i = 0; i < totals.length; i++) fillCell(totals[i], m.totals[i] || { free: 0, total: 0 }, m.full, freeWord);
        fillCell(grand, { free: m.free, total: m.total }, m.full, freeWord);
        text(allWord, m.allRows > 1 ? 'All ' + m.allRows + ' basements' : '');
      };
      return;
    }
    // One basement: "All of Basement B1" + a tile per type (UX S5), or the compact tile row (S6).
    const compact = mode === 'COMPACT_TILES';
    const level = s.rows[0] ? s.rows[0].level : '';
    const wrap = add(body, el('div', compact ? 'tv-sum-ctiles' : 'tv-sum-tiles'));
    const all = makeCell('div', 'tv-sum-cell tv-sum-alltile');
    const allLabel = el('span', 'tv-sum-label', 'All of ' + levelName(level));
    all.root.insertBefore(allLabel, all.root.firstChild);
    wrap.appendChild(all.root);
    const present: { i: number; cell: Cell }[] = [];
    const row0 = s.rows[0];
    const shownTypes: number[] = [];
    for (let i = 0; i < s.types.length; i++) if (row0 && row0.cells[i] && row0.cells[i].total > 0) shownTypes.push(i);
    const holder = compact ? wrap : add(wrap, el('div', 'tv-sum-typetiles tv-sum-typetiles--c' + (shownTypes.length <= 3 ? Math.max(1, shownTypes.length) : shownTypes.length === 4 ? 2 : 3)));
    for (let k = 0; k < shownTypes.length; k++) {
      const i = shownTypes[k];
      const c = makeCell('div', 'tv-sum-cell tv-sum-typetile');
      c.root.insertBefore(typeHead('span', 'tv-sum-tilehead', s.types[i]), c.root.firstChild);
      holder.appendChild(c.root);
      present.push({ i, cell: c });
    }
    fill = (m) => {
      const row = m.rows[0];
      if (!row) return;
      fillCell(all, row, m.full, true);
      for (let k = 0; k < present.length; k++) fillCell(present[k].cell, row.cells[present[k].i] || { free: 0, total: 0 }, m.full, !compact);
    };
  }

  return {
    root,
    render(s, layout, banner) {
      show(root, !!s);
      if (!s) return;
      const mode = summaryMode(layout, s.allRows);
      const size = sizeClass(s.rows.length, banner);
      cls(root, 'tv-sum ' + (mode === 'COMPACT_GRID' || mode === 'COMPACT_TILES' ? 'tv-sum--compact' : 'tv-sum--page'));
      show(caption, mode === 'GRID');
      const k = mode + '|' + size + '|' + s.types.join(',') + '|' + s.rows.map((r) => r.level).join(',') + '|' + s.allRows;
      if (k !== key) {
        key = k;
        build(s, mode, size);
      }
      if (fill) fill(s);
    },
  };
}

/** For tests: the text a cell shows. */
export function cellText(c: FeedSummaryCell | { free: number; total: number }, full: boolean): string {
  const st = cellState(c, full);
  return st === 'COUNT' ? groupIndian(c.free) : st === 'FULL' ? 'Full' : 'none here';
}
