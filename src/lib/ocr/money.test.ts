import { describe, expect, it } from 'vitest';
import { normalizeNumberText, parseAmount, trailingAmount } from './money';

describe('parseAmount', () => {
  it('format rupiah umum', () => {
    expect(parseAmount('36.000')).toBe(36000);
    expect(parseAmount('36,000')).toBe(36000);
    expect(parseAmount('1.234.567')).toBe(1234567);
    expect(parseAmount('5000')).toBe(5000);
    expect(parseAmount('Rp 36.000')).toBe(36000);
    expect(parseAmount('Rp.36.000')).toBe(36000);
    expect(parseAmount('IDR 12.500')).toBe(12500);
  });

  it('sen ",00" dibuang hanya pada angka yang jelas rupiah', () => {
    expect(parseAmount('36.000,00')).toBe(36000);
    expect(parseAmount('36,000.00')).toBe(36000);
    expect(parseAmount('15000.00')).toBe(15000);
    expect(parseAmount('1.00')).toBeNull();
  });

  it('angka negatif: tanda minus dan tanda kurung', () => {
    expect(parseAmount('-80')).toBe(-80);
    expect(parseAmount('(80)')).toBe(-80);
    expect(parseAmount('-1.500')).toBe(-1500);
  });

  it('salah baca huruf mirip angka diperbaiki', () => {
    expect(parseAmount('3O.OOO')).toBe(30000);
    expect(parseAmount('1l.500')).toBe(11500);
    expect(parseAmount('S.000')).toBe(5000);
  });

  it('sisa tanda baca di ujung diabaikan', () => {
    expect(parseAmount('27.500.')).toBe(27500);
    expect(parseAmount('8.000:')).toBe(8000);
  });

  it('bukan angka rupiah yang masuk akal menghasilkan null', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12.34')).toBeNull();
    expect(parseAmount('1.2345')).toBeNull();
    expect(parseAmount('12345678901')).toBeNull(); // terlalu panjang: nomor telepon atau ID
  });
});

describe('normalizeNumberText', () => {
  it('menyatukan angka yang terpecah spasi atau berpemisah titik dua', () => {
    expect(normalizeNumberText('PB1 10: 080.')).toBe('PB1 10.080.');
    expect(normalizeNumberText('Service 4:800')).toBe('Service 4.800');
    expect(normalizeNumberText('Total 110. 800')).toBe('Total 110.800');
  });

  it('jam tidak dianggap angka', () => {
    expect(normalizeNumberText('01/11/2026 19:42')).toBe('01/11/2026 19:42');
  });
});

describe('trailingAmount', () => {
  it('mengambil angka paling kanan beserta posisinya', () => {
    const t = 'Croissant Butter   28.000';
    const r = trailingAmount(t)!;
    expect(r.amount).toBe(28000);
    expect(t.slice(0, r.index).trim()).toBe('Croissant Butter');
  });

  it('baris berakhir persen atau teks bukan angka', () => {
    expect(trailingAmount('Service 5%')).toBeNull();
    expect(trailingAmount('Terima kasih')).toBeNull();
  });

  it('jam atau tanggal di ujung bukan angka', () => {
    expect(trailingAmount('01/11/2026 19:42')).toBeNull();
  });

  it('angka negatif dan sisa titik di ujung', () => {
    expect(trailingAmount('Pembulatan  -80')!.amount).toBe(-80);
    expect(trailingAmount('Gulai Otak  27.500.')!.amount).toBe(27500);
  });
});
