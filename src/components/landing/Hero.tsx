import Link from 'next/link';
import { SpinWheel } from './SpinWheel';

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-24 pt-12 lg:grid-cols-[1.25fr_0.75fr] lg:pt-20">
      <div>
        <h1 className="text-balance text-[clamp(2.1rem,4.7vw,3.6rem)] font-extrabold leading-[1.06] tracking-[-0.035em]">
          Nongkrongnya diputar,
          <br />
          bayarnya dihitung adil.
        </h1>
        <p className="mt-6 max-w-[44ch] text-lg text-muted">
          Putar roda untuk memilih tempat, lalu bagi struk sesuai pesanan masing-masing. Service dan
          pajak ikut porsi, bukan dibagi rata.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/calculator"
            className="inline-flex h-12 items-center rounded-control bg-brand px-6 font-bold text-ink hover:bg-brand-hover"
          >
            Hitung patungan
          </Link>
          <Link
            href="/new"
            className="inline-flex h-12 items-center rounded-control border border-line-strong bg-surface px-6 font-bold hover:bg-sand"
          >
            Buat hangout
          </Link>
        </div>
        <p className="mt-5 max-w-[46ch] text-sm text-muted">
          Tanpa akun. Data kalkulator tersimpan di HP-mu dan tetap bisa dipakai saat tidak ada internet.
        </p>
      </div>
      <SpinWheel />
    </section>
  );
}
