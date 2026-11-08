'use client';

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Dialog modal: bottom sheet di mobile, modal di tengah pada md ke atas.
 * Memakai <dialog> bawaan (fokus terkunci, Esc menutup, latar belakang tidak bisa diklik) dengan
 * fallback `open` untuk lingkungan tanpa showModal. Isi hanya dipasang saat terbuka sehingga
 * formulir selalu mulai dari keadaan bersih.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    if (!open) return;
    // Cegah halaman di belakang ikut bergulir (terutama di iOS)
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prev;
    };
  }, [open]);

  // Klik di area gelap (target = dialog itu sendiri, bukan isinya) menutup sheet
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={onBackdrop}
      className="sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[1.25rem] border-0 bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/50 md:m-auto md:max-w-md md:rounded-card"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-sand"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {open && children}
        </div>
      </div>
    </dialog>
  );
}
