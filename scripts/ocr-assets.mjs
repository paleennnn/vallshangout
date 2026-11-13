// Menyiapkan aset OCR untuk halaman uji /lab/ocr. Hasilnya ditaruh di public/ocr (diabaikan git):
//   - Tesseract.js: worker, inti WASM, dan model bahasa Indonesia (disalin dari node_modules)
//   - onnxruntime-web: WASM untuk PaddleOCR (disalin dari node_modules)
//   - PaddleOCR PP-OCRv6 tiny: model deteksi, pengenalan, dan kamus (diunduh dari Hugging Face)
// Semua dilayani dari domain sendiri karena CSP hanya mengizinkan 'self'. Dijalankan otomatis
// sebelum `npm run dev` dan `npm run build`; kegagalan unduhan hanya memberi peringatan.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const nm = (...p) => join(root, 'node_modules', ...p);
const out = (...p) => join(root, 'public', 'ocr', ...p);

function copy(from, to) {
  if (!existsSync(from)) {
    console.warn(`[ocr-assets] tidak ditemukan: ${from}`);
    return false;
  }
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to) && statSync(to).size === statSync(from).size) return true;
  copyFileSync(from, to);
  return true;
}

// Tesseract.js
copy(nm('tesseract.js', 'dist', 'worker.min.js'), out('tesseract', 'worker.min.js'));
const coreDir = nm('tesseract.js-core');
if (existsSync(coreDir)) {
  for (const f of readdirSync(coreDir)) if (f.endsWith('.wasm.js')) copy(join(coreDir, f), out('tesseract', 'core', f));
}
copy(nm('@tesseract.js-data', 'ind', '4.0.0_best_int', 'ind.traineddata.gz'), out('tesseract', 'lang', 'ind.traineddata.gz'));

// onnxruntime-web (hanya varian WASM; WebGPU tidak dipakai)
for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) copy(nm('onnxruntime-web', 'dist', f), out('ort', f));

// PaddleOCR v6 tiny
const BASE = 'https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main';
const models = {
  'det.ort': `${BASE}/detection/ort/PP-OCRv6_tiny_det.ort`,
  'rec.ort': `${BASE}/recognition/ort/PP-OCRv6_tiny_rec.ort`,
  'dict.txt': `${BASE}/recognition/ppocrv6_tiny_dict.txt`,
};
for (const [name, url] of Object.entries(models)) {
  const dest = out('paddle', name);
  if (existsSync(dest) && statSync(dest).size > 0) continue;
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`[ocr-assets] diunduh ${name}`);
  } catch (e) {
    console.warn(`[ocr-assets] gagal mengunduh ${name} (${e.message}). Mesin PaddleOCR di /lab/ocr tidak akan tersedia.`);
  }
}
