/**
 * The TV page controller (03 F2/F3): credential, pairing, polling, the server-offset clock, stale
 * rules, display hours, paging, "Just freed" and the daily reload. Everything that touches the
 * browser comes in through `TvEnv`, so tests drive it with fake timers, network and store.
 *
 * One timer for polling, one 1 s tick, one request in flight; the feed object is replaced, never
 * grown (NFR-4: 7 days without a reload).
 */
import type { DisplayFeed, FeedLayout, FeedMessage, FeedOverride, FeedResponse, FeedSlot, FeedSummaryCell, FeedSummaryRow } from './types';
import { isUnchanged } from './types';
import type { HttpResult, Store } from './env';
import { readCredential, TOKEN_KEY, tokenTag } from './credential';
import { isOpenAt } from './hours';
import { freshness, nextDelayMs, outcomeOf, POLL_MS, REQUEST_TIMEOUT_MS, BACKOFF_MAX_MS, type Freshness, type PollOutcome } from './poll';
import { istParts, parseIso, ServerClock } from './time';
import { pickReloadMinute, RELOAD_KEY, shouldReload } from './reload';
import { gridLayout, newlyVacant, summaryPages, type GridLayout } from './layout';
import { decideScreen, type DecidedView } from './decide';
import { clearOverride, loadOverride, NO_OVERRIDE, saveOverride } from './override';

/** No object spread in the TV bundle: esbuild's es2015 helper for it needs Object.getOwnPropertyDescriptors (not in Chromium 53). */
function assign<T extends object>(target: object, ...sources: object[]): T {
  return Object.assign(target, ...sources) as T;
}

export const FEED_URL = '/api/v1/screen/feed';
export const PAIR_START_URL = '/api/v1/screen/pair/start';
export const PAIR_STATUS_URL = '/api/v1/screen/pair/status';
/** A CLOSED answer counts as current for one closed poll interval plus slack; after that the TV's own hours rule decides. */
const CLOSED_TRUST_MS = 35000;
/** UX board 2: the "Just freed" outline and tag stay 10 s. */
export const JUST_FREED_MS = 10000;
export const CARDS_PER_PAGE = 12;
/** UX board 11: 4 × 2 cards while a banner message is shown. */
export const CARDS_PER_PAGE_BANNER = 8;
/** 03 v1.5 (AC-46, UX S4): up to 6 basements on one Summary page; UX decision 3: 4 while a banner message is on. */
export const SUMMARY_ROWS_PER_PAGE = 6;
export const SUMMARY_ROWS_PER_PAGE_BANNER = 4;
/** UX S6/S7: Summary + slot cards shows 8 cards (4 × 2) under the compact summary; 4 while a banner message is on. */
export const CARDS_PER_PAGE_SUMMARY = 8;
export const CARDS_PER_PAGE_SUMMARY_BANNER = 4;

/**
 * 03 v1.5 (AC-39..AC-46): the summary for one frame. Totals and Free now always cover every row
 * (never a page); `full` = every cell with slots shows "Full" (forced full, or no free slot in
 * the whole selection, AC-43).
 */
export interface SummaryModel {
  /** Column order as the feed sends it (never a fixed list). */
  types: string[];
  /** The rows on this page. */
  rows: FeedSummaryRow[];
  /** Rows in the whole selection. */
  allRows: number;
  /** 1-based number of the first row on this page. */
  first: number;
  totals: FeedSummaryCell[];
  free: number;
  total: number;
  page: number;
  pages: number;
  full: boolean;
  forced: boolean;
}

