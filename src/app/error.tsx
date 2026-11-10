'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, Copy, Check, Home, RotateCcw } from 'lucide-react';

export default function ErrorBoundaryPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Catat galat ke console untuk investigasi
    console.error('Unhandled route error in VallsHangout:', error);
  }, [error]);

  const handleCopyDebugInfo = async () => {
    const debugText = [
      `Error: ${error.name || 'Error'}: ${error.message}`,
      error.digest ? `Digest: ${error.digest}` : '',
      error.stack ? `Stack Trace:\n${error.stack}` : '',
      `Timestamp: ${new Date().toISOString()}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : 'unknown'}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(debugText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback jika akses clipboard diblokir
      setCopied(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-13rem)] max-w-xl flex-col items-center justify-center px-5 py-12 text-center">
      {/* Kartu Status Error */}
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-soft text-brand shadow-inner">
        <AlertTriangle size={42} strokeWidth={2.2} aria-hidden="true" />
      </div>

      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
        Waduh, ada yang nyangkut nih! 😵
      </h1>

      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
        Terjadi kendala saat memuat halaman ini. Tenang, data nongkrong dan perhitungan kamu aman. Kamu bisa coba muat ulang atau kembali ke beranda.
      </p>

      {/* Tombol Aksi */}
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => reset()}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-control bg-brand px-5 py-3 font-semibold text-ink shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-focus"
        >
          <RotateCcw size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>Coba Lagi</span>
        </button>

        <Link
          href="/"
          className="flex items-center justify-center gap-2 rounded-control border border-line-strong bg-sand px-5 py-3 font-semibold text-ink shadow-sm transition-colors hover:bg-sand-strong focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Home size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>Balik ke Beranda</span>
        </Link>
      </div>

      {/* Accordion Tertutup untuk Debugging Pengembang */}
      <details className="group mt-8 w-full max-w-lg rounded-2xl border border-line bg-surface p-4 text-left shadow-sm transition-all">
        <summary className="flex cursor-pointer select-none items-center justify-between text-xs font-semibold text-muted hover:text-ink">
          <span className="flex items-center gap-2">
            <span>🛠️</span>
            <span>Detail Galat untuk Developer</span>
            {error.digest && (
              <span className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10px] text-muted">
                #{error.digest.slice(0, 8)}
              </span>
            )}
          </span>
          <ChevronDown
            size={16}
            className="transition-transform duration-200 group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div className="mt-4 space-y-3 border-t border-line/60 pt-3 text-xs">
          {error.digest && (
            <div>
              <span className="font-semibold text-muted">Error Digest: </span>
              <code className="rounded bg-sand px-1.5 py-0.5 font-mono text-ink">{error.digest}</code>
            </div>
          )}

          <div>
            <span className="font-semibold text-muted">Pesan: </span>
            <span className="font-mono text-danger font-semibold">{error.message || 'Unknown Error'}</span>
          </div>

          {error.stack && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-semibold text-muted">Stack Trace:</span>
                <button
                  type="button"
                  onClick={handleCopyDebugInfo}
                  className="flex cursor-pointer items-center gap-1 rounded bg-sand px-2 py-1 text-[11px] font-semibold text-ink transition hover:bg-sand-strong"
                >
                  {copied ? (
                    <>
                      <Check size={13} className="text-success" />
                      <span>Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Salin Info</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="max-h-48 overflow-x-auto rounded-lg bg-sand/60 p-3 font-mono text-[11px] leading-relaxed text-ink whitespace-pre-wrap select-all">
                {error.stack}
              </pre>
            </div>
          )}
        </div>
      </details>
    </main>
  );
}

