import { describe, expect, it } from 'vitest';
import { autoContrast, scaleToFit } from './preprocess';

describe('scaleToFit', () => {
  it('foto besar diperkecil mengikuti sisi terpanjang, rasio terjaga', () => {
    expect(scaleToFit(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200, scale: 0.4 });
    expect(scaleToFit(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600, scale: 0.4 });
  });

  it('foto yang sudah muat tidak diubah', () => {
    expect(scaleToFit(1000, 1400, 1600)).toEqual({ width: 1000, height: 1400, scale: 1 });
  });

  it('foto kecil diperbesar sampai batas bawah bila diminta', () => {
    expect(scaleToFit(400, 500, 1600, 1000)).toEqual({ width: 800, height: 1000, scale: 2 });
    expect(scaleToFit(400, 500, 1600)).toEqual({ width: 400, height: 500, scale: 1 });
  });

  it('ukuran tidak pernah nol', () => {
    expect(scaleToFit(1, 4000, 100).width).toBe(1);
  });
});

describe('autoContrast', () => {
  const px = (...vals: number[]) => new Uint8ClampedArray(vals.flatMap((v) => [v, v, v, 255]));

  it('meregangkan kontras struk pudar ke rentang penuh', () => {
    // abu-abu pudar 100..200 (bukan 0..255)
    const data = px(...Array.from({ length: 100 }, (_, i) => 100 + i));
    const { low, high } = autoContrast(data);
    expect(low).toBeGreaterThanOrEqual(100);
    expect(high).toBeLessThanOrEqual(199);
    const grays = Array.from({ length: 100 }, (_, i) => data[i * 4]);
    expect(Math.min(...grays)).toBe(0);
    expect(Math.max(...grays)).toBe(255);
  });

  it('hasilnya abu-abu (R=G=B) dan alfa tidak berubah', () => {
    const data = new Uint8ClampedArray([200, 50, 10, 77, 10, 10, 250, 77]);
    autoContrast(data);
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
    expect(data[3]).toBe(77);
    expect(data[7]).toBe(77);
  });

  it('gambar satu warna tidak menghasilkan pembagian nol', () => {
    const data = px(...Array.from({ length: 50 }, () => 128));
    expect(() => autoContrast(data)).not.toThrow();
    expect(Array.from(data).every((v) => Number.isFinite(v))).toBe(true);
  });
});
