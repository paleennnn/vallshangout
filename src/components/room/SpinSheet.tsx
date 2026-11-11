'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';
import { MotionRoot } from '@/components/MotionRoot';
import { Sheet } from '@/components/ui/Sheet';
import { MAX_WHEEL_LABEL, MAX_WHEEL_OPTIONS, Wheel, type WheelHandle } from '@/components/wheel/Wheel';
import { buildSpinOptions } from '@/lib/engine/spin';
import { startSpin, validateSpinOptions } from '@/lib/room/api';
import { loadPlaces, toSpinStats } from '@/lib/places/store';
import type { PlaceMeta, SpinOptionJson } from '@/lib/supabase/types';

interface Candidate {
  key: string;
  label: string;
  weight: number;
  meta?: PlaceMeta;
  selected: boolean;
  custom: boolean;
}

/** Kandidat awal: tempat tersimpan di perangkat ini (bobot adil dari riwayat kunjungan lokal). */
function initialCandidates(): Candidate[] {
  const places = loadPlaces();
  const options = buildSpinOptions(
    places.map((p) => ({ id: p.id, name: p.name })),
    toSpinStats(places),
    new Date(),
    { minWeight: 0.4 },
  );
  // Lebih dari batas roda: yang bobotnya tertinggi yang terpilih lebih dulu
  const top = new Set(
    [...options]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_WHEEL_OPTIONS)
      .map((o) => o.ref_id),
  );
  return options.map((o) => {
    const p = places.find((x) => x.id === o.ref_id)!;
    return {
      key: p.id,
      label: p.name,
      weight: o.weight,
      meta: { service_pct: p.servicePct, tax_pct: p.taxPct, tax_on_service: p.taxOnService },
      selected: top.has(o.ref_id),
      custom: false,
    };
  });
}

type Stage = 'pick' | 'spinning' | 'done';

