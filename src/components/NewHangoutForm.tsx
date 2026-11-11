'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { errorMessage } from '@/lib/errors';

export function NewHangoutForm() {
  const router = useRouter();
  const { supabase, session, ensureSession } = useSupabase();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pengguna lama: isi otomatis dengan nama di profilnya (profil baru bernama "Anon", itu tidak dipakai)
  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const saved = data?.display_name;
        if (!cancelled && saved && saved !== 'Anon') setName((current) => current || saved);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  if (supabase === null) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning-bg p-4 text-sm text-warning">
        <p className="font-semibold">Layanan hangout online sedang dalam pemeliharaan.</p>
        <p className="mt-1 text-xs text-muted">
          Fitur pembuatan room online sedang tidak dapat diakses untuk sementara waktu. Kamu tetap bisa memakai fitur kalkulator patungan dan spin wheel.
        </p>
      </div>
    );
  }

  async function create() {
    const hostName = name.trim();
    if (!hostName) return setError('Nama kamu wajib diisi.');
    setBusy(true);
    setError(null);
    try {
      const { user } = await ensureSession();
      // Nama host di room diambil trigger dari profil saat hangout dibuat, jadi profil harus diperbarui dulu
      const { error: profileErr } = await supabase!.from('profiles').update({ display_name: hostName }).eq('id', user.id);
      if (profileErr) throw profileErr;
      const { data, error: err } = await supabase!
        .from('hangouts')
        .insert({ title: title.trim() || 'Nongkrong' })
        .select('invite_code')
        .single();
      if (err) throw err;
      router.push(`/h/${data.invite_code}`);
    } catch (e) {
      setError(errorMessage(e, 'Gagal membuat hangout'));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-muted">Nama kamu</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Nama panggilan yang dilihat teman"
          autoComplete="nickname"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 focus:border-brand"
        />
      </label>
      <input
        value={title}
        aria-label="Nama acara"
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        placeholder="Nama acara (mis. Malming Cafe A)"
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 focus:border-brand"
      />
      <button
        type="button"
        onClick={create}
        disabled={busy || !name.trim()}
        className="w-full rounded-xl bg-brand px-5 py-3 font-semibold hover:bg-brand-hover disabled:opacity-50"
      >
        {busy ? 'Membuat…' : 'Buat & dapatkan link'}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
