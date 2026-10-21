/**
 * Which cards the TV shows (PRD AC-07..AC-10, AC-12; UX boards 1–4; 03 "Screen behaviour on the TV").
 * Pure functions, no DOM.
 *
 * - Vacant slots exist: page through the VACANT slots only, `perPage` at a time (12, or 8 under a
 *   banner message). On the last page, the empty places are filled with taken slots in feed order
 *   (Occupied, then Reserved, then Maintenance). A taken card never takes a vacant card's place.
 * - No vacant slot: "Parking full", Occupied cards only (up to `perPage`), no paging.
 * The feed is already ordered by the server (Vacant → Occupied → Reserved → Maintenance, each by
 * slot code; pinned first within its group, US-17). The TV keeps that order; the only change it
 * makes is "Just freed" (UX board 2): a slot that has just become vacant goes first among the
 * vacant cards, after any pinned vacant slot (AC-27 keeps pinned first).
 */
import type { FeedSlot } from './types';

export type GridMode = 'MIXED' | 'PAGING' | 'FULL';

export interface GridLayout {
  mode: GridMode;
  cards: FeedSlot[];
  /** 1-based; 1 when not paging. */
  page: number;
  pages: number;
  vacant: number;
}

export function vacantFirst(slots: FeedSlot[], justFreed: { [code: string]: boolean }): FeedSlot[] {
  const pinned: FeedSlot[] = [];
  const freed: FeedSlot[] = [];
  const rest: FeedSlot[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.status !== 'VACANT') continue;
    if (s.pinned) pinned.push(s);
    else if (justFreed[s.code]) freed.push(s);
    else rest.push(s);
  }
  return pinned.concat(freed, rest);
}

/** `pageIndex` is 0-based and wraps. */
export function gridLayout(slots: FeedSlot[], perPage: number, pageIndex: number, justFreed: { [code: string]: boolean }, forceFull?: boolean): GridLayout {
  const vacant = forceFull ? [] : vacantFirst(slots, justFreed);
  const taken = slots.filter(function (s) {
    return s.status !== 'VACANT';
  });
  if (vacant.length === 0) {
    const occupied = taken.filter(function (s) {
      return s.status === 'OCCUPIED';
    });
    return { mode: 'FULL', cards: occupied.slice(0, perPage), page: 1, pages: 1, vacant: 0 };
  }
  const pages = Math.max(1, Math.ceil(vacant.length / perPage));
  const page = ((pageIndex % pages) + pages) % pages;
  const cards = vacant.slice(page * perPage, page * perPage + perPage);
  if (page === pages - 1 && cards.length < perPage) {
    for (let i = 0; i < taken.length && cards.length < perPage; i++) cards.push(taken[i]);
  }
  return { mode: pages > 1 ? 'PAGING' : 'MIXED', cards: cards, page: page + 1, pages: pages, vacant: vacant.length };
}

/**
 * Codes that turned Vacant between two feeds (UX board 2). Nothing is "just freed" on the first
 * feed after a load: the TV can't know (03 gap 3; no entry/exit times in the feed, NFR-5).
 */
export function newlyVacant(prev: FeedSlot[] | null, next: FeedSlot[]): string[] {
  if (!prev) return [];
  const before: { [code: string]: string } = {};
  for (let i = 0; i < prev.length; i++) before[prev[i].code] = prev[i].status;
  const out: string[] = [];
  for (let i = 0; i < next.length; i++) {
    const s = next[i];
    if (s.status === 'VACANT' && before[s.code] !== undefined && before[s.code] !== 'VACANT') out.push(s.code);
  }
  return out;
}

/** "Basement B1 and B2"-style joins: "A", "A and B", "A, B and C". */
export function joinAnd(items: string[], word?: string): string {
  const w = word || 'and';
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' ' + w + ' ' + items[items.length - 1];
}

/**
 * Level/area names for one line: a shared first word is said once ("Basement B1", "Basement B2" →
 * "Basement B1 and B2"), as on UX board 1.
 */
export function joinLabels(labels: string[], word?: string): string {
  if (labels.length < 2) return labels.join('');
  const first = labels[0].split(' ')[0];
  const shared = first.length > 0 && labels.every(function (l) {
    return l.indexOf(first + ' ') === 0;
  });
  if (!shared) return joinAnd(labels, word);
  return first + ' ' + joinAnd(labels.map(function (l) {
    return l.slice(first.length + 1);
  }), word);
}

/** Indian digit grouping for counts ("1,080"; "12,34,567"). ES2015: no Intl options. */
export function groupIndian(n: number): string {
  const s = String(Math.max(0, Math.floor(n)));
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  let rest = s.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return parts.join(',') + ',' + last3;
}

/** Footer copy (UX "UI copy (exact)"). */
export function footerText(layout: GridLayout, totalSlots: number, opts: { banner: boolean; forced: boolean }): string {
  if (layout.mode === 'FULL') return opts.forced ? 'Showing occupied slots only' : 'Every slot is taken · showing occupied slots only';
  if (layout.mode === 'PAGING') return 'Vacant slots only · ' + groupIndian(layout.vacant) + ' vacant on ' + layout.pages + ' pages';
  const shown = 'showing ' + layout.cards.length + ' of ' + groupIndian(totalSlots) + ' slots';
  return 'Vacant first, then occupied, reserved, maintenance · ' + shown + (opts.banner ? ' while a message is shown' : '');
}
