import React from 'react';
import { useSiteContext } from '../utils/withSite';

/** Site-code chip on a row, shown only in All sites mode (L-3). */
export const SiteCodeChip: React.FC<{ siteId?: string; className?: string }> = ({ siteId, className = '' }) => {
  const { isAllSites, siteCodeFor } = useSiteContext();
  if (!isAllSites) return null;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 mr-1.5 bg-blue-50 text-blue-700 font-mono font-bold text-[9px] rounded border border-blue-200 align-middle ${className}`}
      title="Site"
    >
      {siteCodeFor(siteId)}
    </span>
  );
};
