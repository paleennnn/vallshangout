import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Calculator } from '@/components/calculator/Calculator';

export const metadata = { title: 'Kalkulator patungan' };

export default function CalculatorPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 pb-24 sm:p-6">
      <header className="space-y-1">
        <Link href="/" className="hidden items-center gap-1.5 text-sm text-muted hover:text-ink md:inline-flex">
          <ArrowLeft size={14} aria-hidden="true" />
          Beranda
        </Link>
        <h1 className="text-2xl font-bold">Kalkulator patungan</h1>
        <p className="text-sm text-muted">
          Service & tax dibagi sesuai pesanan masing-masing. Data tersimpan di perangkatmu dan
          berjalan tanpa internet.
        </p>
      </header>
      <Calculator />
    </main>
  );
}
