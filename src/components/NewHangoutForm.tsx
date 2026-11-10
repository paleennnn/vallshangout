'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { errorMessage } from '@/lib/errors';

export function NewHangoutForm() {
  const router = useRouter();
  const { supabase, ensureSession } = useSupabase();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(errorMessage(e, 'Gagal membuat hangout'));
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
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 focus:border-brand"
      />
      <button
        type="button"
        onClick={create}
        disabled={busy}
        className="w-full rounded-xl bg-brand px-5 py-3 font-semibold hover:bg-brand-hover disabled:opacity-50"
      >
        {busy ? 'Membuat…' : 'Buat & dapatkan link'}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