function Body({
  hangoutId,
  onStart,
  onFinish,
  onClose,
}: {
  hangoutId: string;
  onStart: () => void;
  onFinish: () => void;
  onClose: () => void;
}) {
  const { supabase } = useSupabase();
  const wheel = useRef<WheelHandle>(null);
  const [cands, setCands] = useState<Candidate[]>(initialCandidates);
  const [draft, setDraft] = useState('');
  const [stage, setStage] = useState<Stage>('pick');
  const [sent, setSent] = useState<SpinOptionJson[]>([]);
  const [winner, setWinner] = useState<{ index: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bila sheet ditutup di tengah putaran, tahan-hasil di kartu room harus dilepas.
  const finish = useRef(onFinish);
  finish.current = onFinish;
  useEffect(() => () => finish.current(), []);

  // Roda sudah terpasang saat server membalas: baru putar sampai ke pemenang dari server.
  useEffect(() => {
    if (stage === 'spinning' && winner) wheel.current?.spinTo(winner.index);
  }, [stage, winner]);

  const selected = cands.filter((c) => c.selected);
  const toggle = (key: string) => setCands((cs) => cs.map((c) => (c.key === key ? { ...c, selected: !c.selected } : c)));

  function addCustom() {
    const label = draft.trim().slice(0, MAX_WHEEL_LABEL);
    if (!label) return;
    if (cands.some((c) => c.label.toLowerCase() === label.toLowerCase())) return setError(`"${label}" sudah ada.`);
    if (cands.filter((c) => c.selected).length >= MAX_WHEEL_OPTIONS) return setError(`Maksimal ${MAX_WHEEL_OPTIONS} tempat.`);
    setError(null);
    setDraft('');
    setCands((cs) => [...cs, { key: `custom-${label}`, label, weight: 1, selected: true, custom: true }]);
  }

  async function start() {
    const options: SpinOptionJson[] = selected.map((c) => ({
      label: c.label,
      weight: c.weight,
      ...(c.meta ? { meta: c.meta } : {}),
    }));
    const problem = validateSpinOptions(options);
    if (problem) return setError(problem);
    if (!supabase) return setError('Supabase belum dikonfigurasi.');

    setError(null);
    setSent(options);
    setWinner(null);
    setStage('spinning');
    onStart();
    try {
      const row = await startSpin(supabase, hangoutId, options);
      setWinner({ index: row.winner_index, label: row.winner.label });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memutar roda.');
      setStage('pick');
      onFinish();
    }
  }

  if (stage !== 'pick') {
    return (
      <div className="space-y-4">
        <div className="mx-auto w-full max-w-[320px] pt-2">
          <Wheel
            ref={wheel}
            labels={sent.map((o) => o.label)}
            weights={sent.map((o) => o.weight)}
            onResult={() => {
              setStage('done');
              onFinish();
            }}
          />
        </div>
        <div className="min-h-[6rem] text-center" aria-live="polite">
          {stage === 'spinning' && <p className="pt-3 text-lg text-muted">Memutar…</p>}
          {stage === 'done' && winner && (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted">Hasilnya</p>
                <p className="text-2xl font-extrabold leading-tight tracking-tight">{winner.label}</p>
              </div>
              <p className="text-sm text-muted">Semua peserta melihat hasil ini di halaman room. Host yang menerimanya.</p>
              <button type="button" onClick={onClose} className="h-11 w-full rounded-control bg-brand font-bold text-ink hover:bg-brand-hover">
                Selesai
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Pilih tempat yang ikut diundi. Hasilnya diundi di server, jadi semua orang melihat hasil yang sama.</p>

      {cands.length === 0 && (
        <p className="rounded-control bg-sand p-3 text-sm">
          Belum ada tempat tersimpan di perangkat ini. Tambahkan nama tempat di bawah, atau simpan tempat langganan di{' '}
          <Link href="/places" className="font-semibold underline underline-offset-4">
            halaman Tempat
          </Link>
          .
        </p>
      )}

      <ul className="-mx-2 max-h-[40dvh] overflow-y-auto">
        {cands.map((c) => (
          <li key={c.key} className="flex items-center gap-1">
            <label className="flex min-h-11 flex-1 items-center gap-3 rounded-control px-2 hover:bg-sand">
              <input type="checkbox" checked={c.selected} onChange={() => toggle(c.key)} className="h-5 w-5 shrink-0 accent-brand" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.label}</span>
                {c.meta && (
                  <span className="block text-xs text-muted">
                    Service {c.meta.service_pct}%, pajak {c.meta.tax_pct}%
                  </span>
                )}
              </span>
            </label>
            {c.custom && (
              <button
                type="button"
                aria-label={`Hapus ${c.label}`}
                onClick={() => setCands((cs) => cs.filter((x) => x.key !== c.key))}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-sand"
              >
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addCustom();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_WHEEL_LABEL}
          placeholder="Tambah nama tempat lain"
          aria-label="Nama tempat lain"
          enterKeyHint="done"
          className="h-11 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 focus:border-brand"
        />
        <button type="submit" disabled={!draft.trim()} className="inline-flex h-11 items-center gap-1.5 rounded-control bg-sand px-4 font-semibold hover:bg-sand-strong disabled:opacity-50">
          <Plus size={16} aria-hidden="true" />
          Tambah
        </button>
      </form>

      {draft.length >= MAX_WHEEL_LABEL - 6 && (
        <p className="-mt-2 text-right text-xs tabular-nums text-muted">
          {draft.length}/{MAX_WHEEL_LABEL}
        </p>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <button
        type="button"
        disabled={selected.length < 2}
        onClick={start}
        className="h-12 w-full rounded-control bg-brand font-bold text-ink hover:bg-brand-hover disabled:opacity-50"
      >
        Putar roda ({selected.length} tempat)
      </button>
    </div>
  );
}

export function SpinSheet({
  open,
  onClose,
  hangoutId,
  onStart,
  onFinish,
}: {
  open: boolean;
  onClose: () => void;
  hangoutId: string;
  onStart: () => void;
  onFinish: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Undi tempat">
      {/* Halaman room tidak dibungkus MotionRoot; tanpa ini roda tampak "memutar" tetapi tidak bergerak. */}
      <MotionRoot>
        <Body hangoutId={hangoutId} onStart={onStart} onFinish={onFinish} onClose={onClose} />
      </MotionRoot>
    </Sheet>
  );
}
