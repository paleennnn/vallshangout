'use client';

import { useRef, useState } from 'react';
import { Wheel, type WheelHandle } from '@/components/wheel/Wheel';

const PLACES = ['Cafe A', 'Billiard', 'Rental PS', 'Karaoke', 'Warung', 'Futsal', 'Cafe B', 'Bowling'];

/** Roda di hero landing: berputar sekali saat halaman dibuka, lalu bisa diputar ulang. */
export function SpinWheel() {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const wheel = useRef<WheelHandle>(null);

  return (
    <div className="mx-auto w-full max-w-[380px]">
      <Wheel
        ref={wheel}
        labels={PLACES}
        autoSpinMs={900}
        onSpinStart={() => {
          setSpinning(true);
          setResult(null);
        }}
        onResult={(i) => {
          setSpinning(false);
          setResult(i);
        }}
      />
      <p className="mt-6 min-h-14 text-center text-lg" aria-live="polite">
        {result === null ? (
          <span className="text-muted">{spinning ? 'Memilih tempat…' : 'Ketuk Putar untuk memilih tempat.'}</span>
        ) : (
          <>
            <span className="text-muted">Malam ini ke </span>
            <span className="font-extrabold">{PLACES[result]}</span>
            <button
              type="button"
              onClick={() => wheel.current?.spin()}
              className="ml-3 text-sm font-semibold text-brand-ink underline underline-offset-4"
            >
              Putar lagi
            </button>
          </>
        )}
      </p>
    </div>
  );
}
