'use client';

import { useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/errors';
import { runEngine } from '@/lib/ocr/engines';
import { analyzeWords, type EngineId } from '@/lib/ocr/pipeline';
import { DEFAULT_PREP, prepareCanvas } from '@/lib/ocr/preprocess';
import type { ReviewCharges } from '@/lib/ocr/review';
import type { ParsedReceipt } from '@/lib/ocr/types';
import { addItems, updateBill, type NewItemInput } from '@/lib/room/bills';
import type { BillRow } from '@/lib/supabase/types';
import { ScanReview } from './ScanReview';
import { secondary } from './ui';

/** Mesin yang dipakai fitur scan. PaddleOCR masih eksperimen di /lab/ocr. */
const SCAN_ENGINE: EngineId = 'tesseract';

export interface ScanReceiptProps {
  /** Baris tagihan Supabase (bila dipanggil dari room / BillCard). */
  bill?: BillRow;
  itemCount: number;
  nextSortOrder?: number;
  /** Angka struk yang sudah ada (dipakai bila tanpa bill, mis. kalkulator). */
  currentCharges?: ReviewCharges;
  /** Tombol simpan khusus (dipakai bila tanpa bill, mis. kalkulator). */
  onSave?: (items: NewItemInput[], charges: ReviewCharges) => Promise<void> | void;
  /** `warning` terisi bila menu tersimpan tetapi angka service/pajak gagal disimpan. */
  onSaved: (count: number, warning?: string) => void;
  buttonClassName?: string;
  submitLabel?: string;
}

/**
 * Tombol "Scan struk": foto diproses di HP (tidak diunggah), hasilnya ditinjau dan diedit di
 * lembar tinjau, baru disimpan sebagai menu dan angka struk tagihan ini.
 */
export function ScanReceipt({
  bill,
  itemCount,
  nextSortOrder = 0,
  currentCharges,
  onSave,
  onSaved,
  buttonClassName,
  submitLabel,
}: ScanReceiptProps) {
  const { supabase } = useSupabase();
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedReceipt | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setError(null);
    try {
      const canvas = await prepareCanvas(file, DEFAULT_PREP);
      const output = await runEngine(SCAN_ENGINE, canvas);
      const { parsed } = analyzeWords(output.words);
      if (parsed.items.length === 0) {
        setError('Tidak ada menu yang terbaca. Coba foto lebih dekat, terang, dan lurus, atau isi menu manual.');
      } else {
        setSaveError(null);
        setResult(parsed);
      }
    } catch (e) {
      setError(`Scan gagal: ${errorMessage(e, 'terjadi kesalahan')}. Coba lagi atau isi menu manual.`);
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = ''; // foto yang sama boleh dipilih lagi
    }
  }

  async function save(items: NewItemInput[], charges: ReviewCharges) {
    if (bill) {
      if (!supabase) return;
      setSaving(true);
      setSaveError(null);
      try {
        await addItems(supabase, bill.hangout_id, bill.id, items, nextSortOrder, itemCount);
      } catch (e) {
        setSaveError(errorMessage(e, 'Gagal menyimpan menu'));
        setSaving(false);
        return;
      }
      // Menu sudah tersimpan: apa pun yang terjadi pada angka struk, lembar tinjau ditutup agar tidak menyimpan dua kali
      let warning: string | undefined;
      try {
        await updateBill(supabase, bill.id, {
          service_amount: charges.service,
          tax_amount: charges.tax,
          discount_amount: charges.discount,
          rounding_amount: charges.rounding,
        });
      } catch {
        warning = 'Angka service, pajak, diskon, dan pembulatan belum tersimpan. Isi lewat "Ubah service, pajak, diskon".';
      }
      setSaving(false);
      setResult(null);
      onSaved(items.length, warning);
    } else if (onSave) {
      setSaving(true);
      setSaveError(null);
      try {
        await onSave(items, charges);
      } catch (e) {
        setSaveError(errorMessage(e, 'Gagal menyimpan menu'));
        setSaving(false);
        return;
      }
      setSaving(false);
      setResult(null);
      onSaved(items.length);
    }
  }

  const effectiveCharges: ReviewCharges = bill
    ? {
        service: bill.service_amount,
        tax: bill.tax_amount,
        discount: bill.discount_amount,
        rounding: bill.rounding_amount,
      }
    : (currentCharges ?? { service: 0, tax: 0, discount: 0, rounding: 0 });

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={buttonClassName ?? `${secondary} w-full`}
        disabled={reading}
        onClick={() => inputRef.current?.click()}
      >
        <ScanLine size={16} aria-hidden="true" />
        {reading ? 'Membaca struk…' : 'Scan struk'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Foto struk"
        tabIndex={-1}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <p className="text-xs text-muted">Foto dibaca di HP kamu dan tidak diunggah. Hasil scan perlu dicek ulang dengan struk.</p>
      <p aria-live="polite" className="text-sm text-muted">
        {reading && 'Membaca struk, pertama kali bisa lama karena model diunduh.'}
      </p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <Sheet open={result !== null} onClose={() => !saving && setResult(null)} title="Hasil scan struk">
        {result && (
          <ScanReview
            result={result}
            existingCount={itemCount}
            currentCharges={effectiveCharges}
            busy={saving}
            error={saveError}
            submitLabel={submitLabel}
            onSave={save}
            onClose={() => setResult(null)}
          />
        )}
      </Sheet>
    </div>
  );
}
