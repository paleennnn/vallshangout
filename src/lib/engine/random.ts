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
