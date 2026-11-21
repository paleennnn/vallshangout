import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Sesi admin tanpa akun: satu kata sandi di ADMIN_PASSWORD (server saja). Setelah masuk, browser
 * menerima cookie httpOnly berisi masa berlaku dan tanda tangan HMAC. Mengganti kata sandi
 * otomatis mematikan semua sesi yang sedang berjalan.
 */

export const SESSION_COOKIE = 'admin_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
/** Kata sandi lebih pendek dari ini dianggap belum dikonfigurasi (admin ditutup). */
export const MIN_PASSWORD_LENGTH = 12;

const password = () => process.env.ADMIN_PASSWORD ?? '';

export const adminConfigured = () => password().length >= MIN_PASSWORD_LENGTH;

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Perbandingan waktu-konstan; kedua sisi di-hash dulu agar panjang tidak bocor. */
export function passwordMatches(candidate: unknown): boolean {
  if (!adminConfigured() || typeof candidate !== 'string') return false;
  return timingSafeEqual(digest(candidate), digest(password()));
}

const sign = (payload: string) => createHmac('sha256', createHmac('sha256', password()).update('valls-admin-session-v1').digest()).update(payload).digest('base64url');

/** Token `<kedaluwarsa dalam detik>.<tanda tangan>`. */
export function createSessionToken(nowMs = Date.now()): string {
  const exp = String(Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined | null, nowMs = Date.now()): boolean {
  if (!adminConfigured() || !token) return false;
  const [exp, sig, ...rest] = token.split('.');
  if (!exp || !sig || rest.length > 0 || !/^\d{9,12}$/.test(exp)) return false;
  const expected = Buffer.from(sign(exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(exp) > Math.floor(nowMs / 1000);
}

/** Nilai satu cookie dari header Cookie. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function sessionCookieHeader(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

export function clearSessionCookieHeader(secure: boolean): string {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}
