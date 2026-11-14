import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/synthetic-ocr.json';
import { analyzeWords } from './pipeline';
import { lineTotal, reviewTotals, toReviewItems, type ReviewItem } from './review';
import type { OcrWord } from './types';

const item = (qty: number, unitPrice: number | null): ReviewItem => ({ key: 'k', name: 'Menu', qty, unitPrice, suspect: false });
const none = { service: 0, tax: 0, discount: 0, rounding: 0 };

describe('toReviewItems', () => {
  it('membawa nama, jumlah, harga satuan, dan penanda ragu dari hasil parse', () => {
    const { parsed } = analyzeWords((fixtures as Record<string, { words: OcrWord[] }>).mart_clean.words);
    const items = toReviewItems(parsed);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ name: 'INDOMIE GORENG SPESIAL', qty: 1, unitPrice: 17500, suspect: true });
    expect(items[0].note).toMatch(/tidak terbaca jelas/);
    expect(new Set(items.map((i) => i.key)).size).toBe(3);
  });
});

describe('lineTotal', () => {
  it('jumlah x harga satuan; harga kosong dihitung nol', () => {
    expect(lineTotal(item(3, 7000))).toBe(21000);
    expect(lineTotal(item(2, null))).toBe(0);
  });
});

describe('reviewTotals', () => {
  it('jumlah menu + service + pajak - diskon + pembulatan', () => {
    const t = reviewTotals([item(2, 18000), item(1, 28000)], { service: 3200, tax: 6720, discount: 1000, rounding: -20 }, 72900);
    expect(t).toEqual({ itemsSum: 64000, expected: 72900, diff: 0, matches: true });
  });

  it('selisih = total struk dikurangi hitungan, positif bila hitungan kurang', () => {
    expect(reviewTotals([item(1, 50000)], none, 51000)).toMatchObject({ diff: 1000, matches: false });
    expect(reviewTotals([item(1, 50000)], none, 49000)).toMatchObject({ diff: -1000, matches: false });
  });

  it('tanpa total struk: belum bisa dicocokkan', () => {
    expect(reviewTotals([item(1, 50000)], none, null)).toMatchObject({ diff: null, matches: null });
  });

  it('keluaran scan yang benar langsung cocok setelah dijadikan baris tinjau', () => {
    const { parsed } = analyzeWords((fixtures as Record<string, { words: OcrWord[] }>).cafe_clean.words);
    const t = reviewTotals(
      toReviewItems(parsed),
      { service: parsed.serviceAmount, tax: parsed.taxAmount, discount: parsed.discountAmount, rounding: parsed.roundingAmount },
      parsed.total,
    );
    expect(t.matches).toBe(true);
    expect(t.expected).toBe(110800);
  });
});
