'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { PushToggle } from '@/components/PushToggle';
import { useSupabase } from '@/components/SupabaseProvider';
import { fetchLatestSpin, fetchMyHangout, fetchParticipants, setRsvp } from '@/lib/room/api';
import type { Hangout, Participant, SpinState } from '@/lib/supabase/types';
import { RoomPlace } from './RoomPlace';

const RSVP_OPTIONS: { value: Participant['rsvp']; label: string }[] = [
  { value: 'going', label: 'Ikut' },
  { value: 'maybe', label: 'Mungkin' },
  { value: 'no', label: 'Tidak' },
];
const RSVP_LABEL: Record<Participant['rsvp'], string> = {
  invited: 'Diundang',
  going: 'Ikut',
  maybe: 'Mungkin',
  no: 'Tidak ikut',
};

/** Isi room setelah pengguna menjadi anggota: kehadiran, tempat, dan daftar peserta (realtime). */
export function JoinedRoom({ initial }: { initial: Hangout }) {
  const { supabase, session } = useSupabase();
  const userId = session?.user.id ?? null;
  const [hangout, setHangout] = useState<Hangout>(initial);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [spin, setSpin] = useState<SpinState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    try {
      const [h, p, s] = await Promise.all([
        fetchMyHangout(supabase, initial.invite_code),
        fetchParticipants(supabase, initial.id),
        fetchLatestSpin(supabase, initial.id),
      ]);
      if (h) setHangout(h);
      setParticipants(p);
      setSpin(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat room');
    }
  }, [supabase, initial.id, initial.invite_code]);

  // Muat awal + realtime (RLS tetap berlaku; filter memakai kolom hangout_id).
  useEffect(() => {
    if (!supabase) return;
    refresh();
    const filter = `hangout_id=eq.${initial.id}`;
    const channel = supabase
      .channel(`room:${initial.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hangout_participants', filter }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spins', filter }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spin_vetoes', filter }, () => refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hangouts', filter: `id=eq.${initial.id}` }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, initial.id, refresh]);

  const me = userId ? participants.find((p) => p.user_id === userId) : undefined;
  const isHost = !!userId && hangout.host_id === userId;

  async function changeRsvp(value: Participant['rsvp']) {
    if (!supabase || !me) return;
    try {
      await setRsvp(supabase, me.id, value);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah kehadiran');
    }
  }

  async function copyLink() {
    const link = `${location.origin}/h/${hangout.invite_code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'VallsHangout', url: link });
      else await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* dibatalkan pengguna */
    }
  }

  const going = participants.filter((p) => p.rsvp === 'going').length;
  const maybe = participants.filter((p) => p.rsvp === 'maybe').length;
  const card = 'space-y-3 rounded-card border border-line bg-surface p-4';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{hangout.title}</h1>
        <p className="font-mono text-sm tracking-widest text-muted">{hangout.invite_code}</p>
      </div>

      <button
        type="button"
        onClick={copyLink}
        className="inline-flex h-11 items-center gap-2 rounded-control bg-sand px-4 text-sm font-semibold hover:bg-sand-strong"
      >
        {copied ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
        {copied ? 'Tersalin' : 'Bagikan link undangan'}
      </button>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {me && (
        <section className={card}>
          <h2 className="font-semibold">Kamu ikut?</h2>
          <div role="group" aria-label="Kehadiranmu" className="grid grid-cols-3 gap-2">
            {RSVP_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={me.rsvp === o.value}
                onClick={() => changeRsvp(o.value)}
                className={`h-11 rounded-control text-sm font-semibold ${
                  me.rsvp === o.value ? 'bg-brand text-ink' : 'bg-sand hover:bg-sand-strong'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <RoomPlace hangout={hangout} spin={spin} participants={participants} me={me} isHost={isHost} onChanged={refresh} />

      <section className={card}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Peserta ({participants.length})</h2>
          <span className="text-sm text-muted">
            {going} ikut{maybe > 0 ? `, ${maybe} mungkin` : ''}
          </span>
        </div>
        <ul className="-mx-2 divide-y divide-line">
          {participants.map((p) => (
            <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 px-2 py-2">
              <span className="min-w-0 truncate">
                {p.name}
                {p.user_id && p.user_id === hangout.host_id && <span className="ml-2 rounded bg-sand px-1.5 py-0.5 text-xs text-muted">host</span>}
                {p.user_id && p.user_id === userId && <span className="ml-2 text-xs text-muted">(kamu)</span>}
              </span>
              <span className="shrink-0 text-sm text-muted">{p.user_id ? RSVP_LABEL[p.rsvp] : 'tanpa akun'}</span>
            </li>
          ))}
        </ul>
      </section>

      <PushToggle />
    </div>
  );
}
