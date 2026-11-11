import type { Metadata } from 'next';
import { HangoutsHub } from '@/components/HangoutsHub';

export const metadata: Metadata = {
  title: 'Hangout',
  robots: {
    index: false,
    follow: false,
  },
};

export default function HangoutsPage() {
  return (
    <main className="mx-auto max-w-xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Hangout</h1>
        <p className="text-sm text-muted">Ajak teman lewat link, lihat siapa yang ikut, lalu putuskan tempatnya bareng-bareng.</p>
      </header>
      <HangoutsHub />
    </main>
  );
}
