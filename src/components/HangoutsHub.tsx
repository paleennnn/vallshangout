'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { JoinByCode } from '@/components/JoinByCode';
import { NewHangoutForm } from '@/components/NewHangoutForm';
import { useSupabase } from '@/components/SupabaseProvider';
import type { Hangout } from '@/lib/supabase/types';

const STATUS: Record<Hangout['status'], string> = {
  planning: 'Rencana',
  deciding: 'Memutuskan',
  ongoing: 'Berlangsung',
  settling: 'Patungan',
  done: 'Selesai',
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });

/** Pusat hangout: daftar hangout milikmu, buat baru, dan gabung dengan kode. */
export function HangoutsHub() {
  const { supabase, session, restored } = useSupabase();
  const [items, setItems] = useState<Hangout[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restored) return;
    // Tanpa sesi berarti belum pernah membuat atau bergabung: tidak perlu membuat akun anonim hanya untuk melihat daftar kosong.
    if (!supabase || !session) {
      setItems([]);
      return;
    }
    let active = true;
    supabase
      .from('hangouts')
      .select('id,title,status,scheduled_at,invite_code')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) setError(err.message);
        else setItems((data as Hangout[] | null) ?? []);
      });
    return () => {
      active = false;
    };
  }, [restored, supabase, session]);

  const card = 'space-y-3 rounded-card border border-line bg-surface p-4 sm:p-5';

  const actions = (
    <>
      <section className={card}>
        <h2 className="font-semibold">Buat hangout baru</h2>
        <NewHangoutForm />
      </section>
      <section className={card}>
        <h2 className="font-semibold">Gabung pakai kode</h2>
        <JoinByCode />
      </section>
    </>
  );

  const list = (
    <section className={card} aria-live="polite">
      <h2 className="font-semibold">Hangout kamu</h2>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && items === null && <p className="text-sm text-muted">Memuat…</p>}
      {!error && items?.length === 0 && (
        <p className="text-sm text-muted">Belum ada. Buat hangout atau gabung dengan kode dari temanmu.</p>
      )}
      {items && items.length > 0 && (
        <ul className="-mx-2 divide-y divide-line">
          {items.map((h) => (
            <li key={h.id}>
              <Link href={`/h/${h.invite_code}`} className="flex min-h-14 items-center gap-3 rounded-control px-2 py-2 hover:bg-sand">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.title}</span>
                  <span className="block text-sm text-muted">
                    {STATUS[h.status]}
                    {h.scheduled_at ? `, ${day(h.scheduled_at)}` : ''}
                  </span>
                </span>
                <span className="font-mono text-xs tracking-widest text-muted">{h.invite_code}</span>
                <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return <div className="space-y-5">{items && items.length > 0 ? <>{list}{actions}</> : <>{actions}{list}</>}</div>;
}
