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
