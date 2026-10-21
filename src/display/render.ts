/**
 * TV rendering (UX boards 1–10; 03 F3). Card B at TV size (`pf-slot--tv`), header tiles, footer,
 * paging, "Parking full", "Just freed" and the system pages.
 *
 * - The DOM is built once; frames only change text, classes and `hidden`. The 12 card nodes are
 *   reused (NFR-4: 7 days without a reload). Nothing is written when a value hasn't changed.
 * - Feed text only ever goes in through textContent; icons are built with createElementNS.
 * - No inline styles: the paging fill is the one `--pf-*` custom property.
 */
import type { Renderer, ScreenModel } from './app';
import { CARDS_PER_PAGE } from './app';
import type { FeedSlot } from './types';
import { fmtTime, fmtTimeSeconds } from './time';
import { hoursLabel, opensAt } from './hours';
import { footerText, groupIndian, joinLabels } from './layout';
import { setIcon, svgIcon } from './icons';
import { decodeSlot } from '../utils/slots';
import markUrl from '../design-system/brand/parkflows-mark.svg';

const MAX_TILES = 4;
const TYPE_WORD: { [t: string]: string } = { SEDAN: 'Sedan', SUV: 'SUV', CSUV: 'Compact SUV', TWO_WHEELER: 'Two-wheeler', EV: 'EV' };
const STATUS_WORD: { [s: string]: string } = { VACANT: 'Vacant', OCCUPIED: 'Occupied', RESERVED: 'Reserved', MAINTENANCE: 'Maintenance' };

// ---- tiny DOM helpers ------------------------------------------------------------------------
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
function show(node: HTMLElement | SVGElement, on: boolean): void {
  if (on) {
    if (node.hasAttribute('hidden')) node.removeAttribute('hidden');
  } else if (!node.hasAttribute('hidden')) node.setAttribute('hidden', '');
}
function cls(node: Element, value: string): void {
  if (node.getAttribute('class') !== value) node.setAttribute('class', value);
}
function attr(node: Element, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
function logo(className: string): HTMLImageElement {
  const img = el('img', className) as HTMLImageElement;
  img.src = markUrl;
  img.alt = '';
  return img;
}

/** "1.8 m" or "—" (missing values are never invented). */
export function metres(v: number | undefined): string {
  return typeof v === 'number' && isFinite(v) && v > 0 ? (Math.round(v * 10) / 10).toFixed(1) + ' m' : '—';
}

/** "KA 05 MN 1234" — the console's plate format (utils/format.ts formatPlate), kept ES2015-only here. */
export function formatPlate(value: string | undefined): string {
  if (!value) return '—';
  const raw = value.replace(/[\s-]/g, '').toUpperCase();
  const std = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})?(\d{1,4})$/.exec(raw);
  if (std) return [std[1], std[2], std[3], std[4]].filter(Boolean).join(' ');
  const bh = /^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/.exec(raw);
  if (bh) return bh[1] + ' ' + bh[2] + ' ' + bh[3] + ' ' + bh[4];
  return raw;
}

export function decodeOf(s: FeedSlot): string {
  return decodeSlot({ parkingType: s.parkingType, puzzleNumber: s.puzzleNumber, slotNumber: s.code, palletLevel: s.palletLevel, floorLocation: '' });
}

// ---- one card --------------------------------------------------------------------------------
interface CardNodes {
  root: HTMLElement;
  band: HTMLElement;
  bandIcon: SVGSVGElement;
  word: HTMLElement;
  fresh: HTMLElement;
  level: HTMLElement;
  code: HTMLElement;
  chipText: HTMLElement;
  chipEv: SVGSVGElement;
  plate: HTMLElement;
  decode: HTMLElement;
  h: HTMLElement;
  l: HTMLElement;
}

function makeCard(): CardNodes {
  const root = el('article');
  const band = add(root, el('div'));
  const bandIcon = add(band, svgIcon('vacant', 3));
  const word = add(band, el('span'));
  const fresh = add(band, el('span', 'tv-newtag', 'Just freed'));
  const level = add(band, el('span', 'tv-band-end'));
  const body = add(root, el('div', 'tv-body'));
  const row = add(body, el('div', 'tv-code-row'));
  const code = add(row, el('span', 'tv-code'));
  const chip = add(row, el('span', 'tv-chip'));
  const chipText = add(chip, el('span'));
  const chipEv = add(chip, svgIcon('ev', 2.5));
  const plate = add(body, el('span', 'tv-plate'));
  const decode = add(body, el('span', 'tv-decode'));
  const dims = add(body, el('div', 'tv-dims'));
  const dh = add(dims, el('span', 'tv-dim'));
  dh.appendChild(svgIcon('height', 2));
  add(dh, el('small', '', 'H'));
  const h = add(dh, el('span'));
  const dl = add(dims, el('span', 'tv-dim'));
  dl.appendChild(svgIcon('length', 2));
  add(dl, el('small', '', 'L'));
  const l = add(dl, el('span'));
  return { root, band, bandIcon, word, fresh, level, code, chipText, chipEv, plate, decode, h, l };
}

