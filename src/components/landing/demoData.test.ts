import { describe, expect, it } from 'vitest';
import {
  BARS,
  EQUAL_SHARE,
  PEOPLE4,
  RAW_DEBTS,
  RECEIPT_ROWS,
  RESULT1,
  SETTLED,
} from './demoData';

describe('data demo landing (dihitung engine asli)', () => {
  it('adegan 1-2: angka sama dengan contoh kalkulator', () => {
    expect(RESULT1.grandTotal).toBe(143220);
    expect(BARS.map((b) => b.total)).toEqual([66990, 43890, 32340]);
    expect(BARS.reduce((a, b) => a + b.total, 0)).toBe(RESULT1.grandTotal);
    expect(EQUAL_SHARE).toBe(47740);
  });

  it('adegan 1: potongan struk per orang menjumlah ke harga baris', () => {
    for (const row of RECEIPT_ROWS) {
      expect(row.parts.reduce((a, p) => a + p.amount, 0)).toBe(row.total);
    }
    expect(RECEIPT_ROWS.find((r) => r.shared)?.parts).toHaveLength(3);
  });

  it('adegan 3: transfer menyusut drastis dan tetap melunasi semua saldo', () => {
    expect(RAW_DEBTS.length).toBe(9);
    expect(SETTLED.length).toBeLessThanOrEqual(3);
    expect(SETTLED.length).toBeLessThan(RAW_DEBTS.length);

    // saldo bersih dari utang mentah == saldo bersih dari transfer hasil settle
    const net = (edges: { from: string; to: string; amount: number }[]) => {
      const m = new Map(PEOPLE4.map((p) => [p.id, 0]));
      for (const e of edges) {
        m.set(e.from, (m.get(e.from) ?? 0) - e.amount);
        m.set(e.to, (m.get(e.to) ?? 0) + e.amount);
      }
      return Object.fromEntries(m);
    };
    expect(net(SETTLED)).toEqual(net(RAW_DEBTS));
  });
});
