import React, { createContext, useContext, useMemo, useState } from 'react';
import type { VehicleGroup } from '../types';
import { SegmentedControl } from '../design-system/components';
import { choose, DEFAULT_GROUP, groupAnnouncement, groupFor, groupName, groupSummary, otherGroup, type GroupChoice } from '../utils/groupState';

// 008 F4: the 4-wheeler | 2-wheeler choice, shared by Overview and Live parking (UX A).
interface GroupContextValue { group: VehicleGroup; setGroup: (g: VehicleGroup) => void }
const GroupContext = createContext<GroupContextValue>({ group: DEFAULT_GROUP, setGroup: () => undefined });

/** Keeps the choice in memory for the chosen site; another site reads as 4-wheeler again. */
export const VehicleGroupProvider: React.FC<{ siteId: string | null; children: React.ReactNode }> = ({ siteId, children }) => {
  const [choice, setChoice] = useState<GroupChoice>(() => choose(siteId, DEFAULT_GROUP));
  // Site changed: forget the choice for good (going back to the first site does not bring it back).
  if (choice.siteId !== siteId) setChoice(choose(siteId, DEFAULT_GROUP));
  const group = groupFor(choice, siteId);
  const value = useMemo<GroupContextValue>(() => ({ group, setGroup: (g) => setChoice(choose(siteId, g)) }), [group, siteId]);
  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
};

export const useVehicleGroup = (): GroupContextValue => useContext(GroupContext);

export type GroupCounts = Record<VehicleGroup, { occupied: number; total: number }>;
export interface VehicleGroupSwitchProps {
  /** null until the numbers are known (loading or failed): no totals or summary. */
  counts: GroupCounts | null;
  /** First load: the control is shown but disabled (UX states). On an error it stays usable. */
  loading?: boolean;
  group: VehicleGroup;
  onChange: (g: VehicleGroup) => void;
}

/** Radio group under the page title, same place and style on both pages. The other group gets a one-line summary. */
export const VehicleGroupSwitch: React.FC<VehicleGroupSwitchProps> = ({ counts, loading = false, group, onChange }) => (
  <div className="pf-vgs">
    <SegmentedControl
      idBase="vg"
      label="Vehicle type"
      hasPanels={false}
      value={group}
      onChange={(id) => onChange(id as VehicleGroup)}
      options={(['4W', '2W'] as VehicleGroup[]).map((g) => ({ id: g, label: groupName(g), count: counts?.[g].total, disabled: loading }))}
    />
    {counts && <p className="pf-card-note">{groupSummary(otherGroup(group), counts[otherGroup(group)])}</p>}
    <p className="pf-sr-only" role="status" aria-live="polite">{counts ? groupAnnouncement(group, counts[group].total) : ''}</p>
  </div>
);
