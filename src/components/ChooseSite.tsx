import React from 'react';
import { Globe, MapPin } from 'lucide-react';
import type { SiteConfig } from '../types';
import { ALL_SITES } from '../utils/withSite';

interface ChooseSiteProps {
  sites: SiteConfig[];
  /** Master Admin only: offer "All sites" as an explicit choice (AC-05). */
  allowAllSites: boolean;
  onChoose: (siteId: string) => void;
}

/**
 * "Choose a site" prompt (02-ux-design §3.0, L-3). Shown in the content
 * area when a multi-site user has no site selected. The console makes no
 * data calls until a choice is made (strict siteId, AC-02).
 */
export const ChooseSite: React.FC<ChooseSiteProps> = ({ sites, allowAllSites, onChoose }) => (
  <div className="flex items-center justify-center py-12">
    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center">
      <div className="w-12 h-12 mx-auto rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
        <MapPin className="w-6 h-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold text-slate-900">Choose a site to see its data</h2>
      <ul className="mt-5 space-y-2 text-left">
        {sites.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onChoose(s.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-sm font-semibold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <span className="truncate">{s.siteName}</span>
              <span className="shrink-0 px-1.5 py-0.5 bg-blue-50 text-blue-700 font-mono font-bold text-[10px] rounded border border-blue-200">
                {s.siteCode}
              </span>
            </button>
          </li>
        ))}
        {allowAllSites && (
          <li>
            <button
              type="button"
              onClick={() => onChoose(ALL_SITES)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-sm font-semibold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <Globe className="w-4 h-4 text-blue-600" aria-hidden="true" />
              <span>All sites</span>
            </button>
          </li>
        )}
      </ul>
    </div>
  </div>
);
