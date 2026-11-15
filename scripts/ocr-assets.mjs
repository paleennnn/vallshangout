// Menyiapkan aset OCR untuk fitur Scan struk dan halaman uji /lab/ocr. Hasilnya ditaruh di
// public/ocr (diabaikan git):
//   - Tesseract.js: worker, inti WASM, dan model bahasa Indonesia (disalin dari node_modules)
// Semua dilayani dari domain sendiri karena CSP hanya mengizinkan 'self'. Dijalankan otomatis
// sebelum `npm run dev` dan `npm run build`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
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
