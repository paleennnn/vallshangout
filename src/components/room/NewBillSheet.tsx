'use client';

import { useState } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/errors';
import { createBill, validateNewBill } from '@/lib/room/bills';
import { notifyRoom } from '@/lib/room/notify';
import type { Hangout, Participant } from '@/lib/supabase/types';
import { field, fieldLabel, primary } from './ui';

function pctOrNull(text: string): number | null {
  const t = text.trim().replace(',', '.');
  return t === '' ? null : Number(t);
}

function Body({
  hangout,
  participants,
  me,
  onCreated,
}: {
  hangout: Hangout;
  participants: Participant[];
  me: Participant | undefined;
  onCreated: () => void;
}) {
  const { supabase } = useSupabase();
  const meta = hangout.place_meta;
  const [title, setTitle] = useState(hangout.place_label ?? hangout.title);
  const [paidBy, setPaidBy] = useState(me?.id ?? participants[0]?.id ?? '');
  const [servicePct, setServicePct] = useState(meta ? String(meta.service_pct) : '');
  const [taxPct, setTaxPct] = useState(meta ? String(meta.tax_pct) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!supabase) return;
    const input = { title, paidBy, servicePct: pctOrNull(servicePct), taxPct: pctOrNull(taxPct) };
    const problem = validateNewBill(input);
    if (problem || Number.isNaN(input.servicePct) || Number.isNaN(input.taxPct)) {
      return setError(problem ?? 'Persen harus berupa angka.');
    }
    setBusy(true);
    setError(null);
    try {
      const bill = await createBill(supabase, hangout.id, input);
      void notifyRoom(supabase, hangout.id, 'bill_created', bill.id);
      onCreated();
    } catch (e) {
      setError(errorMessage(e, 'Gagal membuat tagihan'));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className={fieldLabel}>Nama tagihan</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={field} />
      </label>
      <label className="block space-y-1">
        <span className={fieldLabel}>Yang bayar ke kasir</span>
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={field}>
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === me?.id ? `${p.name} (kamu)` : p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className={fieldLabel}>Service %</span>
          <input inputMode="decimal" value={servicePct} onChange={(e) => setServicePct(e.target.value)} className={`${field} text-right`} />
        </label>
        <label className="space-y-1">
          <span className={fieldLabel}>Pajak %</span>
          <input inputMode="decimal" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} className={`${field} text-right`} />
        </label>
      </div>
      <p className="text-xs text-muted">Persen hanya membantu mengisi angka service dan pajak nanti. Angka di struk yang dipakai.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="button" className={`${primary} w-full`} disabled={busy} onClick={submit}>
        {busy ? 'Membuat…' : 'Buat tagihan'}
      </button>
    </div>
  );
}

export function NewBillSheet({
  open,
  onClose,
  hangout,
  participants,
  me,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  hangout: Hangout;
  participants: Participant[];
  me: Participant | undefined;
  onCreated: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Tagihan baru">
      <Body
        hangout={hangout}
        participants={participants}
        me={me}
        onCreated={() => {
          onCreated();
          onClose();
        }}
      />
    </Sheet>
  );
}
