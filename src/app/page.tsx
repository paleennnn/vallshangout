import Image from 'next/image';
import Link from 'next/link';
import { InstallPrompt } from '@/components/InstallPrompt';
import { JoinByCode } from '@/components/JoinByCode';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 p-6">
      <header className="space-y-3">
        <Image
          src="/images/LogoFill_noBg.png"
          alt="VallsHangout"
          width={100}
          height={100}
          priority
          className="h-20 w-20 object-contain"
        />
        <p className="text-sm font-semibold tracking-widest text-brand-300">VALLSHANGOUT</p>
        <h1 className="text-4xl font-extrabold leading-tight">
          Bingung? <span className="text-brand-400">Spin.</span> Nongkrong.{' '}
          <span className="text-pink-400">Bagi bayar.</span>
        </h1>
        <p className="text-zinc-400">
          Putuskan mau nongkrong di mana, lalu patungan dengan adil — service & tax dibagi sesuai
          pesanan masing-masing.
        </p>
      </header>

      <div className="grid gap-3">
        <Link
          href="/calculator"
          className="rounded-2xl bg-brand-500 px-5 py-4 text-center text-lg font-semibold hover:bg-brand-400"
        >
          🧾 Kalkulator patungan
          <span className="block text-sm font-normal text-white/80">Tanpa akun · jalan offline</span>
        </Link>
        <Link
          href="/new"
          className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center text-lg font-semibold hover:bg-white/10"
        >
          🎡 Buat hangout baru
          <span className="block text-sm font-normal text-zinc-400">Undang teman lewat link</span>
        </Link>
        <JoinByCode />
      </div>

      <InstallPrompt />
    </main>
  );
}
