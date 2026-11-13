/**
 * Membaca angka rupiah dari teks hasil OCR, yang sering keliru pada huruf mirip angka
 * (O/o jadi 0, l/I jadi 1, S jadi 5) dan pada pemisah (titik jadi titik dua atau spasi).
 */

const LOOKALIKE: Record<string, string> = { O: '0', o: '0', l: '1', I: '1', '|': '1', S: '5', B: '8' };

/** Menyatukan angka yang terpecah spasi ("10: 080" menjadi "10.080") dan memperbaiki pemisah. */
export function normalizeNumberText(text: string): string {
  return text
    .replace(/(\d)\s*[.:,]\s+(\d{3})(?!\d)/g, '$1.$2')
    .replace(/(\d):(\d{3})(?!\d)/g, '$1.$2');
}

/**
 * Mengubah "36.000", "Rp 36.000", "36,000", "36.000,00", "-80", "(80)" menjadi bilangan bulat
 * rupiah. Mengembalikan null bila bukan angka rupiah yang masuk akal.
 */
export function parseAmount(raw: string): number | null {
  let t = raw.trim();
  if (!t) return null;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  t = t.replace(/^(rp\.?|idr)\s*/i, '').trim();
  if (t.startsWith('-') || t.startsWith('\u2212')) {
    negative = !negative;
    t = t.slice(1).trim();
  }
  t = t.replace(/[.,:;'"]+$/, ''); // titik atau koma sisa di ujung
  if (!/\d/.test(t)) return null;
  t = t.replace(/[OolI|SB]/g, (c) => LOOKALIKE[c] ?? c);
  // Sen ",00" di belakang angka yang jelas rupiah ("36.000,00") dibuang
  const withCents = t.match(/^(\d{1,3}(?:[.,]\d{3})+|\d{4,})[.,]00$/);
  if (withCents) t = withCents[1];
  // Pemisah ribuan: kelompok tepat 3 digit. Selain itu bukan format rupiah.
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(t)) return null;
  const digits = t.replace(/[.,]/g, '');
  if (digits.length > 9) return null;
  const n = Number(digits);
  return negative ? -n : n;
}

/** Angka paling kanan di sebuah baris beserta posisi awalnya, atau null bila baris tidak berakhir angka. */
export function trailingAmount(text: string): { amount: number; index: number } | null {
  const t = normalizeNumberText(text);
  const m = t.match(/(?:^|\s)(-?\(?(?:Rp\.?\s*)?[\dOolI|S][\dOolI|S.,]*\)?)[.,:;'"\s]*$/);
  if (!m || m.index === undefined) return null;
  const token = m[1];
  const amount = parseAmount(token);
  if (amount === null) return null;
  return { amount, index: m.index + m[0].indexOf(token) };
}
