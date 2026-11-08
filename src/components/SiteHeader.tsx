'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, activeIndex } from './nav-items';

/**
 * Header situs. Di beranda tampil di semua ukuran layar; di halaman lain hanya di md ke atas,
 * karena di mobile perpindahan halaman memakai bottom nav dan tinggi layar lebih berharga.
 */
export function SiteHeader() {
  const pathname = usePathname() ?? '/';
  const current = activeIndex(pathname);
  const isHome = pathname === '/';

  return (
    <header
      className={`sticky top-0 z-40 border-b border-line bg-cream/90 backdrop-blur ${isHome ? '' : 'hidden md:block'}`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
          <Image
            src="/images/LogoFill_noBg.png"
            alt="VallsHangout Logo"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
            priority
          />
          <span>vallshangout</span>
        </Link>
        <nav aria-label="Navigasi situs" className="hidden items-center gap-1 text-sm font-semibold md:flex">
          {NAV_ITEMS.filter((item) => item.href !== '/').map((item) => {
            const active = NAV_ITEMS.indexOf(item) === current;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-control px-3 py-2 hover:bg-sand ${active ? 'bg-sand' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