export interface TvEnv {
  mono(): number;
  wall(): number;
  random(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  request(method: 'GET' | 'POST', url: string, headers: { [name: string]: string }, body: unknown, timeoutMs: number, done: (r: HttpResult) => void): void;
  store: Store;
  hash(): string;
  reload(): void;
}

export type Credential = 'NONE' | 'OK' | 'INVALID' | 'OFF';

export type View = DecidedView;

/** Everything the renderer needs for one frame. */
export interface ScreenModel {
  view: View;
  /** No update for 30 s (amber "Updating…" banner); LIVE and FORCED_FULL only. */
  stale: boolean;
  /** The banner message strip (AC-23), on LIVE / FORCED_FULL / UNAVAILABLE. */
  banner: FeedMessage | null;
  /** TAKEOVER: the full-screen message (AC-23). */
  takeover: FeedMessage | null;
  /** FORCED_FULL with no current data: the forced-full header stays, the cards go (AC-28, UX). */
  cardsHidden: boolean;
  freshness: Freshness;
  feed: DisplayFeed | null;
  /** Server-offset "now". */
  nowMs: number;
  /** Server time of the last good response, for "Updated HH:mm:ss" / "last updated HH:mm". */
  lastOkMs: number | null;
  /** LIVE / FORCED_FULL: the cards on screen now. */
  grid: GridLayout | null;
  /** Paging: 0..1 of the current page's time, and whole seconds to the next page. */
  pageProgress: number;
  nextPageS: number;
  /** Codes shown with "Just freed" now. */
  justFreed: { [code: string]: boolean };
  /** PAIRING: the 6-character code to show, or null while fetching one. */
  pairCode: string | null;
  /** 03 v1.5: the display's layout (the last feed's; slot cards when it has none). */
  layout: FeedLayout;
  /** 03 v1.5: LIVE / FORCED_FULL with a summary layout. */
  summary: SummaryModel | null;
}

export interface Renderer {
  render(model: ScreenModel): void;
}

export class TvApp {
  credential: Credential = 'NONE';
  feed: DisplayFeed | null = null;
  pairCode: string | null = null;
  private token: string | null = null;
  private clock = new ServerClock();
  private lastOkMono: number | null = null;
  private lastOkServerMs: number | null = null;
  private startedMono: number;
  private failures = 0;
  private pollTimer: unknown = null;
  private inFlight = false;
  private stopped = false;
  private reloadMinute: number;
  private freedUntil: { [code: string]: number } = {};
  private pageIndex = 0;
  private pageStartMono = 0;
  private pairSecret: string | null = null;
  private pairExpiresMono = 0;
  private pairFailures = 0;
  private override: FeedOverride = NO_OVERRIDE;
  private tag = '';

  constructor(private env: TvEnv, private renderer: Renderer) {
    this.startedMono = env.mono();
    this.pageStartMono = this.startedMono;
    this.reloadMinute = pickReloadMinute(env.random());
  }

  /** Read the credential and start polling, or start pairing when there is none. */
  start(): void {
    this.token = readCredential(this.env.hash(), this.env.store);
    this.credential = this.token ? 'OK' : 'NONE';
    if (this.token) {
      // A message or forced full received before a reload stays until its end time (AC-28).
      this.tag = tokenTag(this.token);
      this.override = loadOverride(this.env.store, this.tag);
      this.poll();
    }
    else this.pairStart();
    this.render();
  }

  /**
   * Console live preview (UX C4/C6, AC-17/AC-29): no credential, no polling, no storage. The
   * console page sends the feed it fetched with its own session (GET /displays/:id/preview, or a
   * draft built in the editor); each one counts as a good response, so the preview shows exactly
   * what the TV would. `null` = nothing to show yet (Connecting).
   */
  startPreview(): void {
    this.credential = 'OK';
    this.render();
  }

  showFeed(feed: DisplayFeed | null): void {
    if (!feed) {
      this.feed = null;
      this.lastOkMono = null;
      this.startedMono = this.env.mono();
    } else this.accept(feed);
    this.render();
  }

  /** Use a credential obtained by pairing (remembered, so a reload keeps it). */
  useToken(token: string): void {
    this.token = token;
    this.env.store.set(TOKEN_KEY, token);
    this.tag = tokenTag(token);
    this.override = NO_OVERRIDE;
    this.credential = 'OK';
    this.pairCode = null;
    this.pairSecret = null;
    this.failures = 0;
    this.stopped = false;
    this.clearTimer();
    this.poll();
    this.render();
  }

