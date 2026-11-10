import { describe, expect, it } from 'vitest';
import { patchFromParams } from './params';

const q = (s: string) => new URLSearchParams(s);

describe('patchFromParams', () => {
  it('membaca judul, service, pajak, dan dasar pajak', () => {
    expect(patchFromParams(q('title=Cafe%20A&service=5&tax=10&onservice=1'))).toEqual({
      title: 'Cafe A',
      servicePct: '5',
      taxPct: '10',
      taxOnService: true,
      serviceOverride: null,
      taxOverride: null,
    });
    expect(patchFromParams(q('tax=7.5&onservice=0'))).toMatchObject({ taxPct: '7.5', taxOnService: false });
  });

  it('nilai rusak atau di luar rentang diabaikan satu per satu', () => {
    expect(patchFromParams(q('service=abc&tax=150&onservice=ya'))).toBeNull();
    expect(patchFromParams(q('service=5.555&tax=10'))).toMatchObject({ taxPct: '10' });
    expect(patchFromParams(q('service=5.555&tax=10'))).not.toHaveProperty('servicePct');
  });

  it('tanpa parameter yang dikenal menghasilkan null', () => {
    expect(patchFromParams(q(''))).toBeNull();
    expect(patchFromParams(q('foo=bar'))).toBeNull();
    expect(patchFromParams(q('title=%20%20'))).toBeNull();
  });

  it('judul dipotong 60 karakter dan tidak mengeksekusi apa pun (hanya teks)', () => {
    const r = patchFromParams(q(`title=${'x'.repeat(100)}`));
    expect(r?.title).toHaveLength(60);
    expect(patchFromParams(q('title=%3Cscript%3Ealert(1)%3C%2Fscript%3E'))?.title).toBe('<script>alert(1)</script>');
  });
});
