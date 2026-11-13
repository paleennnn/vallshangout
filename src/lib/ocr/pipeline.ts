import { parseReceipt } from './parse';
import { groupRows } from './rows';
import type { OcrRow, OcrWord, ParsedReceipt } from './types';

export type EngineId = 'tesseract' | 'paddle';

/** Hasil mentah sebuah mesin OCR: kata beserta kotaknya dan waktu prosesnya. */
export interface EngineOutput {
  text: string;
  words: OcrWord[];
  loadMs: number;
  recognizeMs: number;
}

export interface Analysis {
  rows: OcrRow[];
  parsed: ParsedReceipt;
}

/** Dari kata OCR ke baris, lalu ke usulan struk (menu, biaya, total, dan peringatan). */
export function analyzeWords(words: OcrWord[]): Analysis {
  const rows = groupRows(words);
  return { rows, parsed: parseReceipt(rows) };
}
