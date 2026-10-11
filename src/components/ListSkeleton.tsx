import React from 'react';

/** Skeleton rows shown while a site's lists load (L-2): old rows are never shown under the new site's name. */
export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-3" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading…</span>
    <div className="h-8 w-48 rounded-lg bg-slate-200 motion-safe:animate-pulse" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-14 rounded-xl bg-white border border-slate-200 motion-safe:animate-pulse" />
    ))}
  </div>
);
