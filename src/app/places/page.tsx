import { MotionRoot } from '@/components/MotionRoot';
import { PlacesView } from '@/components/places/PlacesView';

export const metadata = { title: 'Tempat' };

export default function PlacesPage() {
  return (
    <main className="mx-auto max-w-xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Tempat</h1>
        <p className="text-sm text-muted">
          Simpan tempat langganan beserta service dan pajaknya. Tersimpan di perangkatmu dan jalan tanpa internet.
        </p>
      </header>
      <MotionRoot>
        <PlacesView />
      </MotionRoot>
    </main>
  );
}
