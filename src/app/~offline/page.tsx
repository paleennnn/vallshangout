import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <WifiOff size={44} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Kamu sedang offline</h1>
      <p className="text-muted">
        Halaman ini belum tersimpan di perangkatmu. Kalkulator patungan tetap bisa dipakai tanpa
        internet.
      </p>
      <Link href="/calculator" className="rounded-xl bg-brand px-5 py-3 font-semibold hover:bg-brand-hover">
        Buka kalkulator
      </Link>
    </main>
  );
}
