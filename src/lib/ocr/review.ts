import type { ParsedReceipt } from './types';

/** Satu baris menu di layar tinjau; bisa diedit pengguna sebelum disimpan. */
export interface ReviewItem {
  key: string;
  name: string;
  qty: number;
  /** null = belum diisi (dianggap salah saat disimpan). */
  unitPrice: number | null;
  /** Dari parser: baris ini meragukan dan perlu dicek. */
  suspect: boolean;
  note?: string;
}

export interface ReviewCharges {
  service: number;
  tax: number;
  discount: number;
  rounding: number;
}

export function toReviewItems(parsed: ParsedReceipt): ReviewItem[] {
  return parsed.items.map((it, i) => ({
    key: `scan-${i}`,
    name: it.name,
    qty: it.qty,
    unitPrice: it.unitPrice,
    suspect: it.suspect,
    note: it.note,
  }));
}

export const lineTotal = (it: Pick<ReviewItem, 'qty' | 'unitPrice'>) => it.qty * (it.unitPrice ?? 0);

/**
 * Mencocokkan hasil edit dengan total di struk: jumlah menu + service + pajak - diskon +
 * pembulatan harus sama dengan total yang tercetak. `diff` = total struk - hitungan.
 */
export function reviewTotals(items: ReviewItem[], charges: ReviewCharges, receiptTotal: number | null) {
  const itemsSum = items.reduce((a, it) => a + lineTotal(it), 0);
  const expected = itemsSum + charges.service + charges.tax - charges.discount + charges.rounding;
  const diff = receiptTotal === null ? null : receiptTotal - expected;
  return { itemsSum, expected, diff, matches: diff === null ? null : diff === 0 };
}
