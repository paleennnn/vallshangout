'use client';

import React, { useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { Heart, Sparkles, X, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { MotionRoot } from '@/components/MotionRoot';

export interface ThankYouModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CONFETTI = [
  { x: -42, y: -40, color: '#f97316', size: 9, delay: 0.1 },
  { x: 42, y: -42, color: '#eab308', size: 7, delay: 0.15 },
  { x: -50, y: 12, color: '#ec4899', size: 8, delay: 0.2 },
  { x: 48, y: 14, color: '#10b981', size: 9, delay: 0.25 },
  { x: -20, y: -52, color: '#6366f1', size: 7, delay: 0.05 },
  { x: 24, y: -50, color: '#f43f5e', size: 8, delay: 0.12 },
  { x: 0, y: -56, color: '#fb923c', size: 8, delay: 0.18 },
  { x: -44, y: -16, color: '#14b8a6', size: 6, delay: 0.22 },
  { x: 44, y: -16, color: '#8b5cf6', size: 7, delay: 0.24 },
];

export function ThankYouModal({ isOpen, onClose }: ThankYouModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<'thanks' | 'qris'>('thanks');
  const [animKey, setAnimKey] = useState(0);

  const qrisAsset = process.env.NEXT_PUBLIC_QRIS_ASSET_NAME || 'bg-pattern-3928.png';

  // Sinkronisasi status dialog native dengan prop isOpen
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      setView('thanks');
      setAnimKey((k) => k + 1);
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else {
      if (typeof dialog.close === 'function') {
        if (dialog.open) dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [isOpen]);

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
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="thank-you-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-night/60 backdrop:backdrop-blur-xs"
    >
      <MotionRoot>
        <div className="relative p-5 sm:p-6">
          {/* Tombol Tutup Silang di Kanan Atas */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-sand hover:text-ink focus-visible:outline-2 focus-visible:outline-focus cursor-pointer"
            aria-label="Tutup modal"
          >
            <X size={18} aria-hidden="true" />
          </button>

          {view === 'thanks' ? (
            /* TAMPILAN 1: ANIMASI TERIMA KASIH & APRESIASI */
            <div key={`thanks-${animKey}`} className="flex flex-col items-center text-center">
              {/* Panggung Animasi Toast Gelas & Kembang Api Confetti */}
              <div className="relative mb-3 flex h-28 w-28 items-center justify-center">
                {/* Efek Pendar Cahaya Hangat */}
                <m.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 0.4 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="absolute h-24 w-24 rounded-full bg-brand-soft blur-xl"
                  aria-hidden="true"
                />

                {/* Partikel Confetti Meletup Keluar Seperti Kembang Api (Hanya di Awal) */}
                {CONFETTI.map((c, i) => (
                  <m.span
                    key={i}
                    initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
                    animate={{
                      scale: [0, 1.25, 1],
                      x: c.x,
                      y: c.y,
                      opacity: [0, 1, 0.9],
                      rotate: [0, 180 + i * 30],
                    }}
                    transition={{
                      duration: 0.65,
                      delay: c.delay,
                      ease: 'easeOut',
                    }}
                    className="pointer-events-none absolute rounded-full"
                    style={{
                      width: c.size,
                      height: c.size,
                      backgroundColor: c.color,
                    }}
                    aria-hidden="true"
                  />
                ))}

                {/* Percikan Kilau 'CLINK!' di Titik Benturan */}
                <m.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.4, 0], opacity: [0, 1, 0] }}
                  transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
                  className="absolute z-20 text-brand"
                  aria-hidden="true"
                >
                  <Sparkles size={28} />
                </m.div>

                {/* Dua Gelas Bersulang (Toast Animation - Hanya Masuk di Awal) */}
                <div className="relative z-10 flex items-center justify-center">
                  {/* Gelas Kiri */}
                  <m.div
                    initial={{ rotate: -28, x: -18, opacity: 0 }}
                    animate={{
                      rotate: [-28, 8, -4, 0],
                      x: [-18, 3, 0],
                      opacity: 1,
                    }}
                    transition={{
                      duration: 0.65,
                      ease: 'easeOut',
                    }}
                    className="text-3xl select-none sm:text-4xl"
                    aria-hidden="true"
                  >
                    🍻
                  </m.div>

                  {/* Emoji Sorak Ceria */}
                  <m.div
                    initial={{ scale: 0, y: 10 }}
                    animate={{
                      scale: [0, 1.2, 1],
                      y: [10, -4, 0],
                    }}
                    transition={{
                      duration: 0.5,
                      delay: 0.25,
                      ease: 'backOut',
                    }}
                    className="absolute -top-3 text-2xl select-none"
                    aria-hidden="true"
                  >
                    🎉
                  </m.div>
                </div>
              </div>

              {/* Status Sukses Tersalin */}
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.15 }}
                className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success-bg px-3 py-1 text-xs font-semibold text-success"
              >
                <CheckCircle2 size={14} />
                <span>Teks Berhasil Disalin ke Clipboard!</span>
              </m.div>

              {/* Headline Sesuai Instruksi User */}
              <m.h2
                id="thank-you-title"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="text-lg font-extrabold tracking-tight text-ink sm:text-xl"
              >
                Terima kasih telah menggunakan VallsHangout!
              </m.h2>

              {/* Pesan Sering-Sering Nongkrong */}
              <m.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.28 }}
                className="mt-2 text-sm leading-relaxed text-muted"
              >
                Sering-sering nongkrong ya! 😋 Rincian patungan sudah rapi dan siap langsung kamu kirim ke grup WhatsApp.
              </m.p>

              {/* Garis Pembatas Lembut */}
              <div className="my-5 w-full border-t border-line/70" />

              {/* Tombol Aksi: Support Me & Tutup */}
              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35 }}
                className="flex w-full flex-col gap-2.5"
              >
                {/* Tombol Support Me (Membuka Modal QRIS) */}
                <button
                  type="button"
                  onClick={() => setView('qris')}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#F1E5D8] px-4 py-2.5 text-sm font-semibold text-[#7E5340] shadow-xs transition-all hover:bg-[#E8D8C6] hover:text-[#5C3B2B] active:scale-95 focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Heart size={18} aria-hidden="true" className="shrink-0 fill-[#7E5340] text-[#7E5340]" />
                  <span>Support me</span>
                </button>

                {/* Tombol Selesai */}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full cursor-pointer rounded-xl bg-sand py-2 text-sm font-semibold text-ink transition hover:bg-sand-strong focus-visible:outline-2 focus-visible:outline-focus"
                >
                  Selesai
                </button>
              </m.div>
            </div>
          ) : (
            /* TAMPILAN 2: MODAL QRIS PERSIS SEPERTI DI FOOTER */
            <div key="qris-view" className="space-y-4 text-left">
              <div className="flex items-start justify-between gap-3 pr-6">
                <div>
                  <h2 id="thank-you-title" className="text-lg font-bold text-ink">
                    Support VallsHangout
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    Scan QRIS di bawah ini dengan aplikasi e-wallet atau mobile banking favoritmu.
                  </p>
                </div>
              </div>

              {/* Gambar QRIS Obfuscated */}
              <div className="overflow-hidden rounded-xl border border-line bg-paper p-3 text-center">
                <img
                  src={`/images/${qrisAsset}`}
                  alt="Donasi"
                  className="mx-auto aspect-[726/1024] w-full max-w-[240px] rounded-lg object-contain shadow-xs"
                />
                <p className="mt-3 text-xs font-semibold text-ink">G TRADING &amp; AIRDROP</p>
                <p className="text-[11px] text-muted">NMID: ID1025427539560</p>
              </div>

              {/* Tombol Kembali ke Ucapan & Tutup */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setView('thanks')}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control bg-sand py-2 text-sm font-semibold text-ink hover:bg-sand-strong focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <ArrowLeft size={16} />
                  <span>Kembali</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 cursor-pointer rounded-control bg-brand py-2 text-sm font-semibold text-ink hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-focus"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}
        </div>
      </MotionRoot>
    </dialog>
  );
}

