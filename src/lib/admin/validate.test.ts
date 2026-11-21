import { describe, expect, it } from 'vitest';
import { isUuid, validateAudience, validateCampaign, validateMessage, validateUrl } from './validate';

const ok = { title: 'Yuk nongkrong', body: 'Udah lama ga ketemu, yuk cuss pakai Valls', url: '/', audience: 'all' };

describe('validateMessage', () => {
  it('judul dan isi dirapikan: spasi ganda, karakter kontrol, dan tepi dibuang', () => {
    const r = validateMessage({ title: '  Yuk \n nongkrong\t!  ', body: 'a\u0000b   c', url: '/' });
    expect(r).toEqual({ ok: true, value: { title: 'Yuk nongkrong !', body: 'a b c', url: '/' } });
  });

  it('batas panjang: judul 60, isi 140 (setelah dirapikan)', () => {
    expect(validateMessage({ title: 'x'.repeat(60), body: 'b' }).ok).toBe(true);
    expect(validateMessage({ title: 'x'.repeat(61), body: 'b' })).toMatchObject({ ok: false, error: expect.stringMatching(/Judul maksimal 60/) });
    expect(validateMessage({ title: 't', body: 'x'.repeat(140) }).ok).toBe(true);
    expect(validateMessage({ title: 't', body: 'x'.repeat(141) })).toMatchObject({ ok: false, error: expect.stringMatching(/Isi pesan maksimal 140/) });
  });

  it('kosong atau bukan teks ditolak', () => {
    expect(validateMessage({ title: '   ', body: 'b' })).toMatchObject({ ok: false });
    expect(validateMessage({ title: 't', body: '\n\t ' })).toMatchObject({ ok: false });
    expect(validateMessage({ title: 123, body: 'b' })).toMatchObject({ ok: false });
    expect(validateMessage({})).toMatchObject({ ok: false });
  });

  it('emoji dan huruf non-Latin tetap diizinkan', () => {
    expect(validateMessage({ title: 'Kangen kalian', body: 'Yuk kumpul, makan bareng' }).ok).toBe(true);
  });
});

describe('validateUrl', () => {
  it('kosong atau tidak diisi berarti beranda', () => {
    expect(validateUrl(undefined)).toEqual({ ok: true, value: '/' });
    expect(validateUrl('')).toEqual({ ok: true, value: '/' });
  });

  it('jalur internal diterima', () => {
    expect(validateUrl('/new')).toEqual({ ok: true, value: '/new' });
    expect(validateUrl('/h/ABCD2345?x=1#a')).toMatchObject({ ok: true });
  });

  it('situs lain, protokol lain, dan akal-akalan ditolak', () => {
    for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '\\evil', '/a b', '/\\evil.example', 'new', '/a\nb', `/${'x'.repeat(200)}`, 42]) {
      expect(validateUrl(bad).ok).toBe(false);
    }
  });
});

describe('validateAudience', () => {
  it('semua: tanpa hari', () => {
    expect(validateAudience('all', 30)).toEqual({ ok: true, value: { audience: 'all', days: null } });
  });

  it('tidak aktif: hari bawaan 14, batas 1 sampai 365, harus bulat', () => {
    expect(validateAudience('inactive', undefined)).toEqual({ ok: true, value: { audience: 'inactive', days: 14 } });
    expect(validateAudience('inactive', '30')).toEqual({ ok: true, value: { audience: 'inactive', days: 30 } });
    for (const bad of [0, 366, 1.5, 'abc', -3]) expect(validateAudience('inactive', bad).ok).toBe(false);
  });

  it('audiens lain ditolak', () => {
    expect(validateAudience('semua', null).ok).toBe(false);
    expect(validateAudience(undefined, null).ok).toBe(false);
  });
});

describe('validateCampaign', () => {
  it('menggabungkan pesan dan audiens', () => {
    expect(validateCampaign({ ...ok, audience: 'inactive', days: 21 })).toEqual({
      ok: true,
      value: { title: 'Yuk nongkrong', body: 'Udah lama ga ketemu, yuk cuss pakai Valls', url: '/', audience: 'inactive', days: 21 },
    });
  });

  it('galat pertama yang ditemukan dikembalikan', () => {
    expect(validateCampaign({ ...ok, title: '' })).toMatchObject({ ok: false });
    expect(validateCampaign({ ...ok, url: 'https://x.y' })).toMatchObject({ ok: false });
    expect(validateCampaign({ ...ok, audience: 'x' })).toMatchObject({ ok: false });
  });
});

describe('isUuid', () => {
  it('mengenali uuid yang sah saja', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isUuid('bukan-uuid')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("11111111-1111-4111-8111-111111111111'; drop table x;--")).toBe(false);
  });
});
