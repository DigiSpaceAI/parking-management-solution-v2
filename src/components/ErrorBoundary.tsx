import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional label shown in the recovery screen, e.g. "Master Site Config" */
  boundaryName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches uncaught errors during rendering anywhere in its subtree and
 * shows a recoverable screen instead of leaving the page blank. This is
 * a direct fix for a real bug (Master Site Configuration going blank for
 * Platform Admin) — a single unguarded field access anywhere in that
 * component tree currently takes down the whole page with no feedback.
 *
 * This does not fix the root cause of any specific unguarded access — it
 * ensures that whatever the cause, the failure mode is a visible,
 * recoverable error screen rather than a silent blank page.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.boundaryName ? `: ${this.props.boundaryName}` : ''}]`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] w-full flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white border border-rose-200 rounded-2xl p-6 shadow-lg text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {this.props.boundaryName ? `${this.props.boundaryName} hit an error` : 'Something went wrong'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                This section couldn't render. The rest of the app is unaffected — try reloading this section.
              </p>
            </div>
            {this.state.error && (
              <p className="text-[11px] font-mono text-slate-400 bg-slate-50 rounded-lg p-2 break-all">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
