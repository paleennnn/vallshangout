'use client';

import { useEffect, useState } from 'react';
import { JoinedRoom } from '@/components/room/JoinedRoom';
import { useSupabase } from '@/components/SupabaseProvider';
import { errorMessage } from '@/lib/errors';
import { fetchMyHangout } from '@/lib/room/api';
import type { Hangout, HangoutPreview } from '@/lib/supabase/types';

type View =
  | { kind: 'loading' }
  | { kind: 'no-supabase' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; preview: HangoutPreview }
  | { kind: 'joined'; hangout: Hangout };

export function Room({ code }: { code: string }) {
  const { supabase, ensureSession, restored } = useSupabase();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);

  // 1) Sudah anggota? tampilkan room. Belum? tampilkan pratinjau + form gabung.
  useEffect(() => {
    if (!restored) return;
    if (!supabase) {
      setView({ kind: 'no-supabase' });
      return;
    }
    let active = true;
    (async () => {
      try {
        await ensureSession();
        const mine = await fetchMyHangout(supabase, code);
        if (!active) return;
        if (mine) return setView({ kind: 'joined', hangout: mine });

        const prev = await supabase.rpc('preview_hangout', { p_code: code });
        if (prev.error) throw prev.error;
        if (!active) return;
        const row = (prev.data as HangoutPreview[] | null)?.[0];
        setView(row ? { kind: 'preview', preview: row } : { kind: 'not-found' });
      } catch (e) {
        if (active) setView({ kind: 'error', message: errorMessage(e, 'Terjadi kesalahan') });
      }
    })();
    return () => {
      active = false;
    };
  }, [restored, supabase, ensureSession, code]);

  async function join() {
    if (!supabase) return;
    setJoining(true);
    try {
      const { data, error } = await supabase.rpc('join_hangout', { p_code: code, p_name: name.trim() || null });
      if (error) throw error;
      setView({ kind: 'joined', hangout: data as Hangout });
    } catch (e) {
      setView({ kind: 'error', message: errorMessage(e, 'Gagal bergabung') });
    } finally {
      setJoining(false);
    }
  }

  switch (view.kind) {
    case 'loading':
      return <p className="text-muted">Memuat…</p>;
    case 'no-supabase':
      return (
        <p className="rounded-xl border border-warning/30 bg-warning-bg p-4 text-sm text-warning">
          Supabase belum dikonfigurasi (lihat <code>.env.example</code>).
        </p>
      );
    case 'not-found':
      return <p className="text-muted">Kode <b className="font-mono">{code}</b> tidak ditemukan.</p>;
    case 'error':
      return <p className="text-danger">{view.message}</p>;
    case 'preview':
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h1 className="text-2xl font-bold">{view.preview.title}</h1>
            <p className="text-sm text-muted">
              Dari {view.preview.host_name ?? 'seseorang'}, {view.preview.participant_count} peserta
            </p>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Nama panggilanmu"
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 focus:border-brand"
          />
          <button
            type="button"
            onClick={join}
            disabled={joining}
            className="w-full rounded-xl bg-brand px-5 py-3 font-semibold hover:bg-brand-hover disabled:opacity-50"
          >
            {joining ? 'Bergabung…' : 'Gabung hangout'}
          </button>
        </div>
      );
    case 'joined':
      return <JoinedRoom initial={view.hangout} />;
  }
}
