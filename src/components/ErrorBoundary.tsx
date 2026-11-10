'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, Copy, Check, RotateCcw } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((props: { error: Error; reset: () => void }) => ReactNode);
  title?: string;
  description?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
  compact?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error in component tree:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null, copied: false });
  };

  handleCopy = async (): Promise<void> => {
    const { error } = this.state;
    if (!error) return;

    const text = [
      `Component Error: ${error.name}: ${error.message}`,
      error.stack ? `Stack Trace:\n${error.stack}` : '',
      `Timestamp: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch {
      this.setState({ copied: false });
    }
  };

  render(): ReactNode {
    const { hasError, error, copied } = this.state;
    const { children, fallback, title, description, compact } = this.props;

    if (!hasError || !error) {
      return children;
    }

    if (typeof fallback === 'function') {
      return fallback({ error, reset: this.reset });
    }

    if (fallback) {
      return fallback;
    }

    // Tampilan Compact (misal untuk komponen kecil di dalam form/kartu)
    if (compact) {
      return (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger-bg p-3 text-xs text-ink"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-danger">
              <AlertTriangle size={15} />
              <span>{title || 'Bagian ini mengalami kendala'}</span>
            </div>
            <button
              type="button"
              onClick={this.reset}
              className="flex cursor-pointer items-center gap-1 rounded bg-sand px-2 py-1 font-semibold text-ink hover:bg-sand-strong"
            >
              <RotateCcw size={12} />
              <span>Coba lagi</span>
            </button>
          </div>
          <p className="text-muted">{description || error.message}</p>
        </div>
      );
    }

    // Tampilan Standar Komponen
    return (
      <div
        role="alert"
        className="my-4 flex flex-col items-center justify-center rounded-2xl border border-line bg-surface p-6 text-center shadow-sm"
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <AlertTriangle size={24} strokeWidth={2.2} aria-hidden="true" />
        </div>

        <h3 className="text-lg font-bold text-ink">
          {title || 'Komponen ini mengalami kendala'}
        </h3>

        <p className="mt-1.5 max-w-md text-sm text-muted">
          {description || 'Terjadi kesalahan saat memproses data pada bagian ini. Kamu bisa mencoba memuat ulangnya.'}
        </p>

        <button
          type="button"
          onClick={this.reset}
          className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-control bg-brand px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-focus"
        >
          <RotateCcw size={15} strokeWidth={2.2} />
          <span>Coba Muat Ulang Bagian Ini</span>
        </button>

        {/* Collapsible Debug Info */}
        <details className="group mt-5 w-full max-w-md rounded-xl border border-line bg-sand/40 p-3 text-left text-xs">
          <summary className="flex cursor-pointer select-none items-center justify-between font-semibold text-muted hover:text-ink">
            <span className="flex items-center gap-1.5">
              <span>🛠️</span>
              <span>Detail Teknis (Debugging)</span>
            </span>
            <ChevronDown size={14} className="transition-transform duration-200 group-open:rotate-180" />
          </summary>

          <div className="mt-3 space-y-2 border-t border-line pt-2 text-[11px]">
            <div>
              <span className="font-semibold text-muted">Galat: </span>
              <span className="font-mono text-danger font-medium">{error.message || 'Unknown Error'}</span>
            </div>

            {error.stack && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold text-muted">Stack:</span>
                  <button
                    type="button"
                    onClick={this.handleCopy}
                    className="flex cursor-pointer items-center gap-1 rounded bg-sand px-1.5 py-0.5 text-[10px] font-semibold text-ink hover:bg-sand-strong"
                  >
                    {copied ? (
                      <>
                        <Check size={11} className="text-success" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={11} />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="max-h-36 overflow-x-auto rounded bg-sand/80 p-2 font-mono text-[10px] leading-relaxed text-ink whitespace-pre-wrap select-all">
                  {error.stack}
                </pre>
              </div>
            )}
          </div>
        </details>
      </div>
    );
  }
}

/**
 * Higher-Order Component (HOC) untuk membungkus komponen dengan ErrorBoundary secara praktis.
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>,
) {
  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return ComponentWithErrorBoundary;
}

