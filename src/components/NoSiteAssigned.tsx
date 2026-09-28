import React from 'react';
import { Building2 } from 'lucide-react';

interface NoSiteAssignedProps {
  onSignOut: () => void;
}

/** S-0 "No site assigned" (02-ux-design §3.2, L-4, AC-44). No modules and no data calls. */
export const NoSiteAssigned: React.FC<NoSiteAssignedProps> = ({ onSignOut }) => (
  <div className="h-screen w-screen flex items-center justify-center bg-slate-50 p-4">
    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
      <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mb-3">
        <Building2 className="w-6 h-6" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-bold text-slate-900">No site assigned</h1>
      <p className="mt-2 text-sm text-slate-600">Your account isn't linked to a site yet. Contact your administrator.</p>
      <button
        type="button"
        onClick={onSignOut}
        className="mt-6 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        Sign out
      </button>
    </div>
  </div>
);
