// 008 F5: pure rules of the Overview for one vehicle group. The numbers come from ONE call, GET /overview?group=
// (server-side counts, same countSlots as Live parking); nothing is added up in the browser.
import type { OverviewToday, OverviewZone, VehicleGroup } from '../types';
import { otherGroup } from './groupState.ts';

export const overviewUrl = (group: VehicleGroup): string => `/api/v1/overview?group=${group}`;

/** A response counts only for the site and group on screen: switching shows loading, never the other group's numbers. */
export function freshOverview(d: OverviewToday | null, siteId: string, group: VehicleGroup): OverviewToday | null {
  return d && d.siteId === siteId && d.group === group ? d : null;
}

/** The site has slots, but none of this group (AC-08). A site with no slots at all keeps the page's own "No slots set up yet". */
export function groupHasNoSlots(d: OverviewToday, group: VehicleGroup): boolean {
  return d.total === 0 && !!d.groups && d.groups[otherGroup(group)].total > 0;
}

export function emptyGroupCopy(group: VehicleGroup): { title: string; text: string } {
  return group === '2W'
    ? { title: 'No two-wheeler slots in this site', text: 'Add two-wheeler slots in Inventory to see them here.' }
    : { title: 'No four-wheeler slots in this site', text: 'Add four-wheeler slots in Inventory to see them here.' };
}

/** Pass requests and open alerts have no slot type: they stay on the 4-wheeler view (tech design gap 3). */
export const showsGroupOnlyTiles = (group: VehicleGroup): boolean => group === '4W';

/** "B1 · Zone Z1", or "B1 · Unzoned" for 2W slots with no zone (AC-12). */
export const zoneLabel = (z: Pick<OverviewZone, 'level' | 'zone'>): string => (z.zone === null ? `${z.level} · Unzoned` : `${z.level} · Zone ${z.zone}`);
