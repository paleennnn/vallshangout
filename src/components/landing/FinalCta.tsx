import Link from 'next/link';
import { InstallPrompt } from '@/components/InstallPrompt';
import { JoinByCode } from '@/components/JoinByCode';
import { SiteFooter } from '@/components/SiteFooter';

export function FinalCta() {
  return (
    <>
      <section className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <h2 className="text-balance text-[clamp(2rem,4.2vw,3.2rem)] font-extrabold leading-[1.06] tracking-[-0.03em]">
              Nongkrong malam ini?
            </h2>
            <p className="mt-4 max-w-[40ch] text-lg text-muted">
              Mulai dari kalkulator kalau struknya sudah ada, atau buat hangout dan kirim link ke teman-teman.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/calculator" className="inline-flex h-12 items-center rounded-control bg-brand px-6 font-bold text-ink hover:bg-brand-hover">
                Hitung patungan
              </Link>
              <Link href="/new" className="inline-flex h-12 items-center rounded-control border border-line-strong bg-cream px-6 font-bold hover:bg-sand">
                Buat hangout
              </Link>
            </div>
          </div>

          <div className="space-y-5 self-end">
            <div>
              <p className="mb-2 text-sm font-semibold">Sudah dapat kode dari temanmu?</p>
              <JoinByCode />
            </div>
            <InstallPrompt />
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
