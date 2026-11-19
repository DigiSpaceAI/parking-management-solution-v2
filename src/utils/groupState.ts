// 008 F4: which vehicle group (4-wheeler / 2-wheeler) the admin is looking at. Pure.
// The choice is kept in memory for one site and is NOT stored: another site (or no site) reads as 4-wheeler.
import type { VehicleGroup } from '../types';
import { formatNumber } from './format.ts';

export const DEFAULT_GROUP: VehicleGroup = '4W';
export interface GroupChoice { siteId: string | null; group: VehicleGroup }

export const choose = (siteId: string | null, group: VehicleGroup): GroupChoice => ({ siteId, group });
/** The group to show on `siteId`: the choice made on that same site, else 4-wheeler (reset on site change). */
export const groupFor = (c: GroupChoice, siteId: string | null): VehicleGroup => (c.siteId === siteId ? c.group : DEFAULT_GROUP);

export const groupName = (g: VehicleGroup): string => (g === '2W' ? '2-wheeler' : '4-wheeler');
export const otherGroup = (g: VehicleGroup): VehicleGroup => (g === '2W' ? '4W' : '2W');
/** "2-wheeler: 146 / 413 occupied" (UX A). */
export const groupSummary = (g: VehicleGroup, c: { occupied: number; total: number }): string => `${groupName(g)}: ${formatNumber(c.occupied)} / ${formatNumber(c.total)} occupied`;
/** Screen reader text on a switch (UX): "Showing 2-wheeler, 413 slots". */
export const groupAnnouncement = (g: VehicleGroup, total: number): string => `Showing ${groupName(g)}, ${formatNumber(total)} slots`;
