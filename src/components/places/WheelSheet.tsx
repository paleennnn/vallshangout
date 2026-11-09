'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Calculator, Check, RotateCw } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { MAX_WHEEL_OPTIONS, Wheel, type WheelHandle } from '@/components/wheel/Wheel';
import { buildSpinOptions, type SpinOption } from '@/lib/engine/spin';
import { toSpinStats, type Place } from '@/lib/places/store';

/** Bila terlalu banyak tempat, ambil yang bobotnya tertinggi dengan urutan asli tetap. */
export function capOptions(options: SpinOption[], max: number): SpinOption[] {
  if (options.length <= max) return options;
  const keep = new Set(
    [...options]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, max)
      .map((o) => o.ref_id),
  );
  return options.filter((o) => keep.has(o.ref_id));
}

function Body({ places, onVisit }: { places: Place[]; onVisit: (id: string) => void }) {
  const wheel = useRef<WheelHandle>(null);
  const [spinning, setSpinning] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<string[]>([]);

  // Dibekukan saat sheet dibuka: mencatat kunjungan tidak boleh mengubah irisan di bawah penunjuk.
  const [options] = useState(() =>
    capOptions(
      buildSpinOptions(
        places.map((p) => ({ id: p.id, name: p.name })),
        toSpinStats(places),
        new Date(),
        { minWeight: 0.4 },
      ),
      MAX_WHEEL_OPTIONS,
    ),
  );

  const picked = places.find((p) => p.id === resultId);

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-[320px] pt-2">
        <Wheel
          ref={wheel}
          labels={options.map((o) => o.label)}
          weights={options.map((o) => o.weight)}
          onSpinStart={() => {
            setSpinning(true);
            setResultId(null);
          }}
          onResult={(i) => {
            setSpinning(false);
            setResultId(options[i].ref_id);
          }}
        />
      </div>
      <p className="text-center text-sm text-muted">
        Irisan yang lebih besar berarti tempat itu lebih lama tidak dikunjungi, jadi peluangnya lebih besar.
      </p>

      <div className="min-h-[7rem] text-center" aria-live="polite">
        {spinning && <p className="pt-3 text-lg text-muted">Memilih…</p>}
        {!spinning && !picked && <p className="pt-3 text-muted">Ketuk Putar di tengah roda.</p>}
        {!spinning && picked && (
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted">Malam ini ke</p>
              <p className="text-2xl font-extrabold leading-tight tracking-tight">{picked.name}</p>
            </div>
            <Link
              href={`/calculator?place=${picked.id}`}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-control bg-brand font-bold text-ink hover:bg-brand-hover"
            >
              <Calculator size={18} aria-hidden="true" />
              Hitung patungan di sini
            </Link>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={recorded.includes(picked.id)}
                onClick={() => {
                  onVisit(picked.id);
                  setRecorded((r) => [...r, picked.id]);
                }}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-sand text-sm font-semibold hover:bg-sand-strong disabled:opacity-70"
              >
                <Check size={16} aria-hidden="true" />
                {recorded.includes(picked.id) ? 'Kunjungan tercatat' : 'Catat kunjungan'}
              </button>
              <button
                type="button"
                onClick={() => wheel.current?.spin()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-sand text-sm font-semibold hover:bg-sand-strong"
              >
                <RotateCw size={16} aria-hidden="true" />
                Putar lagi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function WheelSheet({
  open,
  onClose,
  places,
  onVisit,
}: {
  open: boolean;
  onClose: () => void;
  places: Place[];
  onVisit: (id: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Putar dari ${places.length} tempat`}>
      <Body places={places} onVisit={onVisit} />
    </Sheet>
  );
}
