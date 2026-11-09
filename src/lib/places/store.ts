import type { PlaceStat } from '@/lib/engine/spin';
import { uid } from '@/lib/uid';
import { isCategory } from './categories';

export interface Place {
  id: string;
  name: string;
  categorySlug: string;
  servicePct: number;
  taxPct: number;
  /** true: pajak dihitung dari (subtotal + service). */
  taxOnService: boolean;
  /** Sewa per jam (rupiah), untuk tempat game/olahraga. */
  hourlyRate: number | null;
  mapsUrl: string | null;
  notes: string;
  visits: number;
  lastVisitedAt: number | null;
  createdAt: number;
}

export type PlaceInput = Pick<
  Place,
  'name' | 'categorySlug' | 'servicePct' | 'taxPct' | 'taxOnService' | 'hourlyRate' | 'mapsUrl' | 'notes'
>;

/** Nilai mentah dari formulir (angka persen masih teks supaya "7," tidak hilang saat mengetik). */
export interface PlaceFormValues {
  name: string;
  categorySlug: string;
  servicePct: string;
  taxPct: string;
  taxOnService: boolean;
  hourlyRate: number | null;
  mapsUrl: string;
  notes: string;
}

export type PlaceErrors = Partial<Record<'name' | 'categorySlug' | 'servicePct' | 'taxPct' | 'mapsUrl' | 'notes', string>>;

export const PLACES_KEY = 'vh:places:v1';
export const MAX_PLACES = 200;

const DAY = 86_400_000;

// validasi formulir
function parsePct(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}

function parseUrl(text: string): string | null | false {
  const t = text.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : false;
  } catch {
    return false;
  }
}

export function validatePlace(
  v: PlaceFormValues,
): { ok: true; value: PlaceInput } | { ok: false; errors: PlaceErrors } {
  const errors: PlaceErrors = {};
  const name = v.name.trim();
  if (!name) errors.name = 'Nama tempat wajib diisi.';
  else if (name.length > 80) errors.name = 'Maksimal 80 karakter.';
  if (!isCategory(v.categorySlug)) errors.categorySlug = 'Pilih kategori.';

  const service = parsePct(v.servicePct);
  if (service === null) errors.servicePct = 'Isi angka 0 sampai 100.';
  const tax = parsePct(v.taxPct);
  if (tax === null) errors.taxPct = 'Isi angka 0 sampai 100.';

  const url = parseUrl(v.mapsUrl);
  if (url === false) errors.mapsUrl = 'Tautan harus diawali https://';
  if (v.notes.length > 200) errors.notes = 'Maksimal 200 karakter.';
  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      categorySlug: v.categorySlug,
      servicePct: service as number,
      taxPct: tax as number,
      taxOnService: v.taxOnService,
      hourlyRate: v.hourlyRate && v.hourlyRate > 0 ? v.hourlyRate : null,
      mapsUrl: url as string | null,
      notes: v.notes.trim(),
    },
  };
}

export function createPlace(input: PlaceInput, now = Date.now()): Place {
  return { ...input, id: uid(), visits: 0, lastVisitedAt: null, createdAt: now };
}

export const updatePlace = (place: Place, input: PlaceInput): Place => ({ ...place, ...input });

export const recordVisit = (place: Place, now = Date.now()): Place => ({
  ...place,
  visits: place.visits + 1,
  lastVisitedAt: now,
});

// penyimpanan lokal
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function isPlace(x: unknown): x is Place {
  const p = x as Partial<Place> | null;
  return (
    !!p &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    p.name.length > 0 &&
    typeof p.categorySlug === 'string' &&
    num(p.servicePct) &&
    p.servicePct >= 0 &&
    p.servicePct <= 100 &&
    num(p.taxPct) &&
    p.taxPct >= 0 &&
    p.taxPct <= 100 &&
    typeof p.taxOnService === 'boolean' &&
    (p.hourlyRate === null || num(p.hourlyRate)) &&
    (p.mapsUrl === null || typeof p.mapsUrl === 'string') &&
    typeof p.notes === 'string' &&
    num(p.visits) &&
    p.visits >= 0 &&
    (p.lastVisitedAt === null || num(p.lastVisitedAt)) &&
    num(p.createdAt)
  );
}

/** Data rusak atau dari versi lain tidak boleh merusak halaman: item tidak valid dibuang. */
export function parsePlaces(raw: string | null): Place[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isPlace).slice(0, MAX_PLACES) : [];
  } catch {
    return [];
  }
}

export function loadPlaces(): Place[] {
  try {
    return parsePlaces(localStorage.getItem(PLACES_KEY));
  } catch {
    return [];
  }
}

export function savePlaces(places: Place[]) {
  try {
    localStorage.setItem(PLACES_KEY, JSON.stringify(places));
  } catch {
    /* penyimpanan penuh atau mode privat */
  }
}

// turunan
export function toSpinStats(places: Place[]): PlaceStat[] {
  return places.map((p) => ({
    placeId: p.id,
    visitCount: p.visits,
    lastVisitedAt: p.lastVisitedAt === null ? null : new Date(p.lastVisitedAt).toISOString(),
  }));
}

export function visitLabel(place: Place, now = Date.now()): string {
  if (place.visits === 0 || place.lastVisitedAt === null) return 'Belum pernah dikunjungi';
  const days = Math.max(0, Math.floor((now - place.lastVisitedAt) / DAY));
  const ago =
    days === 0 ? 'hari ini' : days === 1 ? 'kemarin' : days < 14 ? `${days} hari lalu` : days < 60 ? `${Math.floor(days / 7)} minggu lalu` : `${Math.floor(days / 30)} bulan lalu`;
  return `${place.visits} kali, terakhir ${ago}`;
}

export const SAMPLE_PLACES: PlaceInput[] = [
  { name: 'Cafe A', categorySlug: 'cafe', servicePct: 5, taxPct: 10, taxOnService: true, hourlyRate: null, mapsUrl: null, notes: '' },
  { name: 'Billiard 88', categorySlug: 'billiard', servicePct: 0, taxPct: 10, taxOnService: false, hourlyRate: 45000, mapsUrl: null, notes: '' },
  { name: 'Warung Mie', categorySlug: 'resto', servicePct: 0, taxPct: 10, taxOnService: false, hourlyRate: null, mapsUrl: null, notes: '' },
];
