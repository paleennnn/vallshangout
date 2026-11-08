/**
 * Bilangan bulat acak seragam di [0, n) dari CSPRNG, dengan rejection sampling
 * (tanpa modulo bias). Dipakai untuk roda putar di sisi klien; di room, hasil undian
 * resmi tetap diundi di server lewat rpc('do_spin').
 */
export function randomInt(n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) {
    throw new RangeError('n harus bilangan bulat 1..2^32');
  }
  if (n === 1) return 0;
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % n;
}

/** Bilangan acak seragam di [0, 1) dengan presisi 53 bit dari CSPRNG. */
export function randomFloat(): number {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53;
}

/** Indeks terpilih dengan peluang sebanding bobot (semua bobot harus > 0). */
export function pickWeighted(weights: number[]): number {
  if (weights.length === 0 || weights.some((w) => !(w > 0) || !Number.isFinite(w))) {
    throw new RangeError('bobot harus berupa bilangan > 0');
  }
  const total = weights.reduce((a, b) => a + b, 0);
  let r = randomFloat() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}
