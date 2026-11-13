import type { OcrRow, OcrWord } from './types';

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Gabungkan kata menjadi teks; jarak horizontal lebar diberi dua spasi agar kolom tidak menempel. */
function joinWords(words: OcrWord[]): string {
  const charW = median(words.map((w) => (w.x1 - w.x0) / Math.max(1, w.text.length))) || 8;
  let out = '';
  words.forEach((w, i) => {
    if (i > 0) out += w.x0 - words[i - 1].x1 > charW * 3 ? '  ' : ' ';
    out += w.text;
  });
  return out.trim();
}

function toRow(words: OcrWord[]): OcrRow {
  const sorted = [...words].sort((a, b) => a.x0 - b.x0);
  const confs = sorted.map((w) => w.conf).filter((c): c is number => typeof c === 'number');
  return {
    words: sorted,
    text: joinWords(sorted),
    y: sorted.reduce((a, w) => a + (w.y0 + w.y1) / 2, 0) / sorted.length,
    minConf: confs.length ? Math.min(...confs) : undefined,
  };
}

/**
 * Menyusun kata-kata OCR menjadi baris, dari atas ke bawah. Bila engine memberi nomor baris
 * (`line`), itu dipakai; selain itu kata dikelompokkan menurut pusat vertikalnya.
 */
export function groupRows(words: OcrWord[]): OcrRow[] {
  const clean = words.filter((w) => w.text.trim() !== '');
  if (clean.length === 0) return [];

  if (clean.every((w) => typeof w.line === 'number')) {
    const byLine = new Map<number, OcrWord[]>();
    for (const w of clean) byLine.set(w.line as number, [...(byLine.get(w.line as number) ?? []), w]);
    return [...byLine.values()].map(toRow).sort((a, b) => a.y - b.y);
  }

  const tolerance = 0.6 * (median(clean.map((w) => w.y1 - w.y0)) || 10);
  const sorted = [...clean].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const groups: { cy: number; words: OcrWord[] }[] = [];
  for (const w of sorted) {
    const cy = (w.y0 + w.y1) / 2;
    const g = groups[groups.length - 1];
    if (g && Math.abs(cy - g.cy) <= tolerance) {
      g.words.push(w);
      g.cy = g.words.reduce((a, x) => a + (x.y0 + x.y1) / 2, 0) / g.words.length;
    } else {
      groups.push({ cy, words: [w] });
    }
  }
  return groups.map((g) => toRow(g.words));
}
