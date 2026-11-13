/**
 * Pra-olah foto struk sebelum OCR. Fungsi murni (scaleToFit, autoContrast) dipisah dari bagian
 * yang butuh browser (prepareCanvas) supaya bisa diuji tanpa kanvas.
 */

export interface PrepOptions {
  /** Sisi terpanjang maksimal (px). Foto HP sering 4000 px+, terlalu besar dan lambat. */
  maxEdge: number;
  /** Foto yang sisi terpanjangnya di bawah ini diperbesar (teks kecil sulit dibaca OCR). */
  minEdge: number;
  /** Abu-abu dan regangkan kontras. */
  enhance: boolean;
}

export const DEFAULT_PREP: PrepOptions = { maxEdge: 1600, minEdge: 1000, enhance: true };

export function scaleToFit(width: number, height: number, maxEdge: number, minEdge = 0) {
  const longEdge = Math.max(width, height);
  let scale = 1;
  if (longEdge > maxEdge) scale = maxEdge / longEdge;
  else if (minEdge > 0 && longEdge < minEdge) scale = minEdge / longEdge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

/**
 * Mengubah piksel RGBA menjadi abu-abu dan meregangkan kontrasnya antara persentil ke-2 dan
 * ke-98, sehingga struk pudar atau foto remang lebih terbaca. Mengubah `rgba` di tempat.
 */
export function autoContrast(rgba: Uint8ClampedArray): { low: number; high: number } {
  const hist = new Uint32Array(256);
  const gray = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    const g = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    gray[j] = g;
    hist[g]++;
  }
  const total = gray.length;
  const percentile = (p: number) => {
    const target = total * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };
  const low = percentile(0.02);
  const high = Math.max(percentile(0.98), low + 1);
  const range = high - low;
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    const v = Math.max(0, Math.min(255, Math.round(((gray[j] - low) * 255) / range)));
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
  }
  return { low, high };
}

/** Memuat foto (orientasi EXIF dihormati), mengubah ukuran, dan opsional memperjelas kontras. */
export async function prepareCanvas(file: Blob, options: PrepOptions = DEFAULT_PREP): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = scaleToFit(bitmap.width, bitmap.height, options.maxEdge, options.minEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Kanvas tidak tersedia di browser ini.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  if (options.enhance) {
    const img = ctx.getImageData(0, 0, width, height);
    autoContrast(img.data);
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}
