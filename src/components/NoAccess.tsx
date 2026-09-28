import React from 'react';
import { Lock } from 'lucide-react';

/** S-NA "No access" (02-ux-design §3.2, L-5, AC-07/AC-08). Shown for a page the role can't open (deep link, stale tab). */
export const NoAccess: React.FC<{ onGoHome: () => void }> = ({ onGoHome }) => (
  <div className="flex items-center justify-center py-12">
    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center" role="alert">
      <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mb-3">
        <Lock className="w-6 h-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold text-slate-900">You don't have access to this page</h2>
      <p className="mt-2 text-sm text-slate-600">Ask your administrator if you need it.</p>
      <button
        type="button"
        onClick={onGoHome}
        className="mt-6 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        Go to Home
      </button>
    </div>
  </div>
);
