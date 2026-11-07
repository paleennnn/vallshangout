import type { Id } from '@/lib/engine/split';

export interface Person {
  id: Id;
  name: string;
}

export interface Line {
  id: Id;
  name: string;
  price: number; // harga satuan (rupiah)
  qty: number;
  /** personId -> jumlah porsi (>0). Tidak ada kunci = tidak ikut makan. */
  eaters: Record<Id, number>;
}

export interface CalcState {
  title: string;
  people: Person[];
  items: Line[];
  paidBy: Id | null;
  /** Persen disimpan sebagai teks supaya "7," / "7." tidak hilang saat mengetik. */
  servicePct: string;
  taxPct: string;
  taxOnService: boolean;
  discount: number;
  rounding: number;
  /** Angka asli di struk; bila diisi, menggantikan hasil hitung dari persen. */
  serviceOverride: number | null;
  taxOverride: number | null;
}

export const STORAGE_KEY = 'vh:calc:v1';

export const emptyState: CalcState = {
  title: 'Nongkrong',
  people: [],
  items: [],
  paidBy: null,
  servicePct: '5',
  taxPct: '10',
  taxOnService: true,
  discount: 0,
  rounding: 0,
  serviceOverride: null,
  taxOverride: null,
};

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function exampleState(): CalcState {
  const febyan = { id: uid(), name: 'Febyan' };
  const budi = { id: uid(), name: 'Budi' };
  const siti = { id: uid(), name: 'Siti' };
  return {
    ...emptyState,
    title: 'Malming Cafe A',
    people: [febyan, budi, siti],
    paidBy: febyan.id,
    items: [
      { id: uid(), name: 'Steak', price: 50000, qty: 1, eaters: { [febyan.id]: 1 } },
      { id: uid(), name: 'Nasi goreng', price: 30000, qty: 1, eaters: { [budi.id]: 1 } },
      { id: uid(), name: 'Es teh', price: 10000, qty: 2, eaters: { [siti.id]: 2 } },
      { id: uid(), name: 'Kentang goreng (patungan)', price: 24000, qty: 1, eaters: { [febyan.id]: 1, [budi.id]: 1, [siti.id]: 1 } },
    ],
  };
}

/** Baca dari localStorage dengan validasi ringan; data rusak => null. */
export function loadState(): CalcState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<CalcState>;
    if (!s || !Array.isArray(s.people) || !Array.isArray(s.items)) return null;
    return { ...emptyState, ...s } as CalcState;
  } catch {
    return null;
  }
}

export function saveState(state: CalcState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* penyimpanan penuh / mode privat: abaikan */
  }
}

export function parsePct(text: string): number {
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
}
