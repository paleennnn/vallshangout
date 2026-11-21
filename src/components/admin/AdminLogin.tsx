'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { field, fieldLabel, primary } from '@/components/room/ui';

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPassword('');
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Gagal masuk.');
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm space-y-4 px-4 pt-16">
      <h1 className="text-2xl font-bold">Admin</h1>
      <div className="space-y-3 rounded-card border border-line bg-surface p-4">
        <label className="block space-y-1">
          <span className={fieldLabel}>Kata sandi</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && password && !busy && submit()}
            autoComplete="current-password"
            className={field}
          />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="button" className={`${primary} w-full`} disabled={busy || !password} onClick={submit}>
          {busy ? 'Memeriksa…' : 'Masuk'}
        </button>
      </div>
    </main>
  );
}
