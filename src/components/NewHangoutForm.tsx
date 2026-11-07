'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';

export function NewHangoutForm() {
  const router = useRouter();
  const { supabase, ensureSession } = useSupabase();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (supabase === null) {
    return (
      <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
        Supabase belum dikonfigurasi. Isi <code>NEXT_PUBLIC_SUPABASE_URL</code> dan kunci
        publiknya di <code>.env.local</code>, lalu jalankan ulang.
      </p>
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      const { data, error: err } = await supabase!
        .from('hangouts')
        .insert({ title: title.trim() || 'Nongkrong' })
        .select('invite_code')
        .single();
      if (err) throw err;
      router.push(`/h/${data.invite_code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat hangout');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        placeholder="Nama acara (mis. Malming Cafe A)"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-brand-400"
      />
      <button
        type="button"
        onClick={create}
        disabled={busy}
        className="w-full rounded-xl bg-brand-500 px-5 py-3 font-semibold hover:bg-brand-400 disabled:opacity-50"
      >
        {busy ? 'Membuat…' : 'Buat & dapatkan link'}
      </button>
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}
