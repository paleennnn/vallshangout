import type { Metadata } from 'next';
import { BackButton } from '@/components/BackButton';
import { Room } from '@/components/Room';

export const metadata: Metadata = {
  title: 'Room hangout',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function HangoutPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <BackButton />
      <Room code={code.toUpperCase()} />
    </main>
  );
}
