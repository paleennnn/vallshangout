import type { Metadata } from 'next';
import { NewHangoutForm } from '@/components/NewHangoutForm';

export const metadata: Metadata = {
  title: 'Hangout baru',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NewPage() {
  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Hangout baru</h1>
      <NewHangoutForm />
    </main>
  );
}
