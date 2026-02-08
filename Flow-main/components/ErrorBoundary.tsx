import React, { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * ErrorBoundary
 * Prevents entire app crashes from component errors.
 * Provides graceful fallback UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="fixed inset-0 flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-6">
          <div className="text-center max-w-md">
            <h2 className="text-2xl font-bold mb-2 text-neutral-900 dark:text-neutral-100">
              Something went wrong
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400 mb-4">
              The app encountered an error. We've logged it for review.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Reload App
            </button>
            {this.state.error && (
              <details className="mt-4 text-left text-xs text-neutral-500 dark:text-neutral-500">
                <summary className="cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-300">
                  Technical Details
                </summary>
                <pre className="mt-2 p-3 bg-neutral-100 dark:bg-neutral-800 rounded overflow-auto">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
