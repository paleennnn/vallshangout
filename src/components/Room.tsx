'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { PushToggle } from '@/components/PushToggle';
import type { Hangout, HangoutPreview, Participant } from '@/lib/supabase/types';

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
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [copied, setCopied] = useState(false);

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
        const mine = await supabase
          .from('hangouts')
          .select('id,title,status,scheduled_at,invite_code')
          .eq('invite_code', code)
          .maybeSingle();
        if (mine.error) throw mine.error;
        if (!active) return;
        if (mine.data) return setView({ kind: 'joined', hangout: mine.data as Hangout });

        const prev = await supabase.rpc('preview_hangout', { p_code: code });
        if (prev.error) throw prev.error;
        if (!active) return;
        const row = (prev.data as HangoutPreview[] | null)?.[0];
        setView(row ? { kind: 'preview', preview: row } : { kind: 'not-found' });
      } catch (e) {
        if (active) setView({ kind: 'error', message: e instanceof Error ? e.message : 'Terjadi kesalahan' });
      }
    })();
    return () => {
      active = false;
    };
  }, [restored, supabase, ensureSession, code]);

  // 2) Daftar peserta + realtime (RLS tetap berlaku; filter memakai kolom hangout_id).
  const hangoutId = view.kind === 'joined' ? view.hangout.id : null;
  const loadParticipants = useCallback(async () => {
    if (!supabase || !hangoutId) return;
    const { data } = await supabase
      .from('hangout_participants')
      .select('id,name,rsvp,user_id')
      .eq('hangout_id', hangoutId)
      .order('created_at');
    setParticipants((data as Participant[] | null) ?? []);
  }, [supabase, hangoutId]);

  useEffect(() => {
    if (!supabase || !hangoutId) return;
    loadParticipants();
    const channel = supabase
      .channel(`room:${hangoutId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hangout_participants', filter: `hangout_id=eq.${hangoutId}` },
        () => loadParticipants(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, hangoutId, loadParticipants]);

  async function join() {
    if (!supabase) return;
    setJoining(true);
    try {
      const { data, error } = await supabase.rpc('join_hangout', { p_code: code, p_name: name.trim() || null });
      if (error) throw error;
      setView({ kind: 'joined', hangout: data as Hangout });
    } catch (e) {
      setView({ kind: 'error', message: e instanceof Error ? e.message : 'Gagal bergabung' });
    } finally {
      setJoining(false);
    }
  }

  async function copyLink() {
    const link = `${location.origin}/h/${code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'VallsHangout', url: link });
      else await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* dibatalkan pengguna */
    }
  }

  switch (view.kind) {
    case 'loading':
      return <p className="text-zinc-400">Memuat…</p>;
    case 'no-supabase':
      return (
        <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
          Supabase belum dikonfigurasi (lihat <code>.env.example</code>).
        </p>
      );
    case 'not-found':
      return <p className="text-zinc-300">Kode <b className="font-mono">{code}</b> tidak ditemukan.</p>;
    case 'error':
      return <p className="text-rose-400">{view.message}</p>;
    case 'preview':
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h1 className="text-2xl font-bold">{view.preview.title}</h1>
            <p className="text-sm text-zinc-400">
              Dari {view.preview.host_name ?? 'seseorang'} · {view.preview.participant_count} peserta
            </p>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Nama panggilanmu"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-brand-400"
          />
          <button
            type="button"
            onClick={join}
            disabled={joining}
            className="w-full rounded-xl bg-brand-500 px-5 py-3 font-semibold hover:bg-brand-400 disabled:opacity-50"
          >
            {joining ? 'Bergabung…' : 'Gabung hangout'}
          </button>
        </div>
      );
    case 'joined':
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{view.hangout.title}</h1>
            <p className="font-mono text-sm tracking-widest text-zinc-400">{view.hangout.invite_code}</p>
          </div>

          <button type="button" onClick={copyLink} className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15">
            {copied ? '✓ Tersalin' : '🔗 Bagikan link undangan'}
          </button>

          <section className="space-y-2">
            <h2 className="font-semibold">Peserta ({participants.length})</h2>
            <ul className="space-y-1">
              {participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2">
                  <span>{p.name}</span>
                  <span className="text-xs text-zinc-400">{p.user_id ? p.rsvp : 'tanpa akun'}</span>
                </li>
              ))}
            </ul>
          </section>

          <PushToggle />
        </div>
      );
  }
}
