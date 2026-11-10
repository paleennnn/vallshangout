import type { CalcState } from './state';

const PCT = /^\d{1,3}(\.\d{1,2})?$/;

/**
 * Nilai kalkulator dari parameter URL (dipakai tombol "Hitung patungan di sini" di room):
 *   ?title=Cafe%20A&service=5&tax=10&onservice=1
 * Hanya nilai yang valid yang dipakai; parameter lain atau rusak diabaikan. null bila tidak ada yang valid.
 */
export function patchFromParams(params: URLSearchParams): Partial<CalcState> | null {
  const patch: Partial<CalcState> = {};

  const title = params.get('title')?.trim().slice(0, 60);
  if (title) patch.title = title;

  for (const [key, field] of [
    ['service', 'servicePct'],
    ['tax', 'taxPct'],
  ] as const) {
    const raw = params.get(key)?.trim();
    if (raw && PCT.test(raw) && Number(raw) <= 100) patch[field] = raw;
  }

  const onService = params.get('onservice');
  if (onService === '1' || onService === '0') patch.taxOnService = onService === '1';

  if (Object.keys(patch).length === 0) return null;
  // angka dari tempat baru menggantikan angka struk yang mungkin terisi sebelumnya
  return { ...patch, serviceOverride: null, taxOverride: null };
}
