import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  adminConfigured,
  clearSessionCookieHeader,
  createSessionToken,
  passwordMatches,
  readCookie,
  sessionCookieHeader,
  verifySessionToken,
} from './session';

const PASSWORD = 'kata-sandi-admin-yang-panjang';
const NOW = Date.UTC(2026, 10, 15, 8, 0, 0);

beforeEach(() => {
  process.env.ADMIN_PASSWORD = PASSWORD;
});
afterEach(() => {
  delete process.env.ADMIN_PASSWORD;
});

describe('adminConfigured', () => {
  it('hanya bila kata sandi ada dan minimal 12 karakter', () => {
    expect(adminConfigured()).toBe(true);
    process.env.ADMIN_PASSWORD = 'pendek';
    expect(adminConfigured()).toBe(false);
    process.env.ADMIN_PASSWORD = '12345678901';
    expect(adminConfigured()).toBe(false);
    process.env.ADMIN_PASSWORD = '123456789012';
    expect(adminConfigured()).toBe(true);
    delete process.env.ADMIN_PASSWORD;
    expect(adminConfigured()).toBe(false);
  });
});

describe('passwordMatches', () => {
  it('cocok hanya untuk kata sandi yang persis sama', () => {
    expect(passwordMatches(PASSWORD)).toBe(true);
    expect(passwordMatches(`${PASSWORD} `)).toBe(false);
    expect(passwordMatches(PASSWORD.toUpperCase())).toBe(false);
    expect(passwordMatches('')).toBe(false);
  });

  it('bukan string atau admin belum dikonfigurasi: selalu salah', () => {
    expect(passwordMatches(undefined)).toBe(false);
    expect(passwordMatches(null)).toBe(false);
    expect(passwordMatches(12345)).toBe(false);
    process.env.ADMIN_PASSWORD = 'pendek';
    expect(passwordMatches('pendek')).toBe(false); // kata sandi terlalu pendek tidak boleh membuka admin
  });
});

describe('token sesi', () => {
  it('token yang baru dibuat valid sampai masa berlakunya habis', () => {
    const token = createSessionToken(NOW);
    expect(verifySessionToken(token, NOW)).toBe(true);
    expect(verifySessionToken(token, NOW + (SESSION_TTL_SECONDS - 1) * 1000)).toBe(true);
    expect(verifySessionToken(token, NOW + SESSION_TTL_SECONDS * 1000)).toBe(false);
    expect(verifySessionToken(token, NOW + SESSION_TTL_SECONDS * 1000 + 60_000)).toBe(false);
  });

  it('masa berlaku diubah (diperpanjang) membuat tanda tangan tidak cocok', () => {
    const [exp, sig] = createSessionToken(NOW).split('.');
    const forged = `${Number(exp) + 86400 * 365}.${sig}`;
    expect(verifySessionToken(forged, NOW)).toBe(false);
  });

  it('tanda tangan dari kata sandi lain ditolak, dan ganti kata sandi mematikan sesi lama', () => {
    const token = createSessionToken(NOW);
    process.env.ADMIN_PASSWORD = 'kata-sandi-baru-yang-panjang';
    expect(verifySessionToken(token, NOW)).toBe(false);
  });

  it('token rusak, kosong, atau berbentuk aneh ditolak', () => {
    for (const bad of [undefined, null, '', 'abc', '.', 'a.b.c', '123.', '.abc', `${Math.floor(NOW / 1000) + 100}.${'x'.repeat(43)}`, '1e9.sig']) {
      expect(verifySessionToken(bad, NOW)).toBe(false);
    }
  });

  it('tanpa konfigurasi admin, token apa pun ditolak', () => {
    const token = createSessionToken(NOW);
    delete process.env.ADMIN_PASSWORD;
    expect(verifySessionToken(token, NOW)).toBe(false);
  });
});

describe('cookie', () => {
  it('membaca satu cookie di antara beberapa', () => {
    const header = `a=1; ${SESSION_COOKIE}=abc.def; b=2`;
    expect(readCookie(header, SESSION_COOKIE)).toBe('abc.def');
    expect(readCookie(header, 'b')).toBe('2');
    expect(readCookie(header, 'tidak-ada')).toBeUndefined();
    expect(readCookie(null, 'a')).toBeUndefined();
    expect(readCookie('', 'a')).toBeUndefined();
  });

  it('cookie sesi: httpOnly, SameSite=Strict, berlaku 8 jam, Secure di produksi', () => {
    const prod = sessionCookieHeader('tok', true);
    expect(prod).toContain(`${SESSION_COOKIE}=tok`);
    expect(prod).toContain('HttpOnly');
    expect(prod).toContain('SameSite=Strict');
    expect(prod).toContain('Secure');
    expect(prod).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    expect(prod).toContain('Path=/');
    expect(sessionCookieHeader('tok', false)).not.toContain('Secure');
  });

  it('cookie penghapus langsung kedaluwarsa', () => {
    const header = clearSessionCookieHeader(true);
    expect(header).toContain(`${SESSION_COOKIE}=;`);
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('HttpOnly');
  });
});
