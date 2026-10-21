/**
 * The TV page controller (03 F2): credential, polling, the server-offset clock, stale rules,
 * display hours and the daily reload. Everything that touches the browser comes in through
 * `TvEnv`, so tests drive it with fake timers, a fake network and a fake store.
 *
 * One timer for polling, one 1 s tick, one request in flight; the feed object is replaced, never
 * grown (NFR-4: 7 days without a reload).
 */
import type { DisplayFeed, FeedResponse } from './types';
import { isUnchanged } from './types';
import type { HttpResult, Store } from './env';
import { readCredential } from './credential';
import { isOpenAt } from './hours';
import { freshness, nextDelayMs, outcomeOf, REQUEST_TIMEOUT_MS, type Freshness, type PollOutcome } from './poll';
import { istParts, parseIso, ServerClock } from './time';
import { pickReloadMinute, RELOAD_KEY, shouldReload } from './reload';

function assign<T extends object>(target: object, ...sources: object[]): T {
  return Object.assign(target, ...sources) as T;
}

type FrameBase = Omit<ScreenModel, 'view'>;
function frame(base: FrameBase, extra: Pick<ScreenModel, 'view'> & Partial<ScreenModel>): ScreenModel {
  return assign<ScreenModel>({}, base, extra);
}

export const FEED_URL = '/api/v1/screen/feed';
/** A CLOSED answer counts as current for one closed poll interval plus slack; after that the TV's own hours rule decides. */
const CLOSED_TRUST_MS = 35000;

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

export type View = 'STARTING' | 'PAIRING' | 'OFF' | 'INVALID' | 'CLOSED' | 'EMPTY' | 'UNAVAILABLE' | 'LIVE';

/** Everything the renderer needs for one frame. */
export interface ScreenModel {
  view: View;
  /** No update for 30 s (amber "Updating…" banner); LIVE only. */
  stale: boolean;
  freshness: Freshness;
  feed: DisplayFeed | null;
  /** Server-offset "now". */
  nowMs: number;
  /** Server time of the last good response, for "Updated HH:mm:ss" / "last updated HH:mm". */
  lastOkMs: number | null;
}

export interface Renderer {
  render(model: ScreenModel): void;
}

export class TvApp {
  credential: Credential = 'NONE';
  feed: DisplayFeed | null = null;
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

  constructor(private env: TvEnv, private renderer: Renderer) {
    this.startedMono = env.mono();
    this.reloadMinute = pickReloadMinute(env.random());
  }

  /** Read the credential and start polling (or report PAIRING when there is none). */
  start(): void {
    this.token = readCredential(this.env.hash(), this.env.store);
    this.credential = this.token ? 'OK' : 'NONE';
    if (this.token) this.poll();
    this.render();
  }

  /** Use a credential obtained by pairing (F3). */
  useToken(token: string): void {
    this.token = token;
    this.credential = 'OK';
    this.failures = 0;
    this.stopped = false;
    this.poll();
    this.render();
  }

  /** The 1 s tick: time-dependent views (stale, hours, paging) and the daily reload. */
  tick(): void {
    const model = this.model();
    if (
      shouldReload({
        nowMs: model.nowMs,
        reloadMinute: this.reloadMinute,
        uptimeMs: this.env.mono() - this.startedMono,
        closed: model.view === 'CLOSED',
        lastReloadDay: this.env.store.get(RELOAD_KEY),
      })
    ) {
      // Remember the day first, so a page that reloads into the window doesn't reload again.
      this.env.store.set(RELOAD_KEY, istParts(model.nowMs).dayKey);
      this.env.reload();
      return;
    }
    this.renderer.render(model);
  }

  poll(): void {
    if (!this.token || this.inFlight || this.stopped) return;
    if (this.pollTimer !== null) {
      this.env.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
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
    }
    let delay = nextDelayMs(outcome, this.failures, this.env.random());
    if (delay !== null && outcome.kind === 'retry' && r.retryAfterS) delay = Math.max(delay, Math.min(r.retryAfterS * 1000, 15000));
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
    this.feed = body;
  }

  /** The current frame, from state + clocks only. (No object spread in the TV bundle: esbuild's
   * es2015 helper for it needs Object.getOwnPropertyDescriptors, which Chromium 53 lacks.) */
  model(): ScreenModel {
    const mono = this.env.mono();
    const nowMs = this.clock.now(mono, this.env.wall());
    const ageMs = mono - (this.lastOkMono === null ? this.startedMono : this.lastOkMono);
    const fresh = freshness(ageMs);
    const base = { feed: this.feed, nowMs, lastOkMs: this.lastOkServerMs, freshness: fresh, stale: false };
    if (this.credential === 'NONE') return frame(base, { view: 'PAIRING' });
    if (this.credential === 'OFF') return frame(base, { view: 'OFF' });
    if (this.credential === 'INVALID') return frame(base, { view: 'INVALID' });
    const feed = this.feed;
    if (!feed) return frame(base, { view: fresh === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'STARTING' });
    // Closed: the server's answer while it is current; the TV's own rule (server-offset clock) after that.
    const closed = ageMs <= CLOSED_TRUST_MS ? feed.state === 'CLOSED' : !isOpenAt(feed.hours, nowMs);
    if (closed) return frame(base, { view: 'CLOSED' });
    if (feed.state === 'EMPTY') return frame(base, { view: 'EMPTY' });
    if (fresh === 'UNAVAILABLE') return frame(base, { view: 'UNAVAILABLE' });
    // A CLOSED feed carries no slots: if the TV opens by itself before the next poll, it waits for data.
    if (feed.state === 'CLOSED') return frame(base, { view: 'STARTING' });
    return frame(base, { view: 'LIVE', stale: fresh === 'STALE' });
  }

  render(): void {
    this.renderer.render(this.model());
  }
}
