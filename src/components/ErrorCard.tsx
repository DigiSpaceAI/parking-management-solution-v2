import React from 'react';
import { AlertCircle } from 'lucide-react';

export const GENERIC_LOAD_ERROR = "We couldn't load this. Check your connection and try again.";

interface ErrorCardProps {
  message?: string;
  onRetry?: () => void;
}

/** Readable inline error card with Try again (02-ux-design §4/§5, L-6). */
export const ErrorCard: React.FC<ErrorCardProps> = ({ message = GENERIC_LOAD_ERROR, onRetry }) => (
  <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4 bg-white border border-rose-200 rounded-2xl">
    <p className="flex items-start gap-2 text-sm text-slate-800">
      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        Try again
      </button>
    )}
  </div>
);
