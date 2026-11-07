'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState('');

  return (
    <div className="flex gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
        onKeyDown={(e) => e.key === 'Enter' && code.length === 8 && router.push(`/h/${code}`)}
        placeholder="Kode hangout (8 karakter)"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono tracking-widest outline-none focus:border-brand-400"
      />
      <button
        type="button"
        disabled={code.length !== 8}
        onClick={() => router.push(`/h/${code}`)}
        className="rounded-xl bg-white/10 px-4 py-3 font-semibold enabled:hover:bg-white/15 disabled:opacity-40"
      >
        Gabung
      </button>
    </div>
  );
}
