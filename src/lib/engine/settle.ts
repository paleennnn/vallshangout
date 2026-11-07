/**
 * VallsHangout: "siapa transfer berapa ke siapa".
 *
 * net > 0  => orang ini harus DITERIMA uangnya (dia yang talangin)
 * net < 0  => orang ini berutang
 * Jumlah semua net dalam satu hangout selalu 0.
 *
 * Meminimalkan jumlah transfer secara umum adalah masalah NP-hard, tapi hangout itu kecil:
 * untuk <= 14 orang yang saldonya tidak nol kita cari pembagian grup "zero-sum" terbanyak
 * dengan DP bitmask (optimal). Tiap grup berisi k orang butuh paling sedikit k-1 transfer.
 * Di atas batas itu dipakai greedy (paling banyak n-1 transfer).
 */
import { SplitError, formatIDR, type Id, type Money } from './split';

export interface Balance {
  participantId: Id;
  net: Money;
}

export interface Transfer {
  from: Id; // pengirim (berutang)
  to: Id; // penerima
  amount: Money;
}

/**
 * Saldo dari daftar bill final (untuk mode offline / sebelum data masuk ke Supabase).
 * Di mode online cukup baca view `hangout_balances`.
 */
export function balancesFromBills(
  bills: {
    paidBy: Id;
    grandTotal: Money;
    shares: { participantId: Id; total: Money }[];
  }[],
  participantIds: Id[] = [],
): Balance[] {
  const net = new Map<Id, Money>(participantIds.map((id) => [id, 0]));
  const add = (id: Id, delta: Money) => net.set(id, (net.get(id) ?? 0) + delta);

  for (const bill of bills) {
    add(bill.paidBy, bill.grandTotal);
    for (const s of bill.shares) add(s.participantId, -s.total);
  }
  return [...net].map(([participantId, n]) => ({ participantId, net: n }));
}

/**
 * Saldo yang masih tersisa setelah transfer yang SUDAH terjadi (paid/confirmed).
 * Rumusnya sama dengan validasi di `replace_transfers`: net + keluar - masuk.
 */
export function remainingBalances(balances: Balance[], done: Transfer[]): Balance[] {
  const net = new Map<Id, Money>(balances.map((b) => [b.participantId, b.net]));
  for (const t of done) {
    net.set(t.from, (net.get(t.from) ?? 0) + t.amount);
    net.set(t.to, (net.get(t.to) ?? 0) - t.amount);
  }
  return [...net].map(([participantId, n]) => ({ participantId, net: n }));
}

export interface SettleOptions {
  /** Cari jumlah transfer paling sedikit (default true). */
  exact?: boolean;
  /** Batas jumlah orang (saldo != 0) untuk pencarian optimal (default 14). */
  exactLimit?: number;
}

export function settleUp(balances: Balance[], opts: SettleOptions = {}): Transfer[] {
  for (const b of balances) {
    if (!Number.isSafeInteger(b.net)) {
      throw new SplitError('NOT_INTEGER', `saldo ${b.participantId} harus bilangan bulat`);
    }
  }
  const people = balances.filter((b) => b.net !== 0);
  const total = people.reduce((acc, b) => acc + b.net, 0);
  if (total !== 0) {
    throw new SplitError('MISMATCH', `jumlah saldo harus 0 (dapat ${total})`);
  }
  if (people.length === 0) return [];

  const limit = opts.exactLimit ?? 14;
  const groups = (opts.exact ?? true) && people.length <= limit ? partitionZeroSum(people) : [people];
  return groups.flatMap(greedySettle);
}

/**
 * Pecah orang-orang ke sebanyak mungkin grup yang jumlah saldonya 0.
 * dp[mask] = jumlah maksimum "prefix berjumlah nol" pada urutan mana pun dari anggota mask.
 */
function partitionZeroSum(people: Balance[]): Balance[][] {
  const n = people.length;
  const size = 1 << n;
  const full = size - 1;

  const sum = new Float64Array(size);
  for (let m = 1; m < size; m++) {
    const low = m & -m;
    sum[m] = sum[m ^ low] + people[31 - Math.clz32(low)].net;
  }

  const dp = new Int8Array(size);
  const pick = new Int8Array(size);
  for (let m = 1; m < size; m++) {
    let best = -1;
    let bestI = -1;
    for (let i = 0; i < n; i++) {
      if (m & (1 << i)) {
        const v = dp[m ^ (1 << i)];
        if (v > best) {
          best = v;
          bestI = i;
        }
      }
    }
    dp[m] = best + (sum[m] === 0 ? 1 : 0);
    pick[m] = bestI;
  }

  // Rekonstruksi urutan, lalu potong di setiap prefix berjumlah nol.
  const order: number[] = [];
  for (let m = full; m !== 0; m ^= 1 << pick[m]) order.push(pick[m]);
  order.reverse();

  const groups: Balance[][] = [];
  let current: Balance[] = [];
  let running = 0;
  for (const i of order) {
    current.push(people[i]);
    running += people[i].net;
    if (running === 0) {
      groups.push(current);
      current = [];
    }
  }
  return groups;
}

/** Pasangkan penerima terbesar dengan pengutang terbesar; tiap langkah melunasi minimal satu orang. */
function greedySettle(group: Balance[]): Transfer[] {
  const byAmountThenId = (a: { id: Id; amt: Money }, b: { id: Id; amt: Money }) =>
    b.amt - a.amt || a.id.localeCompare(b.id);

  const debtors = group
    .filter((b) => b.net < 0)
    .map((b) => ({ id: b.participantId, amt: -b.net }))
    .sort(byAmountThenId);
  const creditors = group
    .filter((b) => b.net > 0)
    .map((b) => ({ id: b.participantId, amt: b.net }))
    .sort(byAmountThenId);

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amount = Math.min(d.amt, c.amt);
    out.push({ from: d.id, to: c.id, amount });
    d.amt -= amount;
    c.amt -= amount;
    if (d.amt === 0) i++;
    if (c.amt === 0) j++;
  }
  return out;
}

/** Bentuk JSON untuk `supabase.rpc('replace_transfers', { p_hangout, p_transfers })`. */
export function toTransfersPayload(transfers: Transfer[]) {
  return transfers.map((t) => ({
    from_participant: t.from,
    to_participant: t.to,
    amount: t.amount,
  }));
}

/** Teks siap tempel ke grup WhatsApp (format tebal WhatsApp: *teks*). */
export function settlementMessage(opts: {
  /** Opsional: judul tebal di baris pertama. */
  title?: string;
  transfers: Transfer[];
  nameOf: (id: Id) => string;
  /** Mis. "DANA 0812xxxx a.n. Febyan". */
  payInfo?: string;
  formatMoney?: (n: Money) => string;
}): string {
  const fmt = opts.formatMoney ?? formatIDR;
  const head = opts.title ? [`*${opts.title}*`] : [];
  if (opts.transfers.length === 0) return [...head, 'Semua sudah impas.'].join('\n');

  const lines = opts.transfers.map(
    (t) => `- ${opts.nameOf(t.from)} ke ${opts.nameOf(t.to)}: ${fmt(t.amount)}`,
  );
  return [
    ...head,
    'Yang perlu ditransfer:',
    ...lines,
    ...(opts.payInfo ? ['', `Bayar ke: ${opts.payInfo}`] : []),
  ].join('\n');
}
