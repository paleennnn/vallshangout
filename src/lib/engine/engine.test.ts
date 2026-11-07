import { describe, expect, it } from 'vitest';
import {
  SplitError,
  allocateItems,
  computeBillShares,
  computeCharges,
  distributeProportional,
  toFinalizePayload,
  type Bill,
  type BillItem,
} from './split';
import {
  balancesFromBills,
  remainingBalances,
  settleUp,
  settlementMessage,
  toTransfersPayload,
  type Balance,
} from './settle';
import { MAX_SPIN_OPTIONS, buildSpinOptions, winProbabilities } from './spin';

/** PRNG deterministik supaya fuzz test bisa diulang persis. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const int = (r: () => number, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

// ---------------------------------------------------------------------------
describe('distributeProportional (largest remainder)', () => {
  it('membagi habis tanpa sisa dan deterministik', () => {
    expect(distributeProportional(10001, [1, 1, 1])).toEqual([3334, 3334, 3333]);
    expect(distributeProportional(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('proporsional ke bobot', () => {
    expect(distributeProportional(5000, [50000, 30000, 20000])).toEqual([2500, 1500, 1000]);
  });

  it('mendukung total negatif (pembulatan struk)', () => {
    const parts = distributeProportional(-100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-100);
    expect(parts).toEqual([-34, -33, -33]);
  });

  it('bobot nol tidak kebagian', () => {
    expect(distributeProportional(7, [0, 3, 0, 4])).toEqual([0, 3, 0, 4]);
    expect(distributeProportional(5, [0, 1, 0])).toEqual([0, 5, 0]);
  });

  it('total 0 selalu nol; tanpa bobot dan total != 0 = error', () => {
    expect(distributeProportional(0, [0, 0])).toEqual([0, 0]);
    expect(() => distributeProportional(10, [0, 0])).toThrowError(SplitError);
    expect(() => distributeProportional(10, [])).toThrowError(SplitError);
  });

  it('menolak bukan-integer', () => {
    expect(() => distributeProportional(10.5, [1])).toThrowError(/bilangan bulat/);
    expect(() => distributeProportional(10, [1.5])).toThrowError(SplitError);
    expect(() => distributeProportional(10, [-1, 2])).toThrowError(SplitError);
  });

  it('tidak meluap untuk nominal besar (BigInt)', () => {
    const parts = distributeProportional(9_000_000_000, [3_000_000_000, 3_000_000_000, 3_000_000_001]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9_000_000_000);
  });

  it('fuzz: jumlah persis = total, tiap bagian dalam 1 rupiah dari nilai ideal', () => {
    const r = rng(42);
    for (let k = 0; k < 3000; k++) {
      const n = int(r, 1, 8);
      const weights = Array.from({ length: n }, () => int(r, 0, 1_000_000));
      if (Math.max(...weights) === 0) weights[0] = 1;
      const total = int(r, -5_000_000, 5_000_000);
      const parts = distributeProportional(total, weights);
      const W = weights.reduce((a, b) => a + b, 0);

      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      parts.forEach((p, i) => {
        expect(Number.isInteger(p)).toBe(true);
        expect(Math.abs(p - (total * weights[i]) / W)).toBeLessThan(1);
        if (weights[i] === 0) expect(p).toBe(0);
      });
    }
  });
});

// ---------------------------------------------------------------------------
describe('computeCharges (isi form dari persen)', () => {
  it('service 5%, pajak 10% dari (subtotal + service)', () => {
    expect(computeCharges(100000, { servicePct: 5, taxPct: 10 })).toEqual({
      serviceAmount: 5000,
      taxAmount: 10500,
    });
  });

  it('pajak hanya dari subtotal bila taxOnService = false', () => {
    expect(computeCharges(100000, { servicePct: 5, taxPct: 10, taxOnService: false })).toEqual({
      serviceAmount: 5000,
      taxAmount: 10000,
    });
  });

  it('diskon dipotong dulu sebelum service/tax', () => {
    expect(computeCharges(100000, { servicePct: 5, taxPct: 10, discountAmount: 10000 })).toEqual({
      serviceAmount: 4500,
      taxAmount: 9450,
    });
  });

  it('persen pecahan & pembulatan setengah ke atas, tanpa error float', () => {
    expect(computeCharges(10050, { servicePct: 0, taxPct: 10 }).taxAmount).toBe(1005);
    expect(computeCharges(10005, { servicePct: 0, taxPct: 10 }).taxAmount).toBe(1001); // 1000.5 -> 1001
    expect(computeCharges(1000, { servicePct: 7.5, taxPct: 0 }).serviceAmount).toBe(75);
  });
});

// ---------------------------------------------------------------------------
const A = 'p-febyan';
const B = 'p-budi';
const C = 'p-siti';

const item = (id: string, unitPrice: number, who: [string, number?][], qty = 1): BillItem => ({
  id,
  name: id,
  unitPrice,
  qty,
  assignments: who.map(([participantId, shares]) => ({ participantId, shares: shares ?? 1 })),
});

describe('allocateItems', () => {
  it('item patungan dibagi habis tanpa sisa', () => {
    const sub = allocateItems([item('pizza', 10001, [[A], [B], [C]])]);
    expect([...sub.values()].sort()).toEqual([3333, 3334, 3334]);
    expect([...sub.values()].reduce((a, b) => a + b, 0)).toBe(10001);
  });

  it('bobot porsi (shares) memengaruhi pembagian', () => {
    const sub = allocateItems([item('nasgor', 56000, [[A, 1], [B, 3]])]);
    expect(sub.get(A)).toBe(14000);
    expect(sub.get(B)).toBe(42000);
  });

  it('qty dikalikan harga satuan', () => {
    const sub = allocateItems([item('teh', 10000, [[C]], 3)]);
    expect(sub.get(C)).toBe(30000);
  });

  it('item tanpa penerima: error, atau dibagi rata bila diminta', () => {
    const orphan = item('kentang', 30000, []);
    expect(() => allocateItems([orphan])).toThrowError(/belum ditandai/);
    const sub = allocateItems([orphan], { onUnassigned: 'everyone', participantIds: [A, B, C] });
    expect([...sub.values()]).toEqual([10000, 10000, 10000]);
  });

  it('menolak shares / qty / harga tidak valid', () => {
    expect(() => allocateItems([item('x', 1000, [[A, 0]])])).toThrowError(/shares/);
    expect(() => allocateItems([item('x', 1000, [[A]], 0)])).toThrowError(SplitError);
    expect(() => allocateItems([item('x', -1, [[A]])])).toThrowError(SplitError);
  });
});

describe('computeBillShares: contoh nyata', () => {
  // Steak 50.000 (Febyan), Nasgor 30.000 (Budi), Es teh 2x10.000 (Siti)
  // service 5.000 + pajak 10.500 => total 115.500
  const bill: Bill = {
    items: [item('steak', 50000, [[A]]), item('nasgor', 30000, [[B]]), item('teh', 10000, [[C]], 2)],
    serviceAmount: 5000,
    taxAmount: 10500,
    discountAmount: 0,
    roundingAmount: 0,
  };

  it('service & pajak dibagi proporsional 50/30/20', () => {
    const { shares, subtotal, grandTotal } = computeBillShares(bill);
    const byId = Object.fromEntries(shares.map((s) => [s.participantId, s]));
    expect(subtotal).toBe(100000);
    expect(grandTotal).toBe(115500);
    expect(byId[A]).toMatchObject({ subtotal: 50000, serviceAmount: 2500, taxAmount: 5250, total: 57750 });
    expect(byId[B]).toMatchObject({ subtotal: 30000, serviceAmount: 1500, taxAmount: 3150, total: 34650 });
    expect(byId[C]).toMatchObject({ subtotal: 20000, serviceAmount: 1000, taxAmount: 2100, total: 23100 });
  });

  it('payload sesuai kontrak finalize_bill (snake_case)', () => {
    const payload = toFinalizePayload(computeBillShares(bill).shares);
    expect(payload[0]).toEqual({
      participant_id: A,
      subtotal: 50000,
      service_amount: 2500,
      tax_amount: 5250,
      discount_amount: 0,
      rounding_amount: 0,
      total: 57750,
    });
  });

  it('diskon & pembulatan negatif ikut dibagi, total tetap persis', () => {
    const r = computeBillShares({ ...bill, discountAmount: 12000, roundingAmount: -50 });
    expect(r.grandTotal).toBe(100000 + 5000 + 10500 - 12000 - 50);
    expect(r.shares.reduce((a, s) => a + s.total, 0)).toBe(r.grandTotal);
  });

  it('peserta tanpa pesanan (mis. yang traktir tapi tidak makan) tidak punya baris, kecuali diminta', () => {
    expect(computeBillShares(bill).shares).toHaveLength(3);
    const tiny: Bill = { ...bill, items: [item('a', 1000, [[A]])], serviceAmount: 0, taxAmount: 0 };
    expect(computeBillShares(tiny).shares).toHaveLength(1);
  });

  it('diskon lebih besar dari tagihan = error', () => {
    expect(() => computeBillShares({ ...bill, discountAmount: 999999 })).toThrowError(/negatif/);
  });

  it('service/tax > 0 tapi tidak ada item = error yang jelas', () => {
    expect(() => computeBillShares({ ...bill, items: [] })).toThrowError(SplitError);
  });

  it('fuzz: jumlah semua share SELALU = grand total', () => {
    const r = rng(7);
    const people = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let k = 0; k < 1500; k++) {
      const n = int(r, 2, 6);
      const ids = people.slice(0, n);
      const items: BillItem[] = Array.from({ length: int(r, 1, 8) }, (_, i) => {
        const takers = ids.filter(() => r() < 0.5);
        const who = (takers.length ? takers : [ids[int(r, 0, n - 1)]]).map(
          (id) => [id, [0.5, 1, 1, 2][int(r, 0, 3)]] as [string, number],
        );
        return item(`i${i}`, int(r, 1, 99) * 1000 + int(r, 0, 999), who, int(r, 1, 3));
      });
      const subtotal = items.reduce((a, it) => a + it.unitPrice * it.qty, 0);
      const bill: Bill = {
        items,
        serviceAmount: int(r, 0, 20000),
        taxAmount: int(r, 0, 30000),
        discountAmount: int(r, 0, Math.min(subtotal, 50000)),
        roundingAmount: int(r, -99, 99),
      };
      const res = computeBillShares(bill);
      expect(res.shares.reduce((a, s) => a + s.total, 0)).toBe(res.grandTotal);
      expect(res.shares.reduce((a, s) => a + s.subtotal, 0)).toBe(subtotal);
      res.shares.forEach((s) =>
        expect(s.total).toBe(s.subtotal + s.serviceAmount + s.taxAmount - s.discountAmount + s.roundingAmount),
      );
    }
  });
});

// ---------------------------------------------------------------------------
const net = (...pairs: [string, number][]): Balance[] => pairs.map(([participantId, n]) => ({ participantId, net: n }));

/** Terapkan transfer ke saldo; semua harus kembali 0. */
function applyAll(balances: Balance[], transfers: { from: string; to: string; amount: number }[]) {
  return remainingBalances(balances, transfers).every((b) => b.net === 0);
}

