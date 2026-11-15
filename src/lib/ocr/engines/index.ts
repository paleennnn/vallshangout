import type { EngineId, EngineOutput } from '../pipeline';

export const ENGINES: { id: EngineId; label: string; note: string }[] = [
  { id: 'tesseract', label: 'Tesseract.js (bahasa Indonesia)', note: 'Model sekitar 1 MB, inti WASM sekitar 4 MB.' },
];

/** Memuat mesin hanya saat dipakai, supaya halaman biasa tidak ikut menarik kode OCR. */
export async function runEngine(id: EngineId, canvas: HTMLCanvasElement): Promise<EngineOutput> {
  switch (id) {
    case 'tesseract':
      return (await import('./tesseract')).runTesseract(canvas);
  }
}
