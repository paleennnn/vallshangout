'use client';

import { WifiOff } from 'lucide-react';
import { useOnline } from '@/hooks/useOnline';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-warning/20 bg-warning-bg px-4 py-2 text-center text-sm font-medium text-warning"
    >
      <WifiOff size={16} className="shrink-0" aria-hidden="true" />
      Kamu sedang offline. Kalkulator tetap bisa dipakai, fitur room butuh internet.
    </div>
  );
}
