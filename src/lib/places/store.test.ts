import { describe, expect, it } from 'vitest';
import { buildSpinOptions } from '@/lib/engine/spin';
import { categoryOf, rootSlug, usesHourlyRate } from './categories';
import {
  PLACES_KEY,
  SAMPLE_PLACES,
  createPlace,
  parsePlaces,
  recordVisit,
  toSpinStats,
  validatePlace,
  visitLabel,
  type PlaceFormValues,
} from './store';

const form = (over: Partial<PlaceFormValues> = {}): PlaceFormValues => ({
  name: 'Cafe A',
  categorySlug: 'cafe',
  servicePct: '5',
  taxPct: '10',
  taxOnService: true,
  hourlyRate: null,
  mapsUrl: '',
  notes: '',
  ...over,
});

describe('validatePlace', () => {
  it('menerima isian normal dan merapikan nilainya', () => {
    const r = validatePlace(form({ name: '  Cafe A  ', servicePct: '7,5', hourlyRate: 45000, mapsUrl: ' https://maps.app.goo.gl/x ', notes: ' enak ' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({ name: 'Cafe A', servicePct: 7.5, taxPct: 10, hourlyRate: 45000, notes: 'enak' });
      expect(r.value.mapsUrl).toBe('https://maps.app.goo.gl/x');
    }
  });

  it('persen kosong dianggap 0; sewa 0 atau kosong menjadi null', () => {
    const r = validatePlace(form({ servicePct: '', taxPct: '  ', hourlyRate: 0 }));
    expect(r.ok && r.value.servicePct === 0 && r.value.taxPct === 0 && r.value.hourlyRate === null).toBe(true);
  });

  it('menolak nama kosong, persen di luar 0..100 atau bukan angka, kategori asing, dan tautan non-http', () => {
    const r = validatePlace(form({ name: '   ', servicePct: '150', taxPct: 'abc', categorySlug: 'xx', mapsUrl: 'javascript:alert(1)' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['categorySlug', 'mapsUrl', 'name', 'servicePct', 'taxPct']);
  });

  it('persen lebih dari 2 desimal ditolak', () => {
    expect(validatePlace(form({ servicePct: '5.555' })).ok).toBe(false);
    expect(validatePlace(form({ servicePct: '5.55' })).ok).toBe(true);
  });
});

describe('parsePlaces (data dari localStorage)', () => {
  const good = createPlace(SAMPLE_PLACES[0], 1000);

  it('membaca data valid bolak-balik', () => {
    expect(parsePlaces(JSON.stringify([good]))).toEqual([good]);
  });

  it('data rusak atau null menghasilkan daftar kosong, bukan error', () => {
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces('bukan json')).toEqual([]);
    expect(parsePlaces('{"a":1}')).toEqual([]);
  });

  it('membuang item tidak valid tetapi mempertahankan yang valid', () => {
    const bad = [{ ...good, id: 'x', taxPct: 999 }, { ...good, id: 'y', name: '' }, { id: 'z' }, null, 5];
    expect(parsePlaces(JSON.stringify([bad[0], good, bad[1], bad[2], bad[3], bad[4]]))).toEqual([good]);
  });

  it('kunci penyimpanan stabil (dipakai kalkulator dan halaman Tempat)', () => {
    expect(PLACES_KEY).toBe('vh:places:v1');
  });
});

describe('kunjungan dan roda adil', () => {
  const DAY = 86_400_000;
  const now = new Date('2026-11-08T10:00:00Z').getTime();

  it('recordVisit menambah hitungan dan mencatat waktu tanpa mengubah objek lama', () => {
    const p = createPlace(SAMPLE_PLACES[0], now);
    const v = recordVisit(p, now);
    expect(p.visits).toBe(0);
    expect(v).toMatchObject({ visits: 1, lastVisitedAt: now });
  });

  it('visitLabel berbahasa Indonesia dan bertingkat', () => {
    const base = createPlace(SAMPLE_PLACES[0], now);
    const at = (days: number, visits = 3) => ({ ...base, visits, lastVisitedAt: now - days * DAY });
    expect(visitLabel(base, now)).toBe('Belum pernah dikunjungi');
    expect(visitLabel(at(0), now)).toBe('3 kali, terakhir hari ini');
    expect(visitLabel(at(1), now)).toBe('3 kali, terakhir kemarin');
    expect(visitLabel(at(6), now)).toBe('3 kali, terakhir 6 hari lalu');
    expect(visitLabel(at(21), now)).toBe('3 kali, terakhir 3 minggu lalu');
    expect(visitLabel(at(95), now)).toBe('3 kali, terakhir 3 bulan lalu');
  });

  it('tempat yang lama tidak dikunjungi mendapat bobot lebih besar daripada yang baru didatangi', () => {
    const [a, b, c] = SAMPLE_PLACES.map((s) => createPlace(s, now - 100 * DAY));
    const places = [
      { ...a, visits: 4, lastVisitedAt: now - 1 * DAY }, // baru kemarin
      { ...b, visits: 2, lastVisitedAt: now - 60 * DAY }, // sudah lama
      c, // belum pernah
    ];
    const opts = buildSpinOptions(places.map((p) => ({ id: p.id, name: p.name })), toSpinStats(places), new Date(now), { minWeight: 0.4 });
    const w = Object.fromEntries(opts.map((o) => [o.label, o.weight]));
    expect(w['Cafe A']).toBeLessThan(w['Billiard 88']);
    expect(w['Billiard 88']).toBeLessThan(w['Warung Mie']);
    expect(w['Cafe A']).toBeGreaterThanOrEqual(0.4);
  });
});

describe('kategori', () => {
  it('anak mewarisi induk untuk filter dan sewa per jam', () => {
    expect(rootSlug('billiard')).toBe('game');
    expect(rootSlug('cafe')).toBe('cafe');
    expect(usesHourlyRate('billiard')).toBe(true);
    expect(usesHourlyRate('futsal')).toBe(true);
    expect(usesHourlyRate('cafe')).toBe(false);
    expect(categoryOf('tidak-ada').name).toBe('Lainnya');
  });
});
