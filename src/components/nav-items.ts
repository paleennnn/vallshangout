import { Calculator, House, LoaderPinwheel, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Halaman mana saja yang dianggap bagian dari item ini (untuk status aktif). */
  match: (pathname: string) => boolean;
}

/** Satu sumber kebenaran untuk bottom nav (mobile) dan header (desktop). */
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Beranda', icon: House, match: (p) => p === '/' },
  { href: '/calculator', label: 'Kalkulator', icon: Calculator, match: (p) => p.startsWith('/calculator') },
  { href: '/spin', label: 'Roda', icon: LoaderPinwheel, match: (p) => p.startsWith('/spin') },
  {
    href: '/hangouts',
    label: 'Hangout',
    icon: Users,
    match: (p) => p.startsWith('/hangouts') || p.startsWith('/h/') || p.startsWith('/new'),
  },
];

export function activeIndex(pathname: string): number {
  return NAV_ITEMS.findIndex((item) => item.match(pathname));
}