describe('settleUp', () => {
  it('satu penalang: semua transfer ke penalang', () => {
    const { shares, grandTotal } = computeBillShares({
      items: [item('steak', 50000, [[A]]), item('nasgor', 30000, [[B]]), item('teh', 10000, [[C]], 2)],
      serviceAmount: 5000,
      taxAmount: 10500,
      discountAmount: 0,
      roundingAmount: 0,
    });
    const balances = balancesFromBills([{ paidBy: A, grandTotal, shares }], [A, B, C]);
    expect(balances.find((b) => b.participantId === A)?.net).toBe(57750);

    const transfers = settleUp(balances);
    expect(transfers).toHaveLength(2);
    expect(transfers.every((t) => t.to === A)).toBe(true);
    expect(transfers.find((t) => t.from === B)?.amount).toBe(34650);
    expect(transfers.find((t) => t.from === C)?.amount).toBe(23100);
    expect(applyAll(balances, transfers)).toBe(true);
  });

  it('semua impas => tidak ada transfer', () => {
    expect(settleUp(net(['a', 0], ['b', 0]))).toEqual([]);
    expect(settleUp([])).toEqual([]);
  });

  it('jumlah saldo bukan nol = error', () => {
    expect(() => settleUp(net(['a', 100], ['b', -90]))).toThrowError(/harus 0/);
  });

  it('exact menemukan lebih sedikit transfer daripada greedy murni', () => {
    // Dua grup tersembunyi: {a,c,d} dan {b,e}
    const balances = net(['a', 60], ['c', -30], ['d', -30], ['b', 50], ['e', -50]);
    const greedy = settleUp(balances, { exact: false });
    const exact = settleUp(balances, { exact: true });
    expect(greedy).toHaveLength(4);
    expect(exact).toHaveLength(3);
    expect(applyAll(balances, greedy)).toBe(true);
    expect(applyAll(balances, exact)).toBe(true);
  });

  it('melanjutkan setelah sebagian transfer sudah terjadi (selaras dengan replace_transfers)', () => {
    const balances = net(['host', 57750], ['budi', -34650], ['siti', -23100]);
    const done = [{ from: 'budi', to: 'host', amount: 34650 }];
    const rest = remainingBalances(balances, done);
    expect(rest.find((b) => b.participantId === 'budi')?.net).toBe(0);

    const plan = settleUp(rest);
    expect(plan).toEqual([{ from: 'siti', to: 'host', amount: 23100 }]);
    expect(applyAll(balances, [...done, ...plan])).toBe(true);
  });

  it('di atas batas exactLimit jatuh ke greedy dan tetap melunasi semua', () => {
    const r = rng(99);
    const ids = Array.from({ length: 20 }, (_, i) => `u${i}`);
    const nets = ids.map(() => int(r, -50000, 50000));
    nets[0] -= nets.reduce((a, b) => a + b, 0);
    const balances = ids.map((participantId, i) => ({ participantId, net: nets[i] }));
    const transfers = settleUp(balances);
    expect(transfers.length).toBeLessThanOrEqual(19);
    expect(applyAll(balances, transfers)).toBe(true);
  });

  it('fuzz: semua lunas, nominal bulat positif, <= n-1 transfer, exact <= greedy', () => {
    const r = rng(2026);
    for (let k = 0; k < 400; k++) {
      const n = int(r, 2, 9);
      const nets = Array.from({ length: n }, () => int(r, -200, 200) * 1000);
      nets[n - 1] -= nets.reduce((a, b) => a + b, 0);
      const balances = nets.map((v, i) => ({ participantId: `u${i}`, net: v }));

      const exact = settleUp(balances, { exact: true });
      const greedy = settleUp(balances, { exact: false });
      const nonZero = balances.filter((b) => b.net !== 0).length;

      expect(applyAll(balances, exact)).toBe(true);
      expect(applyAll(balances, greedy)).toBe(true);
      expect(exact.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      expect(exact.length).toBeLessThanOrEqual(greedy.length);
      exact.forEach((t) => {
        expect(Number.isSafeInteger(t.amount) && t.amount > 0).toBe(true);
        expect(t.from).not.toBe(t.to);
      });
    }
  });

  it('payload sesuai kontrak replace_transfers (snake_case)', () => {
    expect(toTransfersPayload([{ from: 'budi', to: 'host', amount: 100 }])).toEqual([
      { from_participant: 'budi', to_participant: 'host', amount: 100 },
    ]);
  });
});

describe('settlementMessage', () => {
  const names: Record<string, string> = { budi: 'Budi', host: 'Febyan' };
  it('menyusun pesan WhatsApp', () => {
    const msg = settlementMessage({
      title: 'Malming',
      transfers: [{ from: 'budi', to: 'host', amount: 34650 }],
      nameOf: (id) => names[id],
      payInfo: 'DANA 0812xxxx a.n. Febyan',
    });
    expect(msg).toContain('*Malming*');
    expect(msg).not.toMatch(/[\u2014\u2192]/); // tanpa tanda pisah panjang dan panah
    expect(msg).toContain('Budi ke Febyan');
    expect(msg).toContain('34.650');
    expect(msg).toContain('Bayar ke: DANA');
  });

  it('kosong = impas', () => {
    expect(settlementMessage({ title: 'X', transfers: [], nameOf: String })).toContain('impas');
    expect(settlementMessage({ transfers: [], nameOf: String })).toBe('Semua sudah impas.');
  });
});

// ---------------------------------------------------------------------------
describe('spin weights', () => {
  const now = new Date('2026-11-06T00:00:00Z');
  const places = [
    { id: 'baru', name: 'Cafe Baru' },
    { id: 'kemarin', name: 'Cafe Kemarin' },
    { id: 'lama', name: 'Cafe Lama' },
  ];
  const stats = [
    { placeId: 'kemarin', visitCount: 5, lastVisitedAt: '2026-11-05T00:00:00Z' },
    { placeId: 'lama', visitCount: 2, lastVisitedAt: '2026-08-01T00:00:00Z' },
  ];

  it('belum pernah > sudah lama tidak ke sana > baru kemarin', () => {
    const w = Object.fromEntries(buildSpinOptions(places, stats, now).map((o) => [o.ref_id, o.weight]));
    expect(w.baru).toBe(1.5);
    expect(w.lama).toBe(1);
    expect(w.kemarin).toBeLessThan(w.lama);
    expect(w.kemarin).toBeGreaterThanOrEqual(0.25);
  });

  it('bentuk sesuai kontrak do_spin dan excludeIds bekerja', () => {
    const opts = buildSpinOptions(places, stats, now, { excludeIds: ['kemarin'] });
    expect(opts.map((o) => o.ref_id)).toEqual(['baru', 'lama']);
    expect(opts[0]).toEqual({ label: 'Cafe Baru', weight: 1.5, ref_id: 'baru' });
  });

  it('dipotong ke 50 opsi berbobot tertinggi, urutan asli terjaga', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const manyStats = many.slice(0, 20).map((p) => ({
      placeId: p.id,
      visitCount: 9,
      lastVisitedAt: '2026-11-05T00:00:00Z', // baru dikunjungi => bobot terendah
    }));
    const opts = buildSpinOptions(many, manyStats, now);
    expect(opts).toHaveLength(MAX_SPIN_OPTIONS);
    // 40 tempat belum pernah dikunjungi (bobot 1.5) semuanya ikut; sisa 10 slot diisi yang baru dikunjungi
    expect(opts.filter((o) => o.weight === 1.5)).toHaveLength(40);
    expect(opts.filter((o) => o.weight < 1)).toHaveLength(10);
    expect(opts.map((o) => o.ref_id)).toEqual(
      many.map((p) => p.id).filter((id) => opts.some((o) => o.ref_id === id)),
    );
  });

  it('winProbabilities berjumlah 1', () => {
    const p = winProbabilities([{ weight: 3 }, { weight: 1 }]);
    expect(p).toEqual([0.75, 0.25]);
    expect(winProbabilities([])).toEqual([]);
  });

  it('konfigurasi tidak valid ditolak', () => {
    expect(() => buildSpinOptions(places, stats, now, { minWeight: 0 })).toThrowError(RangeError);
  });
});
