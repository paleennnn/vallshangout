import { BackButton } from '@/components/BackButton';
import { Room } from '@/components/Room';

export const metadata = { title: 'Room hangout' };

export default async function HangoutPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <BackButton />
      <Room code={code.toUpperCase()} />
    </main>
  );
}
