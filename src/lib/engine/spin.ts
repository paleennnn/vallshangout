/**
 * VallsHangout: bobot spin wheel.
 *
 * Tujuan: tempat yang lama tidak dikunjungi peluangnya naik, yang baru didatangi turun,
 * tempat yang belum pernah dikunjungi dapat bonus. Hasil akhirnya tetap diundi di SERVER
 * lewat rpc('do_spin'); fungsi di sini hanya menyiapkan `p_options`.
 */
import type { Id } from './split';

/** Batas jumlah opsi yang diterima do_spin() di database. */
export const MAX_SPIN_OPTIONS = 50;

export interface PlaceLite {
  id: Id;
  name: string;
}

/** Satu baris dari view `place_stats` (camelCase). */
export interface PlaceStat {
  placeId: Id;
  visitCount: number;
  lastVisitedAt: string | null;
}

/** Bentuk yang dimengerti do_spin(): [{ label, weight, ref_id }] */
export interface SpinOption {
  label: string;
  weight: number;
  ref_id: Id;
}

export interface SpinWeightConfig {
  /** Bobot minimum untuk tempat yang baru saja dikunjungi, 0 < x <= 1 (default 0.25). */
  minWeight?: number;
  /** Berapa hari sampai bobot kembali penuh (1.0) (default 30). */
  coolDownDays?: number;
  /** Bobot tempat yang belum pernah dikunjungi (default 1.5). */
  neverVisitedWeight?: number;
  /** Tempat yang dikeluarkan dari undian (mis. kena veto). */
  excludeIds?: Id[];
}

const DAY_MS = 86_400_000;

export function buildSpinOptions(
  places: PlaceLite[],
  stats: PlaceStat[],
  now: Date = new Date(),
  cfg: SpinWeightConfig = {},
): SpinOption[] {
  const { minWeight = 0.25, coolDownDays = 30, neverVisitedWeight = 1.5 } = cfg;
  if (!(minWeight > 0 && minWeight <= 1)) throw new RangeError('minWeight harus 0 < x <= 1');
  if (!(coolDownDays > 0)) throw new RangeError('coolDownDays harus > 0');
  if (!(neverVisitedWeight > 0)) throw new RangeError('neverVisitedWeight harus > 0');

  const exclude = new Set(cfg.excludeIds ?? []);
  const lastVisit = new Map(stats.map((s) => [s.placeId, s.lastVisitedAt]));

  const options = places
    .filter((p) => !exclude.has(p.id))
    .map((p): SpinOption => {
      const iso = lastVisit.get(p.id);
      let weight: number;
      if (!iso) {
        weight = neverVisitedWeight;
      } else {
        const days = Math.max(0, (now.getTime() - new Date(iso).getTime()) / DAY_MS);
        const recency = Math.min(1, days / coolDownDays);
        weight = minWeight + (1 - minWeight) * recency;
      }
      return { label: p.name, weight: Math.max(0.01, Math.round(weight * 100) / 100), ref_id: p.id };
    });

  if (options.length <= MAX_SPIN_OPTIONS) return options;

  // Terlalu banyak: ambil yang bobotnya tertinggi, urutan asli dipertahankan.
  const keep = new Set(
    [...options]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_SPIN_OPTIONS)
      .map((o) => o.ref_id),
  );
  return options.filter((o) => keep.has(o.ref_id));
}

/** Peluang menang tiap slice (0..1), untuk label persen di wheel. */
export function winProbabilities(options: { weight: number }[]): number[] {
  const total = options.reduce((acc, o) => acc + o.weight, 0);
  return options.map((o) => (total > 0 ? o.weight / total : 0));
}
