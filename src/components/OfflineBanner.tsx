'use client';

import { useOnline } from '@/hooks/useOnline';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950"
    >
      Kamu sedang offline — kalkulator tetap bisa dipakai, fitur room butuh internet.
    </div>
  );
}
