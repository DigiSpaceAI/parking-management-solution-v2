import React from 'react';
import { Eye } from 'lucide-react';

interface ViewAsBannerProps {
  userName: string;
  roleName: string;
  siteLabel: string;
  onExit: () => void;
}

/**
 * Role View Simulator banner (02-ux-design §3.0, L-8, AC-55). Full width,
 * fixed above the header while a Master Admin views the console as another
 * user. Everything is read-only; the server refuses writes (ERR_VIEW_AS_READ_ONLY).
 */
export const ViewAsBanner: React.FC<ViewAsBannerProps> = ({ userName, roleName, siteLabel, onExit }) => (
  <div role="status" className="shrink-0 bg-purple-700 text-white px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
    <p className="flex items-center gap-2 min-w-0">
      <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        Viewing as <strong>{userName}</strong> · {roleName} · {siteLabel} — read-only
      </span>
    </p>
    <button
      type="button"
      onClick={onExit}
      className="px-3 py-1.5 rounded-lg bg-white text-purple-800 font-bold text-xs hover:bg-purple-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-purple-700"
    >
      Exit view
    </button>
  </div>
);