  /** The 1 s tick: time-dependent views (stale, hours, paging, "Just freed") and the daily reload. */
  tick(): void {
    const mono = this.env.mono();
    const model = this.model();
    if (
      shouldReload({
        nowMs: model.nowMs,
        reloadMinute: this.reloadMinute,
        uptimeMs: mono - this.startedMono,
        closed: model.view === 'CLOSED',
        lastReloadDay: this.env.store.get(RELOAD_KEY),
      })
    ) {
      // Remember the day first, so a page that reloads into the window doesn't reload again.
      this.env.store.set(RELOAD_KEY, istParts(model.nowMs).dayKey);
      this.env.reload();
      return;
    }
    // Paging: one step every pageSeconds, while there is more than one page of vacant slots,
    // or (Summary layout, AC-46) more than one page of basements.
    const pages = pagesOf(model);
    if (pages > 1 && this.feed) {
      if (mono - this.pageStartMono >= this.feed.pageSeconds * 1000) {
        this.pageIndex = (this.pageIndex + 1) % pages;
        this.pageStartMono = mono;
      }
    } else {
      this.pageIndex = 0;
      this.pageStartMono = mono;
    }
    // A pairing code expires after 10 minutes: get a new one.
    if (this.credential === 'NONE' && this.pairSecret && mono >= this.pairExpiresMono) this.pairStart();
    this.renderer.render(this.model());
  }

