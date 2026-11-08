import { describe, expect, it } from 'vitest';
import { randomInt } from './random';

describe('randomInt', () => {
  it('selalu di dalam rentang dan n = 1 selalu 0', () => {
    for (let i = 0; i < 500; i++) {
      const v = randomInt(7);
      expect(Number.isInteger(v) && v >= 0 && v < 7).toBe(true);
    }
    expect(randomInt(1)).toBe(0);
  });

  it('seragam: tiap nilai muncul sekitar 1/n kali (n = 7, 7000 undian)', () => {
    const counts = new Array<number>(7).fill(0);
    for (let i = 0; i < 7000; i++) counts[randomInt(7)]++;
    // harapan 1000, simpangan baku sekitar 29: batas 800..1200 sangat longgar
    counts.forEach((c) => {
      expect(c).toBeGreaterThan(800);
      expect(c).toBeLessThan(1200);
    });
  });

  it('menolak n tidak valid', () => {
    expect(() => randomInt(0)).toThrowError(RangeError);
    expect(() => randomInt(-3)).toThrowError(RangeError);
    expect(() => randomInt(2.5)).toThrowError(RangeError);
  });
});

import { pickWeighted, randomFloat } from './random';

describe('randomFloat dan pickWeighted', () => {
  it('randomFloat selalu di [0, 1)', () => {
    for (let i = 0; i < 2000; i++) {
      const x = randomFloat();
      expect(x >= 0 && x < 1).toBe(true);
    }
  });

  it('pickWeighted mengikuti bobot (3:1 sekitar 75% banding 25%)', () => {
    let first = 0;
    for (let i = 0; i < 8000; i++) if (pickWeighted([3, 1]) === 0) first++;
    // harapan 6000, simpangan baku sekitar 39: batas 5600..6400 sangat longgar
    expect(first).toBeGreaterThan(5600);
    expect(first).toBeLessThan(6400);
  });

  it('bobot sangat kecil tetap bisa terpilih, tapi jarang', () => {
    let rare = 0;
    for (let i = 0; i < 20000; i++) if (pickWeighted([99, 1]) === 1) rare++;
    expect(rare).toBeGreaterThan(100);
    expect(rare).toBeLessThan(320);
  });

  it('menolak bobot tidak valid', () => {
    expect(() => pickWeighted([])).toThrowError(RangeError);
    expect(() => pickWeighted([1, 0])).toThrowError(RangeError);
    expect(() => pickWeighted([1, -2])).toThrowError(RangeError);
    expect(() => pickWeighted([1, Number.NaN])).toThrowError(RangeError);
  });
});
