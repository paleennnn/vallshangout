'use client';

import { useState } from 'react';
import { MoneyInput } from '@/components/calculator/MoneyInput';
import { formatIDR } from '@/lib/engine/split';
import { chargesFromPct, type BillChargesPatch } from '@/lib/room/bills';
import type { BillRow } from '@/lib/supabase/types';
import { field, fieldLabel, primary, secondary } from './ui';

/** "7,5" atau "7.5" jadi 7.5; kosong jadi null; di luar 0..100 atau bukan angka jadi undefined. */
function parsePct(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
}

/**
 * Editor angka struk (hanya untuk host atau yang bayar ke kasir). Angka rupiah adalah sumber
 * kebenaran; persen hanya membantu mengisinya dan tidak otomatis mengikuti perubahan menu.
 */
export function BillChargesEditor({
  bill,
  subtotal,
  defaultTaxOnService,
  busy,
  onSave,
}: {
  bill: BillRow;
  subtotal: number;
  defaultTaxOnService: boolean;
  busy: boolean;
  onSave: (patch: BillChargesPatch) => Promise<void>;
}) {
  const [servicePct, setServicePct] = useState(bill.service_pct === null ? '' : String(bill.service_pct));
  const [taxPct, setTaxPct] = useState(bill.tax_pct === null ? '' : String(bill.tax_pct));
  const [taxOnService, setTaxOnService] = useState(defaultTaxOnService);
  const [service, setService] = useState(bill.service_amount);
  const [tax, setTax] = useState(bill.tax_amount);
  const [discount, setDiscount] = useState(bill.discount_amount);
  const [rounding, setRounding] = useState(bill.rounding_amount);
  const [error, setError] = useState<string | null>(null);

  const sp = parsePct(servicePct);
  const tp = parsePct(taxPct);

  function fillFromPct() {
    if (sp === undefined || tp === undefined) return setError('Persen harus antara 0 dan 100.');
    setError(null);
    const c = chargesFromPct(subtotal, sp ?? 0, tp ?? 0, taxOnService, discount);
    setService(c.serviceAmount);
    setTax(c.taxAmount);
  }

  async function save() {
    if (sp === undefined || tp === undefined) return setError('Persen harus antara 0 dan 100.');
    setError(null);
    await onSave({
      service_pct: sp,
      tax_pct: tp,
      service_amount: service,
      tax_amount: tax,
      discount_amount: discount,
      rounding_amount: rounding,
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={taxOnService} onChange={(e) => setTaxOnService(e.target.checked)} className="h-4 w-4 accent-brand" />
        Pajak dihitung dari (subtotal + service)
      </label>
      <button type="button" className={`${secondary} w-full`} onClick={fillFromPct}>
        Isi service dan pajak dari persen
      </button>
      <p className="text-xs text-muted">
        Angka dihitung dari subtotal saat tombol ditekan ({formatIDR(subtotal)}). Isi ulang bila menu berubah, dan samakan dengan angka di struk.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className={fieldLabel}>Service (Rp)</span>
          <MoneyInput value={service || null} onChange={(v) => setService(v ?? 0)} placeholder="0" className="h-11" />
        </label>
        <label className="space-y-1">
          <span className={fieldLabel}>Pajak (Rp)</span>
          <MoneyInput value={tax || null} onChange={(v) => setTax(v ?? 0)} placeholder="0" className="h-11" />
        </label>
        <label className="space-y-1">
          <span className={fieldLabel}>Diskon (Rp)</span>
          <MoneyInput value={discount || null} onChange={(v) => setDiscount(v ?? 0)} placeholder="0" className="h-11" />
        </label>
        <label className="space-y-1">
          <span className={fieldLabel}>Pembulatan (Rp)</span>
          <MoneyInput value={rounding || null} onChange={(v) => setRounding(v ?? 0)} placeholder="0" allowNegative className="h-11" />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="button" className={`${primary} w-full`} disabled={busy} onClick={save}>
        Simpan angka struk
      </button>
    </div>
  );
}
