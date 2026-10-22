/**
 * The TV feed (03 v1.2 "The feed", "Feed changes"). The TV can only ever receive this.
 *
 * Kept here, next to the TV code: the backend owns `DisplayFeed` in src/types.ts, and the TV
 * is a little more lenient (siteName / override may be missing, e.g. a feed cached before an
 * update). The check at the end makes `tsc` fail if the server's feed stops fitting these
 * shapes. tests/qa/003-tv-client.test.mjs feeds the TV logic with exactly these shapes.
 */
import type { DisplayFeed as ServerFeed, ParkingType, SlotStatus, SlotType } from '../types';

export type DisplayHours = { mode: 'ALWAYS' } | { mode: 'DAILY'; on: string; off: string };

export interface FeedSlot {
  code: string;
  level: string;
  area: string;
  type: SlotType;
  ev: boolean;
  parkingType: ParkingType;
  puzzleNumber?: string;
  palletLevel?: number;
  status: SlotStatus;
  heightM?: number;
  lengthM?: number;
  /** Only when status === 'OCCUPIED'. */
  plate?: string;
  /** US-17 (03 v1.2): first within its status group. */
  pinned?: true;
}

export interface FeedCounts {
  free: number;
  total: number;
  groups: { label: string; free: number; total: number }[];
}

export interface FeedMessage {
  id: string;
  text: string;
  mode: 'BANNER' | 'FULL';
  endsAt: string | null;
}

export interface FeedOverride {
  message: FeedMessage | null;
  forcedFull: { endsAt: string | null } | null;
}

export interface DisplayFeed {
  v: string;
  serverTime: string;
  state: 'OPEN' | 'CLOSED' | 'EMPTY';
  place: string;
  hours: DisplayHours;
  pageSeconds: number;
  counts: FeedCounts;
  slots?: FeedSlot[];
  /** 03 v1.2: public site name, for the full-screen message (board 13). */
  siteName?: string;
  /** 03 v1.2: overrides for this display. Absent on a backend without B7/B8. */
  override?: FeedOverride;
}

/** `?v=` matched: nothing changed since the last feed. */
export interface FeedUnchanged {
  unchanged: true;
  v: string;
  serverTime: string;
  state: DisplayFeed['state'];
}

export type FeedResponse = DisplayFeed | FeedUnchanged;

/** Compile-time only (no code is emitted): the server's feed must fit what the TV reads. */
type Assert<T extends true> = T;
export type ServerFeedFitsTv = Assert<ServerFeed extends DisplayFeed ? true : false>;

export function isUnchanged(r: FeedResponse): r is FeedUnchanged {
  return (r as FeedUnchanged).unchanged === true;
}
