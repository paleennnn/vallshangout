import type { EngineId, EngineOutput } from '../pipeline';

export const ENGINES: { id: EngineId; label: string; note: string }[] = [
  { id: 'tesseract', label: 'Tesseract.js (bahasa Indonesia)', note: 'Model sekitar 1 MB, inti WASM sekitar 4 MB.' },
  { id: 'paddle', label: 'PaddleOCR (eksperimental)', note: 'Model sekitar 6 MB plus WASM sekitar 15 MB; belum teruji di browser.' },
];

/** Memuat mesin hanya saat dipakai, supaya halaman biasa tidak ikut menarik kode OCR. */
export async function runEngine(id: EngineId, canvas: HTMLCanvasElement): Promise<EngineOutput> {
  if (id === 'tesseract') return (await import('./tesseract')).runTesseract(canvas);
  return (await import('./paddle')).runPaddle(canvas);
}
