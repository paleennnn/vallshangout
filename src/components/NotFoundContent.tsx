'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { m } from 'motion/react';
import { ArrowLeft, Home, Sparkles } from 'lucide-react';
import { MotionRoot } from '@/components/MotionRoot';

export function NotFoundContent() {
  const router = useRouter();

  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <MotionRoot>
      <main className="mx-auto flex min-h-[calc(100dvh-13rem)] max-w-xl flex-col items-center justify-center px-5 py-12 text-center">
        {/* Stage Animasi Karakter & Elemen Mengejek */}
        <div className="relative mb-6 flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56">
          {/* Efek Lingkaran Pendar di Latar Belakang */}
          <m.div
            animate={{
              scale: [1, 1.08, 1],
              opacity: [0.35, 0.55, 0.35],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute h-40 w-40 rounded-full bg-brand-soft blur-xl sm:h-48 sm:w-48"
            aria-hidden="true"
          />

          {/* Chip Mengejek: Kiri Atas (404 ZONK!) */}
          <m.div
            animate={{
              y: [0, -8, 0],
              rotate: [-6, 2, -6],
            }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute -left-2 top-2 z-20 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-brand shadow-sm select-none sm:-left-4"
          >
            404 ZONK! 💨
          </m.div>

          {/* Chip Mengejek: Kanan Bawah (Nyari apa hayoo? 👀) */}
          <m.div
            animate={{
              y: [0, 8, 0],
              rotate: [4, -4, 4],
            }}
            transition={{
              duration: 3.2,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 0.4,
            }}
            className="absolute -right-3 bottom-3 z-20 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted shadow-sm select-none sm:-right-5"
          >
            Nyari apa hayoo? 👀
          </m.div>

          {/* Sparkles / Bintang Berkelip */}
          <m.div
            animate={{
              scale: [0.8, 1.25, 0.8],
              rotate: [0, 90, 180],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute right-3 top-4 z-10 text-brand"
            aria-hidden="true"
          >
            <Sparkles size={22} />
          </m.div>

          {/* Kaca Pembesar Mengambang & Berputar Mencari Sesuatu yang Nihil */}
          <m.div
            animate={{
              x: [-34, 34, -20, 20, -34],
              y: [-16, 16, 24, -24, -16],
              rotate: [-20, 25, -15, 18, -20],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="pointer-events-none absolute z-30 flex h-14 w-14 items-center justify-center drop-shadow-md"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 48 48"
              fill="none"
              className="h-full w-full stroke-ink"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="20" cy="20" r="13" className="fill-surface/60 backdrop-blur-xs stroke-brand" />
              <line x1="30" y1="30" x2="42" y2="42" strokeWidth="4" />
              {/* Kilau kaca pembesar */}
              <path d="M14 14 A 8 8 0 0 1 24 14" stroke="#fb923c" strokeWidth="2.5" />
            </svg>
          </m.div>

          {/* Maskot Kepala dengan Ekspresi Mengejek (😋) */}
          <m.div
            animate={{
              y: [0, -10, 0],
              rotate: [-5, 5, -5],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="relative z-10 flex h-32 w-32 items-center justify-center rounded-full border-4 border-sand-strong bg-surface shadow-md select-none sm:h-36 sm:w-36"
          >
            {/* Wajah Maskot SVG */}
            <svg viewBox="0 0 100 100" className="h-24 w-24 sm:h-28 sm:w-28" aria-hidden="true">
              {/* Pipi Merona / Blushing */}
              <circle cx="22" cy="56" r="6" fill="#fed7aa" opacity="0.8" />
              <circle cx="78" cy="56" r="6" fill="#fed7aa" opacity="0.8" />

              {/* Mata Kiri (Kedipan Mengejek / Arched Wink) */}
              <path
                d="M 24 42 Q 32 34 40 42"
                fill="none"
                stroke="var(--color-ink, #292524)"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {/* Mata Kanan (Terbuka Meledek dengan Alis Naik) */}
              <path
                d="M 60 30 Q 69 24 78 30"
                fill="none"
                stroke="var(--color-ink, #292524)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="69" cy="40" r="4.5" fill="var(--color-ink, #292524)" />

              {/* Mulut Tersenyum */}
              <path
                d="M 33 56 Q 50 68 67 56"
                fill="none"
                stroke="var(--color-ink, #292524)"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {/* Lidah Melet (😋) yang Bergoyang / Menjulur Mengejek */}
              <g className="origin-[50px_62px]">
                <m.path
                  d="M 44 60 C 44 76, 56 76, 56 60 Z"
                  fill="#f43f5e"
                  stroke="#be123c"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  animate={{
                    rotate: [-16, 16, -16],
                    scaleY: [1, 1.15, 1],
                  }}
                  transition={{
                    duration: 0.9,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
                {/* Garis tengah lidah */}
                <line x1="50" y1="62" x2="50" y2="70" stroke="#be123c" strokeWidth="1.5" strokeLinecap="round" />
              </g>
            </svg>
          </m.div>
        </div>

        {/* Teks Headline Sesuai Instruksi User */}
        <m.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl"
        >
          Jangan nyari yang gaada ya
          <m.span
            className="ml-1 inline-block"
            animate={{
              rotate: [0, 15, -15, 0],
              scale: [1, 1.25, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            😋
          </m.span>
        </m.h1>

        {/* Subteks Khas VallsHangout */}
        <m.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base"
        >
          Halaman atau tongkrongan yang kamu cari emang beneran ga ada di sini. Mungkin link-nya salah ketik, tongkrongannya udah bubar, atau emang cuma khayalan kamu aja. Atau emang niat kamu ga baik? 😏
        </m.p>

        {/* Tombol Aksi: Kembali ke Sebelumnya & Balik ke Beranda */}
        <m.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center"
        >
          {/* Tombol Kembali ke Halaman Sebelumnya */}
          <m.button
            type="button"
            onClick={handleGoBack}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            className="flex items-center justify-center gap-2 rounded-control border border-line-strong bg-sand px-5 py-3 font-semibold text-ink shadow-sm transition-colors hover:bg-sand-strong focus-visible:outline-2 focus-visible:outline-focus cursor-pointer"
          >
            <ArrowLeft size={18} strokeWidth={2.2} aria-hidden="true" />
            <span>Ke Halaman Sebelumnya</span>
          </m.button>

          {/* Tombol Balik ke Beranda */}
          <m.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} className="flex">
            <Link
              href="/"
              className="flex w-full items-center justify-center gap-2 rounded-control bg-brand px-5 py-3 font-semibold text-ink shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-focus"
            >
              <Home size={18} strokeWidth={2.2} aria-hidden="true" />
              <span>Balik ke Beranda</span>
            </Link>
          </m.div>
        </m.div>
      </main>
    </MotionRoot>
  );
}