function fillCard(c: CardNodes, s: FeedSlot, justFreed: boolean): void {
  const key = s.status.toLowerCase();
  const occupied = s.status === 'OCCUPIED';
  const typeWord = TYPE_WORD[s.type] || s.type;
  cls(c.root, 'pf-slot pf-slot--tv' + (occupied ? ' is-occupied' : '') + (justFreed ? ' is-new' : ''));
  attr(c.root, 'aria-label', 'Slot ' + s.code + ', ' + STATUS_WORD[s.status] + (occupied && s.plate ? ', ' + formatPlate(s.plate) : '') + ', ' + typeWord + (s.ev ? ', EV charging' : ''));
  cls(c.band, 'tv-band tv-band--' + (s.status === 'VACANT' ? 'free' : key));
  setIcon(c.bandIcon, key);
  text(c.word, STATUS_WORD[s.status] || s.status);
  show(c.fresh, justFreed);
  text(c.level, s.level);
  text(c.code, s.code);
  text(c.chipText, typeWord);
  show(c.chipEv, !!s.ev && s.type !== 'EV');
  show(c.plate, occupied);
  text(c.plate, occupied ? formatPlate(s.plate) : '');
  show(c.decode, !occupied);
  text(c.decode, occupied ? '' : decodeOf(s));
  text(c.h, metres(s.heightM));
  text(c.l, metres(s.lengthM));
}

// ---- the page --------------------------------------------------------------------------------
interface Tile {
  root: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  word: HTMLElement;
}

interface Message {
  title: string;
  text: string;
  small: string;
  icon: string | null;
  logo: boolean;
  pairing: boolean;
}

