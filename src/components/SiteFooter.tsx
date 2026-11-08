'use client';

import { useRef } from 'react';
import { Heart, X } from 'lucide-react';

export function SiteFooter() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const qrisAsset = process.env.NEXT_PUBLIC_QRIS_ASSET_NAME || 'bg-pattern-3928.png';

  function openModal() {
    if (typeof dialogRef.current?.showModal === 'function') {
      dialogRef.current.showModal();
    } else {
      dialogRef.current?.setAttribute('open', '');
    }
  }

  function closeModal() {
    if (typeof dialogRef.current?.close === 'function') {
      dialogRef.current.close();
    } else {
      dialogRef.current?.removeAttribute('open');
    }
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width;
    if (!isInDialog) {
      closeModal();
    }
  };

  return (
    <footer className="border-t border-line bg-cream">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-6 sm:flex-row">
        <p className="text-center text-sm text-muted sm:text-left">
          Developed by{' '}
          <a
            href="https://www.instagram.com/valeennszz"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ink underline underline-offset-4 decoration-line-strong hover:text-brand hover:decoration-brand"
          >
            Paleennnn
          </a>{' '}
          · Logo &amp; Favicon by{' '}
          <a
            href="https://www.instagram.com/aymkip._"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ink underline underline-offset-4 decoration-line-strong hover:text-brand hover:decoration-brand"
          >
            Rizal
          </a>{' '}
          · © 2026
        </p>

        {/* Tombol Support Me */}
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#F1E5D8] px-4 py-2 text-sm font-semibold text-[#7E5340] transition-colors hover:bg-[#E8D8C6] hover:text-[#5C3B2B] active:scale-95 focus-visible:outline-2 focus-visible:outline-focus"
          aria-haspopup="dialog"
        >
          <Heart size={18} aria-hidden="true" className="shrink-0 text-[#7E5340]" />
          <span>Support me</span>
        </button>
      </div>

      {/* Modal Popup QRIS */}
      <dialog
        ref={dialogRef}
        onClick={handleBackdropClick}
        aria-labelledby="qris-dialog-title"
        aria-describedby="qris-dialog-desc"
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl backdrop:bg-night/60 backdrop:backdrop-blur-xs"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="qris-dialog-title" className="text-lg font-bold">
                Support VallsHangout
              </h2>
              <p id="qris-dialog-desc" className="mt-1 text-xs text-muted">
                Scan QRIS di bawah ini dengan aplikasi e-wallet atau mobile banking favoritmu.
              </p>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="rounded-lg p-1.5 text-muted hover:bg-sand hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
              aria-label="Tutup modal donasi"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* Gambar QRIS Obfuscated */}
          <div className="overflow-hidden rounded-xl border border-line bg-paper p-3 text-center">
            <img
              src={`/images/${process.env.NEXT_PUBLIC_QRIS_ASSET_NAME || qrisAsset}`}
              alt="Donasi"
              className="mx-auto aspect-[726/1024] w-full max-w-[260px] rounded-lg object-contain shadow-xs"
            />
            <p className="mt-3 text-xs font-semibold text-ink">G TRADING &amp; AIRDROP</p>
            <p className="text-[11px] text-muted">NMID: ID1025427539560</p>
          </div>

          <button
            type="button"
            onClick={closeModal}
            className="w-full rounded-control bg-sand py-2 text-sm font-semibold text-ink hover:bg-sand-strong"
          >
            Tutup
          </button>
        </div>
      </dialog>
    </footer>
  );
}

