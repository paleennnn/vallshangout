'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV_ITEMS, activeIndex } from './nav-items';

const TEXT_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select';

/**
 * Bottom nav mengambang untuk mobile: pill charcoal yang melayang di atas tepi bawah,
 * item aktif berupa lingkaran krem. Disembunyikan saat mengetik (keyboard layar menutupi
 * layar dan bar tetap menempel di atasnya) dan di layar md ke atas (diganti header).
 */
export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const index = activeIndex(pathname);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const onIn = (e: FocusEvent) => setTyping(e.target instanceof HTMLElement && e.target.matches(TEXT_FIELD));
    const onOut = () => setTyping(false);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  return (
    <div
      inert={typing}
      aria-hidden={typing || undefined}
      className={`on-night pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] transition-[transform,opacity] duration-300 ease-out md:hidden ${
        typing ? 'translate-y-[140%] opacity-0' : ''
      }`}
    >
      <nav
        aria-label="Navigasi utama"
        className="pointer-events-auto relative grid w-full max-w-[23rem] rounded-full bg-night p-2 shadow-[0_14px_32px_-10px_rgba(41,37,36,0.6)]"
        style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))` }}
      >
        {/* lingkaran penanda aktif: bergeser antar item, lebar = satu kolom */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 left-2 top-2 flex justify-center transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.3,0.9,0.3,1)]"
          style={{
            width: `calc((100% - 1rem) / ${NAV_ITEMS.length})`,
            transform: `translateX(${Math.max(index, 0) * 100}%)`,
            opacity: index < 0 ? 0 : 1,
          }}
        >
          <span className="aspect-square h-full rounded-full bg-cream" />
        </span>

        {NAV_ITEMS.map((item, i) => {
          const Icon = item.icon;
          const active = i === index;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              className={`relative z-10 flex h-14 items-center justify-center rounded-full transition-colors duration-300 ${
                active ? 'text-ink' : 'text-cream/75 active:text-cream'
              }`}
            >
              <Icon size={24} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
              <span className="sr-only">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
