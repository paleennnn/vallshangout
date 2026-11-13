import type { Worker } from 'tesseract.js';
import type { EngineOutput } from '../pipeline';
import type { OcrWord } from '../types';

/** Aset dilayani dari domain sendiri (CSP hanya mengizinkan 'self'); disiapkan scripts/ocr-assets.mjs. */
const PATHS = {
  workerPath: '/ocr/tesseract/worker.min.js',
  corePath: '/ocr/tesseract/core',
  langPath: '/ocr/tesseract/lang',
};

let cached: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  cached ??= import('tesseract.js').then(({ createWorker }) =>
    createWorker('ind', 1, { ...PATHS, gzip: true, logger: () => {} }),
  );
  cached.catch(() => {
    cached = null; // percobaan berikutnya boleh mengulang
  });
  return cached;
}

export async function runTesseract(canvas: HTMLCanvasElement): Promise<EngineOutput> {
  const warm = cached !== null;
  const t0 = performance.now();
  const worker = await getWorker();
  const t1 = performance.now();
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
  const t2 = performance.now();

  const words: OcrWord[] = [];
  let line = 0;
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const l of paragraph.lines) {
        for (const w of l.words) {
          words.push({ text: w.text, conf: Math.round(w.confidence), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, line });
        }
        line++;
      }
    }
  }
  return { text: data.text ?? '', words, loadMs: warm ? 0 : t1 - t0, recognizeMs: t2 - t1 };
}
