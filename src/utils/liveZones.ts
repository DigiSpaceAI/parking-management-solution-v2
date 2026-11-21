// 008 F6: pure rules of Live parking per vehicle group: level tabs from the inventory (no clubbing), and the 2-wheeler Zones pallets.
// Every count comes from the one countSlots (through zonesOf for pallets), so Overview and Live parking agree (AC-05).
import type { ParkingSlot, OverviewZone } from '../types';
import { countSlots } from './slotCounts.ts';
import { isCode, labelFor } from './slotFields.ts';
import { UNZONED_KEY, zoneOf, zonesOf } from './zones.ts';

type TabSlot = Pick<ParkingSlot, 'status' | 'slotType' | 'basement'>;
export interface LevelTab { id: string; label: string; free: number; total: number }
export const ALL_LEVELS = 'ALL';

/** "Basement B1" for the listed levels, the stored text for any other ("Ground", "Driveway", a custom level). */
export const levelLabel = (level: string): string => (isCode('basement', level) ? labelFor('basement', level) : level);

/** "All" + one tab per level present in `groupSlots`, in inventory order (B1, B2, B3, Ground, Driveway, then others). Ground and Driveway stay separate. */
export function levelTabs(groupSlots: TabSlot[]): LevelTab[] {
  const c = countSlots(groupSlots);
  return [{ id: ALL_LEVELS, label: 'All', free: c.free, total: c.total }, ...c.rows.map((r) => ({ id: r.level, label: levelLabel(r.level), free: r.free, total: r.total }))];
}

/** The selected level, or "All" when it has no slots in this group any more (after a group switch). */
export const effectiveLevel = (tabs: LevelTab[], selected: string): string => (tabs.some((t) => t.id === selected) ? selected : ALL_LEVELS);

type ZoneSlot = Pick<ParkingSlot, 'status' | 'slotType' | 'basement' | 'puzzleNumber' | 'slotNumber'>;
export interface ZonePallet<S> extends OverviewZone { slots: S[] }

const byNumber = (a: { slotNumber: string }, b: { slotNumber: string }) => a.slotNumber.localeCompare(b.slotNumber, undefined, { numeric: true });

/**
 * One pallet per level + zone, level then zone, "Unzoned" last (AC-03, AC-12).
 * free / total are the zone's own counts over `groupSlots` (the level tab narrows them, filters do not);
 * the tiles are the `shown` slots (after search and status). A pallet with no tile to show is left out.
 */
export function zonePallets<S extends ZoneSlot>(groupSlots: S[], shown: S[]): ZonePallet<S>[] {
  const tiles = new Map<string, S[]>();
  for (const s of shown) {
    if (s.slotType !== 'TWO_WHEELER') continue;
    const id = `${s.basement}-${zoneOf(s) ?? UNZONED_KEY}`;
    tiles.set(id, [...(tiles.get(id) || []), s]);
  }
  return zonesOf(groupSlots)
    .filter((z) => tiles.has(z.id))
    .map((z) => ({ ...z, slots: tiles.get(z.id)!.slice().sort(byNumber) }));
}

/** Tile text: "001" for B1-Z1-001; the whole name for an unzoned slot (never cut up a name that has no zone). */
export function tileNumber(s: Pick<ParkingSlot, 'slotType' | 'puzzleNumber' | 'slotNumber'>): string {
  const z = zoneOf(s);
  const name = s.slotNumber || '';
  const prefix = z === null ? '' : `${String(s.puzzleNumber).trim().toUpperCase()}-`;
  return prefix && name.toUpperCase().startsWith(prefix) ? name.slice(prefix.length) : name;
}

const INITIALS: { [status: string]: string } = { VACANT: 'V', OCCUPIED: 'O', RESERVED: 'R', MAINTENANCE: 'M' };
/** Text initial next to the colour, so status never relies on colour alone. */
export const statusInitial = (status: string): string => INITIALS[status] || '?';

/** Last 4 letters or digits of a plate, for the occupied tile. */
export function plateTail(plate: string | null | undefined): string {
  return String(plate || '').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
}

/** "Slot B1-Z1-004, vacant" */
export const tileAriaLabel = (s: { slotNumber: string; status: string }): string => `Slot ${s.slotNumber}, ${labelFor('status', s.status).toLowerCase()}`;

/** Pallet header: "B1 · Zone Z1" or "B1 · Unzoned". */
export const palletTitle = (z: Pick<OverviewZone, 'level' | 'zone'>): string => (z.zone === null ? `${z.level} · Unzoned` : `${z.level} · Zone ${z.zone}`);
