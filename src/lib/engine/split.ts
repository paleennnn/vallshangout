/**
 * VallsHangout — mesin pembagian tagihan.
 *
 * Fungsi murni, tanpa dependensi, tanpa efek samping. Jalan di browser (kalkulator
 * tetap berfungsi walau Supabase sedang pause) dan di Vitest.
 *
 * Aturan emas: uang = BILANGAN BULAT (rupiah utuh). Tidak ada float untuk uang.
 *
 * Alur:
 *   allocateItems()      siapa makan apa  -> subtotal per orang
 *   computeCharges()     (opsional) persen service/tax -> angka rupiah untuk diisikan ke form
 *   computeBillShares()  service/tax/diskon/pembulatan dibagi PROPORSIONAL ke subtotal,
 *                        jumlahnya dijamin persis sama dengan total struk
 *   toFinalizePayload()  bentuk JSON untuk rpc('finalize_bill')
 */

export type Id = string;
/** Bilangan bulat (rupiah utuh). */
export type Money = number;

export type SplitErrorCode =
  | 'NOT_INTEGER'
  | 'BAD_SHARES'
  | 'BAD_ITEM'
  | 'NO_WEIGHTS'
  | 'UNASSIGNED_ITEM'
  | 'NEGATIVE_TOTAL'
  | 'MISMATCH';

export class SplitError extends Error {
  readonly code: SplitErrorCode;
  constructor(code: SplitErrorCode, message: string) {
    super(message);
    this.name = 'SplitError';
    this.code = code;
  }
}

function assertInt(n: number, label: string): void {
  if (!Number.isSafeInteger(n)) {
    throw new SplitError('NOT_INTEGER', `${label} harus bilangan bulat (dapat ${n})`);
  }
}

/**
 * Bagi `total` (integer, boleh negatif) sebanding `weights` (integer >= 0).
 * Hasil berupa integer dan JUMLAHNYA PERSIS = total (metode largest remainder / Hamilton).
 * Sisa pecahan sama besar: bobot lebih besar didahulukan, lalu indeks lebih kecil (deterministik).
 * Memakai BigInt di dalam supaya tidak meluap untuk nominal besar.
 */
