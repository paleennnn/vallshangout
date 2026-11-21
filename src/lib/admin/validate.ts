export const TITLE_MAX = 60;
export const BODY_MAX = 140;
export const URL_MAX = 200;
export const DEFAULT_INACTIVE_DAYS = 14;

export type Audience = 'all' | 'inactive';

export interface CampaignInput {
  title: string;
  body: string;
  url: string;
  audience: Audience;
  /** Hanya untuk audiens "inactive". */
  days: number | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Membuang karakter kontrol (kecuali spasi biasa) dan merapikan spasi. */
const clean = (s: string) => s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();

/** Hanya jalur internal aplikasi; notifikasi tidak boleh mengarahkan ke situs lain. */
export function validateUrl(raw: unknown): Result<string> {
  const url = raw === undefined || raw === null || raw === '' ? '/' : raw;
  if (typeof url !== 'string') return { ok: false, error: 'Tautan tidak valid.' };
  if (url.length > URL_MAX) return { ok: false, error: `Tautan maksimal ${URL_MAX} karakter.` };
  if (!url.startsWith('/') || url.startsWith('//') || /[\\\s\u0000-\u001F]/.test(url)) {
    return { ok: false, error: 'Tautan harus berupa jalur di aplikasi ini, misalnya / atau /new.' };
  }
  return { ok: true, value: url };
}

export function validateMessage(input: { title?: unknown; body?: unknown; url?: unknown }): Result<{ title: string; body: string; url: string }> {
  if (typeof input.title !== 'string' || typeof input.body !== 'string') return { ok: false, error: 'Judul dan isi wajib diisi.' };
  const title = clean(input.title);
  const body = clean(input.body);
  if (!title) return { ok: false, error: 'Judul wajib diisi.' };
  if (title.length > TITLE_MAX) return { ok: false, error: `Judul maksimal ${TITLE_MAX} karakter.` };
  if (!body) return { ok: false, error: 'Isi pesan wajib diisi.' };
  if (body.length > BODY_MAX) return { ok: false, error: `Isi pesan maksimal ${BODY_MAX} karakter.` };
  const url = validateUrl(input.url);
  if (!url.ok) return url;
  return { ok: true, value: { title, body, url: url.value } };
}

export function validateAudience(audience: unknown, days: unknown): Result<{ audience: Audience; days: number | null }> {
  if (audience === 'all') return { ok: true, value: { audience, days: null } };
  if (audience !== 'inactive') return { ok: false, error: 'Audiens tidak dikenal.' };
  const n = days === undefined || days === null || days === '' ? DEFAULT_INACTIVE_DAYS : Number(days);
  if (!Number.isInteger(n) || n < 1 || n > 365) return { ok: false, error: 'Jumlah hari tidak aktif harus bilangan bulat 1 sampai 365.' };
  return { ok: true, value: { audience, days: n } };
}

export function validateCampaign(input: Record<string, unknown>): Result<CampaignInput> {
  const message = validateMessage(input);
  if (!message.ok) return message;
  const audience = validateAudience(input.audience, input.days);
  if (!audience.ok) return audience;
  return { ok: true, value: { ...message.value, ...audience.value } };
}

export const isUuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