  private clearTimer(): void {
    if (this.pollTimer !== null) {
      this.env.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  poll(): void {
    if (!this.token || this.inFlight || this.stopped) return;
    this.clearTimer();
    this.inFlight = true;
    const v = this.feed ? '?v=' + encodeURIComponent(this.feed.v) : '';
    this.env.request('GET', FEED_URL + v, { 'x-display-token': this.token }, undefined, REQUEST_TIMEOUT_MS, (r) => this.onResponse(r));
  }

  private onResponse(r: HttpResult): void {
    this.inFlight = false;
    let closed = false;
    let outcome: PollOutcome;
    const body = r.body as FeedResponse | null;
    if (r.status === 200 && body && typeof body === 'object' && typeof body.v === 'string' && typeof body.serverTime === 'string') {
      this.accept(body);
      closed = body.state === 'CLOSED';
      outcome = outcomeOf(200, closed);
    } else {
      outcome = outcomeOf(r.status === 200 ? 0 : r.status, false);
    }
    if (outcome.kind === 'retry') this.failures += 1;
    else this.failures = 0;
    if (outcome.kind === 'stop') {
      this.credential = outcome.reason;
      this.stopped = true;
      this.feed = null; // board 8 / "isn't valid": no slot data from here on (AC-04)
      this.override = NO_OVERRIDE; // and no override either (03 v1.2)
      clearOverride(this.env.store);
    }
    let delay = nextDelayMs(outcome, this.failures, this.env.random());
    if (delay !== null && outcome.kind === 'retry' && r.retryAfterS) delay = Math.max(delay, Math.min(r.retryAfterS * 1000, BACKOFF_MAX_MS));
    if (delay !== null) this.pollTimer = this.env.setTimeout(() => this.poll(), delay);
    this.render();
  }

  private accept(body: FeedResponse): void {
    const mono = this.env.mono();
    this.clock.sync(body.serverTime, mono);
    this.lastOkMono = mono;
    this.lastOkServerMs = parseIso(body.serverTime);
    this.credential = 'OK';
    if (isUnchanged(body)) {
      if (this.feed) this.feed = assign<DisplayFeed>({}, this.feed, { serverTime: body.serverTime, state: body.state });
      return;
    }
    // "Just freed" (UX board 2, 03 gap 3): worked out on the TV from two consecutive feeds.
    const prev: FeedSlot[] | null = this.feed && this.feed.slots ? this.feed.slots : this.feed ? [] : null;
    const freed = newlyVacant(prev, body.slots || []);
    for (let i = 0; i < freed.length; i++) this.freedUntil[freed[i]] = mono + JUST_FREED_MS;
    this.feed = body;
    // A good feed always replaces the cached overrides: that's how a Clear arrives (AC-24).
    this.override = body.override ? { message: body.override.message || null, forcedFull: body.override.forcedFull || null } : NO_OVERRIDE;
    if (this.tag) saveOverride(this.env.store, this.tag, this.override);
  }

  // ---- pairing (UX board 10; 03 "Pairing") -------------------------------------------------
  private pairStart(): void {
    this.pairSecret = null;
    this.clearTimer();
    this.env.request('POST', PAIR_START_URL, {}, {}, REQUEST_TIMEOUT_MS, (r) => {
      if (this.credential !== 'NONE') return;
      const b = r.body as { code?: string; pairSecret?: string; expiresIn?: number } | null;
      if (r.status === 200 && b && typeof b.code === 'string' && typeof b.pairSecret === 'string') {
        this.pairFailures = 0;
        this.pairCode = b.code;
        this.pairSecret = b.pairSecret;
        this.pairExpiresMono = this.env.mono() + (b.expiresIn && b.expiresIn > 0 ? b.expiresIn : 600) * 1000;
        this.pollTimer = this.env.setTimeout(() => this.pairStatus(), POLL_MS);
      } else {
        this.pairFailures += 1;
        this.pairCode = null;
        this.pollTimer = this.env.setTimeout(() => this.pairStart(), nextDelayMs({ kind: 'retry' }, this.pairFailures, 0) as number);
      }
      this.render();
    });
  }

  private pairStatus(): void {
    const secret = this.pairSecret;
    if (!secret || this.credential !== 'NONE') return;
    this.env.request('GET', PAIR_STATUS_URL, { 'x-pair-secret': secret }, undefined, REQUEST_TIMEOUT_MS, (r) => {
      if (this.credential !== 'NONE' || secret !== this.pairSecret) return;
      const b = r.body as { state?: string; token?: string } | null;
      if (r.status === 200 && b && b.state === 'PAIRED' && typeof b.token === 'string') {
        this.useToken(b.token);
        return;
      }
      if (r.status === 410) {
        this.pairStart(); // expired, used or unknown: a new code
        return;
      }
      const ok = r.status === 200;
      this.pairFailures = ok ? 0 : this.pairFailures + 1;
      const delay = ok ? POLL_MS : (nextDelayMs({ kind: 'retry' }, this.pairFailures, 0) as number);
      this.pollTimer = this.env.setTimeout(() => this.pairStatus(), delay);
    });
  }

  // ---- the frame ---------------------------------------------------------------------------
  /** The current frame, from state + clocks only. */
  model(): ScreenModel {
    const mono = this.env.mono();
    const nowMs = this.clock.now(mono, this.env.wall());
    const ageMs = mono - (this.lastOkMono === null ? this.startedMono : this.lastOkMono);
    const fresh = freshness(ageMs);
    const justFreed: { [code: string]: boolean } = {};
    for (const code in this.freedUntil) {
      if (!Object.prototype.hasOwnProperty.call(this.freedUntil, code)) continue;
      if (this.freedUntil[code] > mono) justFreed[code] = true;
      else delete this.freedUntil[code];
    }
    const feed = this.feed;
    // Closed: the server's answer while it is current; the TV's own rule (server-offset clock) after that.
    const closed = !!feed && (ageMs <= CLOSED_TRUST_MS ? feed.state === 'CLOSED' : !isOpenAt(feed.hours, nowMs));
    const d = decideScreen({
      credential: this.credential,
      now: nowMs,
      closed: closed,
      lastOkAgeMs: ageMs,
      feedState: feed ? feed.state : null,
      message: this.override.message,
      forcedFull: this.override.forcedFull,
    });
    const m: ScreenModel = {
      view: d.view,
      stale: d.staleBanner,
      banner: d.banner,
      takeover: d.takeover,
      cardsHidden: d.cardsHidden || (d.view === 'FORCED_FULL' && !(feed && feed.state === 'OPEN')),
      freshness: fresh,
      feed: feed,
      nowMs: nowMs,
      lastOkMs: this.lastOkServerMs,
      grid: null,
      pageProgress: 0,
      nextPageS: 0,
      justFreed: justFreed,
      pairCode: this.pairCode,
      layout: (feed && feed.layout) || 'SLOT_CARDS',
      summary: null,
    };
    if ((m.view === 'LIVE' || m.view === 'FORCED_FULL') && !m.cardsHidden && feed) {
      const forced = m.view === 'FORCED_FULL';
      // 03 v1.5: a summary layout draws the summary when the feed carries one (an OPEN feed always does).
      const sum = m.layout !== 'SLOT_CARDS' && feed.summary ? feed.summary : null;
      if (sum) m.summary = summaryModel(sum, m.layout, feed.counts, forced, !!m.banner, this.pageIndex);
      // Summary: counts only, no cards (AC-45). Summary + slot cards: 8 cards under the summary (UX S6/S7).
      if (!(sum && m.layout === 'SUMMARY')) {
        const perPage = sum ? (m.banner ? CARDS_PER_PAGE_SUMMARY_BANNER : CARDS_PER_PAGE_SUMMARY) : m.banner ? CARDS_PER_PAGE_BANNER : CARDS_PER_PAGE;
        m.grid = gridLayout(feed.slots || [], perPage, forced ? 0 : this.pageIndex, forced ? {} : justFreed, forced);
      }
      if (pagesOf(m) > 1) {
        const pageMs = Math.max(1, feed.pageSeconds) * 1000;
        const inPage = Math.min(pageMs, Math.max(0, mono - this.pageStartMono));
        m.pageProgress = inPage / pageMs;
        m.nextPageS = Math.max(1, Math.ceil((pageMs - inPage) / 1000));
      }
    }
    return m;
  }

  render(): void {
    this.renderer.render(this.model());
  }
}

/** Pages that turn by themselves: the vacant cards, or (Summary only) the basement rows. */
export function pagesOf(m: Pick<ScreenModel, 'grid' | 'summary'>): number {
  if (m.grid) return m.grid.mode === 'PAGING' ? m.grid.pages : 1;
  return m.summary ? m.summary.pages : 1;
}

/**
 * 03 v1.5 (AC-39, AC-43, AC-46): one frame of the summary. Summary pages its rows (6, or 4 under a
 * banner message); Summary + slot cards never pages its summary (the cards page). Totals come
 * from the feed, so they always cover every row.
 */
export function summaryModel(
  sum: { types: string[]; rows: FeedSummaryRow[]; totals: FeedSummaryCell[] },
  layout: FeedLayout,
  counts: { free: number; total: number },
  forced: boolean,
  banner: boolean,
  pageIndex: number
): SummaryModel {
  const perPage = layout === 'SUMMARY' ? (banner ? SUMMARY_ROWS_PER_PAGE_BANNER : SUMMARY_ROWS_PER_PAGE) : Math.max(1, sum.rows.length);
  const pages = summaryPages(sum.rows, perPage);
  const page = layout === 'SUMMARY' ? ((pageIndex % pages.length) + pages.length) % pages.length : 0;
  return {
    types: sum.types,
    rows: pages[page],
    allRows: sum.rows.length,
    first: page * perPage + 1,
    totals: sum.totals,
    free: counts.free,
    total: counts.total,
    page: page + 1,
    pages: pages.length,
    full: forced || counts.free === 0,
    forced: forced,
  };
}