export function distributeProportional(total: Money, weights: number[]): Money[] {
  assertInt(total, 'total');
  weights.forEach((w, i) => {
    if (!Number.isSafeInteger(w) || w < 0) {
      throw new SplitError('BAD_SHARES', `bobot[${i}] harus integer >= 0 (dapat ${w})`);
    }
  });

  if (total === 0) return weights.map(() => 0);

  const W = weights.reduce((acc, w) => acc + BigInt(w), 0n);
  if (W === 0n) {
    throw new SplitError('NO_WEIGHTS', `tidak ada penerima untuk dibagi (total ${total})`);
  }

  const sign = total < 0 ? -1n : 1n;
  const T = total < 0 ? -BigInt(total) : BigInt(total);

  const parts = weights.map((w) => (T * BigInt(w)) / W);
  const remainders = weights.map((w) => (T * BigInt(w)) % W);
  let left = T - parts.reduce((a, b) => a + b, 0n);

  const order = weights
    .map((_, i) => i)
    .sort((i, j) => {
      if (remainders[i] !== remainders[j]) return remainders[i] < remainders[j] ? 1 : -1;
      return weights[j] - weights[i] || i - j;
    });

  for (const i of order) {
    if (left === 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }

  return parts.map((p) => Number(sign * p));
}

// ---------------------------------------------------------------------------
// Item & alokasi
// ---------------------------------------------------------------------------

export interface ItemAssignment {
  participantId: Id;
  /** Bobot porsi, > 0, boleh 2 desimal (1 = satu porsi). */
  shares: number;
}

export interface BillItem {
  id: Id;
  name?: string;
  unitPrice: Money;
  qty: number;
  assignments: ItemAssignment[];
}

export interface Bill {
  items: BillItem[];
  /** Angka ASLI dari struk (sumber kebenaran). Pakai computeCharges() hanya untuk mengisi form. */
  serviceAmount: Money;
  taxAmount: Money;
  discountAmount: Money;
  /** Pembulatan struk, boleh negatif. */
  roundingAmount: Money;
}

export interface AllocateOptions {
  /** Item yang belum ditandai siapa pun: 'throw' (default) atau 'everyone' (dibagi rata). */
  onUnassigned?: 'throw' | 'everyone';
  /** Wajib diisi bila onUnassigned = 'everyone'. */
  participantIds?: Id[];
}

function shareUnits(shares: number): number {
  const units = Math.round(shares * 100);
  if (!Number.isFinite(shares) || units <= 0) {
    throw new SplitError('BAD_SHARES', `shares harus > 0 (dapat ${shares})`);
  }
  return units;
}

/** Subtotal per peserta. Harga tiap baris item dibagi habis (tanpa sisa) ke penerimanya. */
export function allocateItems(items: BillItem[], opts: AllocateOptions = {}): Map<Id, Money> {
  const subtotals = new Map<Id, Money>();

  for (const item of items) {
    const label = item.name ?? item.id;
    assertInt(item.unitPrice, `harga "${label}"`);
    if (item.unitPrice < 0 || !Number.isInteger(item.qty) || item.qty <= 0) {
      throw new SplitError('BAD_ITEM', `item "${label}" punya harga/qty tidak valid`);
    }

    let assignments = item.assignments;
    if (assignments.length === 0) {
      if (opts.onUnassigned === 'everyone' && opts.participantIds?.length) {
        assignments = opts.participantIds.map((participantId) => ({ participantId, shares: 1 }));
      } else {
        throw new SplitError('UNASSIGNED_ITEM', `item "${label}" belum ditandai siapa pun`);
      }
    }

    const line = item.unitPrice * item.qty;
    const parts = distributeProportional(line, assignments.map((a) => shareUnits(a.shares)));
    assignments.forEach((a, i) => {
      subtotals.set(a.participantId, (subtotals.get(a.participantId) ?? 0) + parts[i]);
    });
  }
  return subtotals;
}

// ---------------------------------------------------------------------------
// Service & tax dari persen (untuk mengisi form; angka struk tetap yang menang)
// ---------------------------------------------------------------------------

export interface ChargeRates {
  servicePct: number;
  taxPct: number;
  /** true (default): pajak dihitung dari (subtotal + service). */
  taxOnService?: boolean;
  /** Diskon dipotong dari subtotal SEBELUM service/tax dihitung. */
  discountAmount?: Money;
}

function pctOf(amount: Money, pct: number): Money {
  const basisPoints = Math.round(pct * 100); // 10.5% -> 1050
  return Math.floor((amount * basisPoints + 5000) / 10000); // setengah ke atas
}

export function computeCharges(
  subtotal: Money,
  rates: ChargeRates,
): { serviceAmount: Money; taxAmount: Money } {
  assertInt(subtotal, 'subtotal');
  const base = Math.max(0, subtotal - (rates.discountAmount ?? 0));
  const serviceAmount = pctOf(base, rates.servicePct);
  const taxBase = (rates.taxOnService ?? true) ? base + serviceAmount : base;
  return { serviceAmount, taxAmount: pctOf(taxBase, rates.taxPct) };
}

// ---------------------------------------------------------------------------
// Hasil per orang
// ---------------------------------------------------------------------------

export interface BillShare {
  participantId: Id;
  subtotal: Money;
  serviceAmount: Money;
  taxAmount: Money;
  discountAmount: Money;
  roundingAmount: Money;
  total: Money;
}

export interface BillResult {
  shares: BillShare[];
  /** Jumlah harga semua item. */
  subtotal: Money;
  /** subtotal + service + tax - diskon + pembulatan (= jumlah semua share.total). */
  grandTotal: Money;
}

export function computeBillShares(
  bill: Bill,
  opts: AllocateOptions & { includeZero?: boolean } = {},
): BillResult {
  assertInt(bill.serviceAmount, 'service');
  assertInt(bill.taxAmount, 'tax');
  assertInt(bill.discountAmount, 'diskon');
  assertInt(bill.roundingAmount, 'pembulatan');
  if (bill.serviceAmount < 0 || bill.taxAmount < 0 || bill.discountAmount < 0) {
    throw new SplitError('BAD_ITEM', 'service, tax, dan diskon tidak boleh negatif');
  }

  const perPerson = allocateItems(bill.items, opts);
  const ids = [...perPerson.keys()];
  const weights = ids.map((id) => perPerson.get(id) as number);
  const subtotal = weights.reduce((a, b) => a + b, 0);

  const grandTotal =
    subtotal + bill.serviceAmount + bill.taxAmount - bill.discountAmount + bill.roundingAmount;
  if (grandTotal < 0) {
    throw new SplitError('NEGATIVE_TOTAL', 'diskon/pembulatan membuat total tagihan negatif');
  }

  const service = distributeProportional(bill.serviceAmount, weights);
  const tax = distributeProportional(bill.taxAmount, weights);
  const discount = distributeProportional(bill.discountAmount, weights);
  const rounding = distributeProportional(bill.roundingAmount, weights);

  let shares: BillShare[] = ids.map((participantId, i) => ({
    participantId,
    subtotal: weights[i],
    serviceAmount: service[i],
    taxAmount: tax[i],
    discountAmount: discount[i],
    roundingAmount: rounding[i],
    total: weights[i] + service[i] + tax[i] - discount[i] + rounding[i],
  }));

  const sum = shares.reduce((acc, s) => acc + s.total, 0);
  if (sum !== grandTotal) {
    // Tidak mungkin terjadi; jaga-jaga supaya tidak pernah mengirim angka salah ke server.
    throw new SplitError('MISMATCH', `jumlah pembagian ${sum} != total ${grandTotal}`);
  }

  if (!opts.includeZero) shares = shares.filter((s) => s.total !== 0 || s.subtotal !== 0);
  return { shares, subtotal, grandTotal };
}

/** Bentuk JSON untuk `supabase.rpc('finalize_bill', { p_bill, p_shares })`. */
export function toFinalizePayload(shares: BillShare[]) {
  return shares.map((s) => ({
    participant_id: s.participantId,
    subtotal: s.subtotal,
    service_amount: s.serviceAmount,
    tax_amount: s.taxAmount,
    discount_amount: s.discountAmount,
    rounding_amount: s.roundingAmount,
    total: s.total,
  }));
}

/** "Rp 28.000" */
export function formatIDR(n: Money): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
}