export function createRenderer(root: HTMLElement, host?: string): Renderer {
  // header
  const head = add(root, el('header', 'tv-head'));
  const place = add(head, el('div', 'tv-place'));
  place.appendChild(logo('tv-logo'));
  const placeText = add(place, el('div', 'tv-place-text'));
  const placeName = add(placeText, el('span', 'tv-place-name'));
  const placeSub = add(placeText, el('span', 'tv-place-sub'));
  const headBanner = add(head, el('div', 'tv-headbanner'));
  headBanner.setAttribute('role', 'status');
  const headBannerIcon = add(headBanner, svgIcon('full', 2.5));
  const headBannerText = add(headBanner, el('div', 'tv-headbanner-text'));
  const headBannerTitle = add(headBannerText, el('b'));
  const headBannerSub = add(headBannerText, el('span'));
  const levels = add(head, el('div', 'tv-levels'));
  const tiles: Tile[] = [];
  for (let i = 0; i < MAX_TILES; i++) {
    const t = add(levels, el('div', 'tv-level'));
    const name = add(t, el('span', 'tv-level-name'));
    const count = add(t, el('span', 'tv-level-count'));
    const countN = add(count, el('span'));
    const word = add(count, el('small'));
    tiles.push({ root: t, name, count: countN, word });
  }
  const total = add(head, el('div', 'tv-total'));
  add(total, el('span', 'tv-total-label', 'Free now'));
  const totalCount = add(total, el('span', 'tv-total-count'));
  const totalN = add(totalCount, el('span'));
  const totalWord = add(totalCount, el('small'));
  const updated = add(head, el('div', 'tv-updated'));
  add(updated, el('span', '', 'Updated'));
  const updatedTime = add(updated, el('b'));

  // cards
  const grid = add(root, el('section', 'tv-grid'));
  grid.setAttribute('aria-label', 'Slots');
  const cards: CardNodes[] = [];
  for (let i = 0; i < CARDS_PER_PAGE; i++) cards.push(makeCard());

  // system pages
  const msg = add(root, el('section', 'tv-message'));
  const msgIconWrap = add(msg, el('div', 'tv-message-icon'));
  const msgIcon = add(msgIconWrap, svgIcon('off', 2));
  const msgLogo = add(msg, logo('tv-message-logo'));
  const msgTitle = add(msg, el('h1'));
  const msgText = add(msg, el('p'));
  const pair = add(msg, el('div', 'tv-pair'));
  const pairBoxes = add(pair, el('div', 'tv-code-boxes'));
  const pairChars: HTMLElement[] = [];
  for (let i = 0; i < 6; i++) {
    if (i === 3) add(pairBoxes, el('span', 'tv-code-gap'));
    pairChars.push(add(pairBoxes, el('span', 'tv-code-box')));
  }
  const pairHelp = add(pair, el('p', 'tv-pair-help'));
  const pairHelpText = add(pairHelp, el('span', '', 'The code changes every 10 minutes. This screen opened at '));
  const pairUrl = add(pairHelp, el('span', 'tv-url', (host || 'admin.parkflows.in') + '/tv'));
  void pairHelpText;
  const msgSmall = add(msg, el('p', 'tv-message-small'));

  // footer
  const foot = add(root, el('footer', 'tv-foot'));
  const footText = add(foot, el('span', 'tv-foot-text'));
  const pager = add(foot, el('div', 'tv-pager'));
  const pagerLabel = add(pager, el('b'));
  const segs = add(pager, el('div', 'tv-pager-segs'));
  segs.setAttribute('aria-hidden', 'true');
  const pagerNext = add(pager, el('span'));
  const brand = add(foot, el('span', 'tv-brand'));
  brand.appendChild(logo(''));
  add(brand, el('span', '', 'ParkFlows'));
  const segNodes: HTMLElement[] = [];
  const segFills: HTMLElement[] = [];

  function setSegments(n: number, current: number, progress: number): void {
    while (segNodes.length < n) {
      const s = add(segs, el('span', 'tv-seg'));
      segFills.push(add(s, el('i')));
      segNodes.push(s);
    }
    for (let i = 0; i < segNodes.length; i++) {
      show(segNodes[i], i < n);
      cls(segNodes[i], i < current ? 'tv-seg tv-seg--done' : i === current ? 'tv-seg tv-seg--now' : 'tv-seg');
    }
    const fill = segFills[current];
    if (fill) fill.style.setProperty('--pf-progress', Math.round(progress * 100) + '%');
  }

  function setTiles(m: ScreenModel, unavailable: boolean): void {
    const groups = m.feed ? m.feed.counts.groups : [];
    let shown = groups;
    if (groups.length > MAX_TILES) {
      // More levels/areas than fit: the last tile adds up the rest, so the header still covers every slot.
      let free = 0;
      let tot = 0;
      for (let i = MAX_TILES - 1; i < groups.length; i++) {
        free += groups[i].free;
        tot += groups[i].total;
      }
      shown = groups.slice(0, MAX_TILES - 1).concat([{ label: 'Other levels', free, total: tot }]);
    }
    for (let i = 0; i < tiles.length; i++) {
      const g = shown[i];
      show(tiles[i].root, !!g);
      if (!g) continue;
      const full = !unavailable && g.free === 0;
      cls(tiles[i].root, 'tv-level' + (full ? ' tv-level--full' : ''));
      text(tiles[i].name, g.label);
      text(tiles[i].count, unavailable ? '—' : groupIndian(g.free));
      text(tiles[i].word, unavailable ? '' : full ? 'Full' : 'free');
    }
  }

  function message(m: ScreenModel): Message | null {
    const none = { small: '', icon: null, logo: false, pairing: false };
    switch (m.view) {
      case 'PAIRING':
        return assignMsg(none, {
          title: 'Set up this screen',
          text: m.pairCode ? 'In ParkFlows, open Displays, choose this display and select “Pair a screen”. Then enter this code:' : 'Getting a pairing code…',
          icon: 'pairing',
          pairing: !!m.pairCode,
        });
      case 'OFF':
        return assignMsg(none, { title: 'This display has been switched off', text: 'Ask your site admin.', icon: 'off' });
      case 'INVALID':
        return assignMsg(none, { title: 'This display link isn’t valid', text: 'Ask your site admin.', icon: 'off' });
      case 'CLOSED': {
        const at = opensAt(m.feed && m.feed.hours);
        const hrs = hoursLabel(m.feed && m.feed.hours);
        return assignMsg(none, { title: at ? 'Closed — opens at ' + at : 'Closed', text: hrs ? 'Display hours ' + hrs : '', logo: true });
      }
      case 'EMPTY':
        return assignMsg(none, { title: 'No slots selected', text: 'Ask your site admin.', icon: 'noslots' });
      case 'UNAVAILABLE':
        return assignMsg(none, {
          title: 'Live status unavailable',
          text: 'Free slots can’t be shown right now. Please follow the signs or ask the attendant.',
          small: (m.lastOkMs !== null ? 'Last update ' + fmtTime(m.lastOkMs) + ' · ' : '') + 'reconnecting by itself',
          icon: 'unavailable',
        });
      case 'STARTING':
        return assignMsg(none, { title: 'Connecting…', text: 'Live parking will show here in a moment.', logo: true });
      default:
        return null;
    }
  }

  let lastView = '';

  return {
    render(m: ScreenModel) {
      const live = m.view === 'LIVE' && !!m.grid;
      const unavailable = m.view === 'UNAVAILABLE' && !!m.feed;
      const msgData = message(m);
      cls(root, 'tv' + (m.view === 'CLOSED' ? ' tv--dim' : ''));
      if (lastView !== m.view) {
        attr(root, 'data-view', m.view.toLowerCase());
        lastView = m.view;
      }

      // ---- header (live slots, and "Live status unavailable" with a known place)
      show(head, live || unavailable);
      if (live || unavailable) {
        const feed = m.feed!;
        const labels = feed.counts.groups.map((g) => g.label);
        const full = live && m.grid!.mode === 'FULL';
        text(placeName, labels.length ? 'Parking · ' + joinLabels(labels) : 'Parking');
        text(placeSub, [feed.siteName, feed.place].filter(Boolean).join(' · '));
        const banner = live && m.stale ? 'STALE' : full ? 'FULL' : '';
        show(place, banner === '');
        show(headBanner, banner !== '');
        if (banner === 'STALE') {
          cls(headBanner, 'tv-headbanner tv-headbanner--stale');
          setIcon(headBannerIcon, 'stale');
          text(headBannerTitle, 'Updating… last updated ' + (m.lastOkMs !== null ? fmtTime(m.lastOkMs) : '—'));
          text(headBannerSub, 'Slots may have changed');
        } else if (banner === 'FULL') {
          cls(headBanner, 'tv-headbanner tv-headbanner--full');
          setIcon(headBannerIcon, 'full');
          text(headBannerTitle, 'Parking full');
          text(headBannerSub, labels.length && labels.length <= 3 ? 'No free slots on ' + joinLabels(labels, 'or') : 'No free slots right now');
        }
        setTiles(m, unavailable);
        cls(total, 'tv-total' + (full ? ' tv-total--full' : ''));
        text(totalN, unavailable ? '—' : groupIndian(feed.counts.free));
        text(totalWord, unavailable ? '' : 'of ' + groupIndian(feed.counts.total));
        cls(updated, 'tv-updated' + (m.stale || unavailable ? ' tv-updated--stale' : ''));
        text(updatedTime, m.lastOkMs !== null ? fmtTimeSeconds(m.lastOkMs) : '—');
      }

      // ---- cards
      show(grid, live);
      if (live) {
        const list = m.grid!.cards;
        for (let i = 0; i < cards.length; i++) {
          const s = list[i];
          if (s) {
            fillCard(cards[i], s, !!m.justFreed[s.code]);
            if (cards[i].root.parentNode !== grid) grid.appendChild(cards[i].root);
          } else if (cards[i].root.parentNode === grid) grid.removeChild(cards[i].root);
        }
        // keep DOM order = list order (cards are only appended above, so this is already true)
      }

      // ---- system pages
      show(msg, !!msgData);
      if (msgData) {
        show(msgIconWrap, !!msgData.icon);
        if (msgData.icon) setIcon(msgIcon, msgData.icon);
        show(msgLogo, msgData.logo);
        text(msgTitle, msgData.title);
        show(msgText, !!msgData.text);
        text(msgText, msgData.text);
        show(pair, msgData.pairing);
        if (msgData.pairing && m.pairCode) {
          const code = m.pairCode;
          for (let i = 0; i < 6; i++) text(pairChars[i], code.charAt(i));
          attr(pairBoxes, 'aria-label', 'Pairing code ' + code.split('').join(' '));
          text(pairUrl, (host || 'admin.parkflows.in') + '/tv');
        }
        show(msgSmall, !!msgData.small);
        text(msgSmall, msgData.small);
      }

      // ---- footer
      show(foot, live || unavailable);
      if (live) {
        const g = m.grid!;
        text(footText, footerText(g, m.feed!.counts.total, { banner: false, forced: false }));
        const paging = g.mode === 'PAGING';
        show(pager, paging);
        cls(brand, paging ? 'tv-brand' : 'tv-brand tv-brand--end');
        if (paging) {
          text(pagerLabel, 'Page ' + g.page + ' of ' + g.pages);
          attr(pager, 'aria-label', 'Page ' + g.page + ' of ' + g.pages);
          text(pagerNext, 'Next page in ' + m.nextPageS + ' s');
          setSegments(g.pages, g.page - 1, m.pageProgress);
        }
      } else if (unavailable) {
        text(footText, 'Slot list hidden after 2 minutes without an update');
        show(pager, false);
        cls(brand, 'tv-brand tv-brand--end');
      }
    },
  };
}

function assignMsg(base: { small: string; icon: string | null; logo: boolean; pairing: boolean }, extra: Partial<Message> & { title: string; text: string }): Message {
  return Object.assign({}, base, extra) as Message;
}
