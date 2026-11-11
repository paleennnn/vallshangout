'use client';

import { useState } from 'react';
import { Check, LoaderPinwheel, RotateCw, Undo2, X } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';
import { acceptSpin, clearPlace, vetoSpin } from '@/lib/room/api';
import type { Hangout, Participant, PlaceMeta, SpinState } from '@/lib/supabase/types';
import { SpinSheet } from './SpinSheet';

const describe = (m: PlaceMeta) =>
  `Service ${m.service_pct}%, pajak ${m.tax_pct}% (${m.tax_on_service ? 'dari subtotal + service' : 'dari subtotal'})`;

const btn = 'inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold';
const secondary = `${btn} bg-sand hover:bg-sand-strong disabled:opacity-60`;
const primary = `${btn} bg-brand font-bold text-ink hover:bg-brand-hover disabled:opacity-60`;

export function RoomPlace({
  hangout,
  spin,
  participants,
  me,
  isHost,
  onChanged,
}: {
  hangout: Hangout;
  spin: SpinState | null;
  participants: Participant[];
  me: Participant | undefined;
  isHost: boolean;
  onChanged: () => void;
}) {
  const { supabase } = useSupabase();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hold, setHold] = useState(false); // sembunyikan hasil sampai animasi roda selesai (tanpa spoiler)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? 'seseorang';
  const iVetoed = !!me && !!spin?.vetoed_by.includes(me.id);
  const card = 'space-y-3 rounded-card border border-line bg-surface p-4';

  let content;
  if (hangout.place_label) {
    content = (
      <>
        <div>
          <p className="text-sm text-muted">Tempat</p>
          <h3 className="text-2xl font-extrabold leading-tight tracking-tight">{hangout.place_label}</h3>
          {hangout.place_meta && <p className="mt-1 text-sm text-muted">{describe(hangout.place_meta)}</p>}
        </div>
        {isHost && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={secondary} onClick={() => setSheetOpen(true)}>
              <RotateCw size={16} aria-hidden="true" />
              Undi ulang
            </button>
            <button type="button" className={secondary} disabled={busy} onClick={() => run(() => clearPlace(supabase!, hangout.id))}>
              <Undo2 size={16} aria-hidden="true" />
              Kosongkan
            </button>
          </div>
        )}
      </>
    );
  } else if (spin && !hold && spin.status !== 'accepted') {
    const meta = spin.winner.meta;
    content = (
      <>
        <div>
          <p className="text-sm text-muted">{spin.status === 'vetoed' ? 'Hasil undian (di-veto)' : 'Hasil undian'}</p>
          <h3 className="text-2xl font-extrabold leading-tight tracking-tight">{spin.winner.label}</h3>
          {meta && <p className="mt-1 text-sm text-muted">{describe(meta)}</p>}
        </div>

        {spin.status === 'vetoed' && (
          <p className="text-sm">
            Di-veto oleh {spin.vetoed_by.map(nameOf).join(', ')}. Putar lagi untuk mendapat hasil baru.
          </p>
        )}
        {spin.status === 'active' && spin.vetoed_by.length === 0 && !isHost && (
          <p className="text-sm text-muted">Menunggu host menerima hasil ini.</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {spin.status === 'active' && isHost && (
            <button type="button" disabled={busy} className={`${primary} col-span-2`} onClick={() => run(() => acceptSpin(supabase!, spin.id))}>
              <Check size={16} aria-hidden="true" />
              Terima tempat ini
            </button>
          )}
          {spin.status === 'active' && me && (
            <button type="button" disabled={busy || iVetoed} className={secondary} onClick={() => run(() => vetoSpin(supabase!, spin.id))}>
              <X size={16} aria-hidden="true" />
              {iVetoed ? 'Kamu sudah veto' : 'Veto'}
            </button>
          )}
          <button type="button" className={`${secondary} ${spin.status === 'active' && me ? '' : 'col-span-2'}`} onClick={() => setSheetOpen(true)}>
            <RotateCw size={16} aria-hidden="true" />
            Putar lagi
          </button>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <div>
          <h3 className="font-semibold">Belum ada tempat</h3>
          <p className="text-sm text-muted">Undi bareng-bareng. Siapa pun boleh memutar, dan host yang menerima hasilnya.</p>
        </div>
        <button type="button" className={`${primary} w-full`} disabled={!me} onClick={() => setSheetOpen(true)}>
          <LoaderPinwheel size={18} aria-hidden="true" />
          Undi tempat
        </button>
      </>
    );
  }

  return (
    <section className={card} aria-live="polite">
      {content}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <SpinSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        hangoutId={hangout.id}
        onStart={() => setHold(true)}
        onFinish={() => {
          setHold(false);
          onChanged();
        }}
      />
    </section>
  );
}
