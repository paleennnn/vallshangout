/**
 * Data demo untuk animasi landing page. SEMUA angka dihitung oleh engine yang sama dengan
 * kalkulator asli (src/lib/engine), jadi yang tampil di animasi = hasil hitung sungguhan.
 */
import {
  allocateItems,
  computeBillShares,
  computeCharges,
  type Bill,
  type BillItem,
} from '@/lib/engine/split';
import { balancesFromBills, settleUp, type Transfer } from '@/lib/engine/settle';

export interface DemoPerson {
  id: string;
  name: string;
  color: string;
  /** warna teks di atas `color` (selalu charcoal: kontras >= 7:1 pada keempat warna) */
  ink: string;
}

const INK = '#292524';

// Adegan 1 & 2: satu struk, tiga orang
export const PEOPLE3: DemoPerson[] = [
  { id: 'f', name: 'Valen', color: '#F97316', ink: INK },
  { id: 'b', name: 'Bio', color: '#2DD4BF', ink: INK },
  { id: 's', name: 'Bubub', color: '#FACC15', ink: INK },
];

const itemDefs = [
  { name: 'Steak', price: 50000, qty: 1, eaters: ['f'] },
  { name: 'Nasi goreng', price: 30000, qty: 1, eaters: ['b'] },
  { name: 'Es teh ×2', price: 10000, qty: 2, eaters: ['s'] },
  { name: 'Kentang goreng', price: 24000, qty: 1, eaters: ['f', 'b', 's'] },
];

const billItems: BillItem[] = itemDefs.map((d, i) => ({
  id: `i${i}`,
  name: d.name,
  unitPrice: d.price,
  qty: d.qty,
  assignments: d.eaters.map((participantId) => ({ participantId, shares: 1 })),
}));

const subtotal1 = billItems.reduce((a, it) => a + it.unitPrice * it.qty, 0);
const charges1 = computeCharges(subtotal1, { servicePct: 5, taxPct: 10 });

export const BILL1: Bill = {
  items: billItems,
  serviceAmount: charges1.serviceAmount,
  taxAmount: charges1.taxAmount,
  discountAmount: 0,
  roundingAmount: 0,
};
export const RESULT1 = computeBillShares(BILL1);
export const SERVICE_PCT = 5;
export const TAX_PCT = 10;

export interface ReceiptRowData {
  name: string;
  total: number;
  /** bagian per orang: indeks di PEOPLE3 + jumlah rupiah (hasil allocateItems, tanpa sisa) */
  parts: { person: number; amount: number }[];
  shared: boolean;
}

export const RECEIPT_ROWS: ReceiptRowData[] = billItems.map((item) => {
  const per = allocateItems([item]);
  return {
    name: item.name ?? '',
    total: item.unitPrice * item.qty,
    shared: item.assignments.length > 1,
    parts: PEOPLE3.flatMap((p, person) => (per.has(p.id) ? [{ person, amount: per.get(p.id) as number }] : [])),
  };
});

export interface ShareBar {
  person: DemoPerson;
  subtotal: number;
  charges: number;
  total: number;
}
export const BARS: ShareBar[] = PEOPLE3.map((person) => {
  const s = RESULT1.shares.find((x) => x.participantId === person.id);
  if (!s) throw new Error(`demo: share ${person.id} hilang`);
  return { person, subtotal: s.subtotal, charges: s.serviceAmount + s.taxAmount, total: s.total };
});
export const EQUAL_SHARE = Math.round(RESULT1.grandTotal / PEOPLE3.length);
export const MAX_TOTAL = Math.max(...BARS.map((b) => b.total), EQUAL_SHARE);

// Adegan 3: seminggu, 3 tempat, gantian talangin
export const PEOPLE4: (DemoPerson & { x: number; y: number })[] = [
  { id: 'f', name: 'Valen', color: '#F97316', ink: INK, x: 210, y: 48 },
  { id: 'b', name: 'Bio', color: '#2DD4BF', ink: INK, x: 372, y: 150 },
  { id: 's', name: 'Bubub', color: '#FACC15', ink: INK, x: 210, y: 252 },
  { id: 'd', name: 'Anomali', color: '#FFF7ED', ink: INK, x: 48, y: 150 },
];

interface MultiBill {
  place: string;
  paidBy: string;
  servicePct: number;
  taxPct: number;
  items: { name: string; price: number; qty?: number; eaters: string[] }[];
}

const MULTI: MultiBill[] = [
  {
    place: 'Cafe A',
    paidBy: 'f',
    servicePct: 5,
    taxPct: 10,
    items: [
      { name: 'Latte', price: 38000, eaters: ['b'] },
      { name: 'Kopi susu', price: 28000, eaters: ['s'] },
      { name: 'Roti bakar', price: 35000, eaters: ['d'] },
      { name: 'Americano', price: 30000, eaters: ['f'] },
    ],
  },
  {
    place: 'Billiard',
    paidBy: 'b',
    servicePct: 0,
    taxPct: 10,
    items: [
      { name: 'Sewa meja 2 jam', price: 90000, eaters: ['f', 'b', 's', 'd'] },
      { name: 'Snack', price: 40000, eaters: ['s', 'd'] },
    ],
  },
  {
    place: 'Resto B',
    paidBy: 's',
    servicePct: 5,
    taxPct: 10,
    items: [
      { name: 'Nasi ayam', price: 45000, eaters: ['f'] },
      { name: 'Mie', price: 38000, eaters: ['b'] },
      { name: 'Sate', price: 52000, eaters: ['d'] },
      { name: 'Es jeruk ×2', price: 12000, qty: 2, eaters: ['s'] },
    ],
  },
];

export interface RawDebt {
  from: string;
  to: string;
  amount: number;
  bill: number;
}

const finalBills = MULTI.map((b, bi) => {
  const items: BillItem[] = b.items.map((it, i) => ({
    id: `${bi}-${i}`,
    name: it.name,
    unitPrice: it.price,
    qty: it.qty ?? 1,
    assignments: it.eaters.map((participantId) => ({ participantId, shares: 1 })),
  }));
  const sub = items.reduce((a, it) => a + it.unitPrice * it.qty, 0);
  const c = computeCharges(sub, { servicePct: b.servicePct, taxPct: b.taxPct });
  const r = computeBillShares({
    items,
    serviceAmount: c.serviceAmount,
    taxAmount: c.taxAmount,
    discountAmount: 0,
    roundingAmount: 0,
  });
  return { paidBy: b.paidBy, grandTotal: r.grandTotal, shares: r.shares, bill: bi };
});

/** Utang mentah: tiap orang berutang ke penalang di tiap tempat (sebelum disederhanakan). */
export const RAW_DEBTS: RawDebt[] = finalBills.flatMap((fb) =>
  fb.shares
    .filter((s) => s.participantId !== fb.paidBy && s.total > 0)
    .map((s) => ({ from: s.participantId, to: fb.paidBy, amount: s.total, bill: fb.bill })),
);

/** Setelah disederhanakan oleh settleUp (jumlah transfer minimum). */
export const SETTLED: Transfer[] = settleUp(
  balancesFromBills(finalBills, PEOPLE4.map((p) => p.id)),
);

export const MULTI_PLACES = MULTI.map((b) => b.place);
