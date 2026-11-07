import { NewHangoutForm } from '@/components/NewHangoutForm';

export const metadata = { title: 'Hangout baru' };

export default function NewPage() {
  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Hangout baru</h1>
      <NewHangoutForm />
    </main>
  );
}
