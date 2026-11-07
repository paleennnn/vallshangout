import Link from 'next/link';

export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl">📡</div>
      <h1 className="text-2xl font-bold">Kamu sedang offline</h1>
      <p className="text-zinc-400">
        Halaman ini belum tersimpan di perangkatmu. Kalkulator patungan tetap bisa dipakai tanpa
        internet.
      </p>
      <Link href="/calculator" className="rounded-xl bg-brand-500 px-5 py-3 font-semibold hover:bg-brand-400">
        Buka kalkulator
      </Link>
    </main>
  );
}
