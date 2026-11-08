import { MotionRoot } from '@/components/MotionRoot';
import { SpinTool } from '@/components/spin/SpinTool';

export const metadata = { title: 'Roda putar' };

export default function SpinPage() {
  return (
    <main className="mx-auto max-w-xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Roda putar</h1>
        <p className="text-sm text-muted">
          Masukkan pilihan, putar, lalu coret yang tidak jadi. Tersimpan di perangkatmu dan jalan tanpa internet.
        </p>
      </header>
      <MotionRoot>
        <SpinTool />
      </MotionRoot>
    </main>
  );
}
