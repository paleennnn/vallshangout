'use client';

import { useState } from 'react';
import { Check, Minus, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { MoneyInput } from '@/components/calculator/MoneyInput';
import { formatIDR } from '@/lib/engine/split';
import { validateItem, type NewItemInput } from '@/lib/room/bills';
import { lineTotal, reviewTotals, toReviewItems, type ReviewCharges, type ReviewItem } from '@/lib/ocr/review';
import type { ParsedReceipt } from '@/lib/ocr/types';
import { field, fieldLabel, primary, secondary } from './ui';

const rp = (n: number) => formatIDR(n).replace(/\u00a0/g, ' ');
const iconBtn = 'grid h-11 w-11 place-items-center rounded-control bg-sand hover:bg-sand-strong disabled:opacity-50';

/**
 * Layar tinjau hasil scan: semua angka bisa diedit, dan hitungannya dicocokkan langsung dengan
 * total di struk. Peringatan di bagian atas wajib dibaca: OCR bisa salah, struk asli yang benar.
 */
export function ScanReview({
  result,
  existingCount,
  currentCharges,
  busy,
  error,
  onSave,
  onClose,
}: {
  result: ParsedReceipt;
  /** Jumlah menu yang sudah ada di tagihan ini. */
  existingCount: number;
  /** Angka struk yang sudah tersimpan di tagihan (dipakai bila scan tidak menemukannya). */
  currentCharges: ReviewCharges;
  busy: boolean;
  error: string | null;
  onSave: (items: NewItemInput[], charges: ReviewCharges) => Promise<void>;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ReviewItem[]>(() => toReviewItems(result));
  const [nextKey, setNextKey] = useState(1000);
  const [charges, setCharges] = useState<ReviewCharges>({
    service: result.serviceAmount || currentCharges.service,
    tax: result.taxAmount || currentCharges.tax,
    discount: result.discountAmount || currentCharges.discount,
    rounding: result.roundingAmount || currentCharges.rounding,
  });
  const [receiptTotal, setReceiptTotal] = useState<number | null>(result.total);
  const [localError, setLocalError] = useState<string | null>(null);

  const totals = reviewTotals(items, charges, receiptTotal);
  const patch = (key: string, change: Partial<ReviewItem>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...change, suspect: change.suspect ?? it.suspect } : it)));

  async function save() {
    for (const [i, it] of items.entries()) {
      const problem = validateItem({ name: it.name, unitPrice: it.unitPrice ?? 0, qty: it.qty });
      if (problem) return setLocalError(`Baris ${i + 1}: ${problem}`);
    }
    if (items.length === 0) return setLocalError('Belum ada menu untuk disimpan.');
    setLocalError(null);
    await onSave(
      items.map((it) => ({ name: it.name.trim(), unitPrice: it.unitPrice ?? 0, qty: it.qty })),
      charges,
    );
  }

  const suggestions = result.suggestions.filter((s) => {
    const it = items[s.item];
    return it && lineTotal(it) === s.from && s.to % it.qty === 0;
  });

  return (
    <div className="space-y-4">
      <div role="alert" className="flex gap-3 rounded-xl border border-warning bg-warning-bg p-3 text-sm text-warning">
        <TriangleAlert size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold">Cek ulang hasil scan dengan struk</p>
          <p>
            Hasil baca otomatis bisa salah pada menu, jumlah, atau harga. Mohon cocokkan setiap baris dan total di bawah dengan
            struk asli sebelum menyimpan.
          </p>
        </div>
      </div>

      <div
        role="status"
        className={`rounded-xl px-3 py-2 text-sm font-medium ${totals.matches === true ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}
      >
        {totals.matches === true && `Cocok: hitungan ${rp(totals.expected)} sama dengan total di struk.`}
        {totals.matches === false && `Belum cocok: hitungan ${rp(totals.expected)}, total di struk ${rp(receiptTotal ?? 0)} (selisih ${rp(Math.abs(totals.diff ?? 0))}). Periksa lagi menu dan angka di bawah.`}
        {totals.matches === null && `Isi "Total di struk" di bawah agar hitungan bisa dicocokkan. Hitungan sekarang: ${rp(totals.expected)}.`}
      </div>

      {existingCount > 0 && (
        <p className="text-sm text-muted">Tagihan ini sudah punya {existingCount} menu. Hasil scan akan ditambahkan, bukan menggantikan.</p>
      )}
      {items.length === 0 && <p className="text-sm text-muted">Belum ada menu. Tambahkan baris dari struk.</p>}

      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={it.key} className={`space-y-2 rounded-xl border p-3 ${it.suspect ? 'border-warning bg-warning-bg' : 'border-line bg-cream'}`}>
            <div className="flex items-center gap-2">
              <input
                value={it.name}
                onChange={(e) => patch(it.key, { name: e.target.value })}
                maxLength={100}
                aria-label={`Nama menu baris ${i + 1}`}
                placeholder="Nama menu"
                className={field}
              />
              <button type="button" aria-label={`Hapus baris ${i + 1}`} className={iconBtn} onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <MoneyInput
                  value={it.unitPrice}
                  onChange={(v) => patch(it.key, { unitPrice: v, suspect: false })}
                  placeholder="Harga satuan"
                  ariaLabel={`Harga satuan baris ${i + 1}`}
                  className="h-11"
                />
              </div>
              <div className="flex items-center gap-1">
                <button type="button" aria-label={`Kurangi jumlah baris ${i + 1}`} className={iconBtn} onClick={() => patch(it.key, { qty: Math.max(1, it.qty - 1), suspect: false })}>
                  <Minus size={16} aria-hidden="true" />
                </button>
                <span className="min-w-8 text-center tabular-nums" aria-label={`Jumlah baris ${i + 1}`}>{it.qty}</span>
                <button type="button" aria-label={`Tambah jumlah baris ${i + 1}`} className={iconBtn} onClick={() => patch(it.key, { qty: Math.min(99, it.qty + 1), suspect: false })}>
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <p className="flex justify-between text-sm tabular-nums">
              <span className="text-muted">{it.qty} × {rp(it.unitPrice ?? 0)}</span>
              <span className="font-semibold">{rp(lineTotal(it))}</span>
            </p>
            {it.suspect && <p className="text-sm text-warning">Cek baris ini: {it.note ?? 'angkanya meragukan'}.</p>}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={`${secondary} w-full`}
        onClick={() => {
          setItems((l) => [...l, { key: `baru-${nextKey}`, name: '', qty: 1, unitPrice: null, suspect: false }]);
          setNextKey((k) => k + 1);
        }}
      >
        <Plus size={16} aria-hidden="true" />
        Tambah baris
      </button>

      {suggestions.map((s) => (
        <div key={`${s.item}-${s.to}`} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
          <span>
            Mungkin salah baca satu digit: <strong>{items[s.item].name}</strong> {rp(s.from)}, seharusnya {rp(s.to)}?
          </span>
          <button
            type="button"
            className={`${secondary} shrink-0`}
            onClick={() => patch(items[s.item].key, { unitPrice: s.to / items[s.item].qty, suspect: false })}
          >
            Pakai
          </button>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className={fieldLabel}>Service (Rp)</span>
          <MoneyInput value={charges.service || null} onChange={(v) => setCharges((c) => ({ ...c, service: v ?? 0 }))} placeholder="0" ariaLabel="Service" className="h-11" />
        </label>
        <label className="space-y-1">
          <span className={fieldLabel}>Pajak (Rp)</span>
          <MoneyInput value={charges.tax || null} onChange={(v) => setCharges((c) => ({ ...c, tax: v ?? 0 }))} placeholder="0" ariaLabel="Pajak" className="h-11" />
        </label>
        <label className="space-y-1">
          <span className={fieldLabel}>Diskon (Rp)</span>
          <MoneyInput value={charges.discount || null} onChange={(v) => setCharges((c) => ({ ...c, discount: v ?? 0 }))} placeholder="0" ariaLabel="Diskon" className="h-11" />
        </label>
        <label className="space-y-1">
          <span className={fieldLabel}>Pembulatan (Rp)</span>
          <MoneyInput value={charges.rounding || null} onChange={(v) => setCharges((c) => ({ ...c, rounding: v ?? 0 }))} placeholder="0" allowNegative ariaLabel="Pembulatan" className="h-11" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className={fieldLabel}>Total di struk (untuk mencocokkan, tidak disimpan)</span>
        <MoneyInput value={receiptTotal} onChange={setReceiptTotal} placeholder="Total yang tercetak di struk" ariaLabel="Total di struk" className="h-11" />
      </label>

      {result.warnings.length > 0 && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2.5 font-medium">Catatan dari pembacaan ({result.warnings.length})</summary>
          <ul className="list-disc space-y-1 pl-5 text-warning">
            {result.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </details>
      )}

      {(localError || error) && <p role="alert" className="text-sm text-danger">{localError ?? error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={secondary} onClick={onClose} disabled={busy}>Batal</button>
        <button type="button" className={primary} onClick={save} disabled={busy}>
          <Check size={16} aria-hidden="true" />
          {busy ? 'Menyimpan…' : 'Simpan ke tagihan'}
        </button>
      </div>
    </div>
  );
}
