'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, Copy, Check, RotateCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error('Fatal Root Layout Error in VallsHangout:', error);
  }, [error]);

  const handleCopyDebugInfo = async () => {
    const debugText = [
      `Fatal Error: ${error.name || 'Error'}: ${error.message}`,
      error.digest ? `Digest: ${error.digest}` : '',
      error.stack ? `Stack Trace:\n${error.stack}` : '',
      `Timestamp: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(debugText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          padding: '1.5rem',
          backgroundColor: '#fff7ed',
          color: '#292524',
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <main
          style={{
            maxWidth: '36rem',
            width: '100%',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Ikon Error Fatal */}
          <div
            style={{
              width: '4.5rem',
              height: '4.5rem',
              borderRadius: '1rem',
              backgroundColor: '#ffedd5',
              color: '#f97316',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.5rem',
            }}
          >
            <AlertTriangle size={38} strokeWidth={2.2} aria-hidden="true" />
          </div>

          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              margin: '0 0 0.75rem',
              letterSpacing: '-0.02em',
            }}
          >
            Terjadi Masalah Fatal pada Sistem
          </h1>

          <p
            style={{
              color: '#6f6761',
              fontSize: '0.95rem',
              lineHeight: 1.6,
              margin: '0 0 2rem',
              maxWidth: '28rem',
            }}
          >
            Aplikasi mengalami galat di tingkat inti. Kamu bisa mencoba memuat ulang tampilan atau menyegarkan peramban.
          </p>

          {/* Tombol Aksi */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              justifyContent: 'center',
              marginBottom: '2rem',
              width: '100%',
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: '#f97316',
                color: '#292524',
                fontWeight: 600,
                fontSize: '0.95rem',
                padding: '0.75rem 1.25rem',
                borderRadius: '0.75rem',
                border: 'none',
              }}
            >
              <RotateCcw size={16} strokeWidth={2.2} />
              <span>Coba Pulihkan</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.href = '/';
              }}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: '#f6efe4',
                color: '#292524',
                fontWeight: 600,
                fontSize: '0.95rem',
                padding: '0.75rem 1.25rem',
                borderRadius: '0.75rem',
                border: '1px solid #d6d3d1',
              }}
            >
              <span>Muat Ulang Beranda</span>
            </button>
          </div>

          {/* Debug Accordion */}
          <details
            style={{
              width: '100%',
              maxWidth: '30rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e7e5e4',
              borderRadius: '1rem',
              padding: '1rem',
              textAlign: 'left',
              fontSize: '0.8rem',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                fontWeight: 600,
                color: '#6f6761',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                userSelect: 'none',
              }}
            >
              <span>🛠️ Detail Galat Fatal (Debugging)</span>
              <ChevronDown size={14} />
            </summary>

            <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e7e5e4', paddingTop: '0.75rem' }}>
              {error.digest && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong style={{ color: '#6f6761' }}>Digest: </strong>
                  <code>{error.digest}</code>
                </div>
              )}
              <div style={{ marginBottom: '0.5rem', color: '#b91c1c', fontWeight: 600 }}>
                {error.name || 'Error'}: {error.message}
              </div>

              {error.stack && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#6f6761' }}>Stack Trace:</span>
                    <button
                      type="button"
                      onClick={handleCopyDebugInfo}
                      style={{
                        cursor: 'pointer',
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.75rem',
                        borderRadius: '0.4rem',
                        border: '1px solid #d6d3d1',
                        backgroundColor: '#f6efe4',
                      }}
                    >
                      {copied ? 'Tersalin! ✅' : 'Salin Info'}
                    </button>
                  </div>
                  <pre
                    style={{
                      maxHeight: '12rem',
                      overflowX: 'auto',
                      backgroundColor: '#f6efe4',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.7rem',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {error.stack}
                  </pre>
                </div>
              )}
            </div>
          </details>
        </main>
      </body>
    </html>
  );
}

