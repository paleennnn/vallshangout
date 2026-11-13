import type { EngineOutput } from '../pipeline';
import type { OcrWord } from '../types';

/**
 * PaddleOCR (PP-OCRv6 tiny) lewat ONNX Runtime Web. EKSPERIMENTAL: bagian ini belum pernah
 * dijalankan di browser sungguhan oleh pengembangnya, jadi galat di sini wajar dan akan
 * ditampilkan apa adanya di halaman uji.
 */
const PATHS = {
  detection: '/ocr/paddle/det.ort',
  recognition: '/ocr/paddle/rec.ort',
  charactersDictionary: '/ocr/paddle/dict.txt',
};

type Service = { recognize: (image: HTMLCanvasElement, options: { flatten: true }) => Promise<{ text: string; results: { text: string; confidence: number; box: { x: number; y: number; width: number; height: number } }[] }> };
let cached: Promise<Service> | null = null;

function getService(): Promise<Service> {
  cached ??= (async () => {
    const ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = '/ocr/ort/';
    ort.env.wasm.numThreads = 1; // utas tunggal: tidak bergantung pada cross-origin isolation
    const { PaddleOcrService } = await import('ppu-paddle-ocr/web');
    const service = new PaddleOcrService({ model: PATHS, session: { executionProviders: ['wasm'] } });
    await service.initialize();
    return service as unknown as Service;
  })();
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

export async function runPaddle(canvas: HTMLCanvasElement): Promise<EngineOutput> {
  const warm = cached !== null;
  const t0 = performance.now();
  const service = await getService();
  const t1 = performance.now();
  const result = await service.recognize(canvas, { flatten: true });
  const t2 = performance.now();

  const words: OcrWord[] = result.results.map((r) => ({
    text: r.text,
    conf: Math.round(r.confidence * 100),
    x0: r.box.x,
    y0: r.box.y,
    x1: r.box.x + r.box.width,
    y1: r.box.y + r.box.height,
  }));
  return { text: result.text, words, loadMs: warm ? 0 : t1 - t0, recognizeMs: t2 - t1 };
}
