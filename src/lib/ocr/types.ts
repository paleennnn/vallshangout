/** Satu kata atau potongan teks hasil OCR, lengkap dengan kotaknya di foto (piksel). */
export interface OcrWord {
  text: string;
  /** Keyakinan 0..100 bila engine menyediakannya. */
  conf?: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Nomor baris dari engine (bila ada); kata dengan nomor sama dianggap satu baris. */
  line?: number;
}

export interface OcrRow {
  words: OcrWord[];
  text: string;
  /** Pusat vertikal baris. */
  y: number;
  /** Keyakinan terendah di baris ini (0..100), undefined bila engine tidak menyediakan. */
  minConf?: number;
}

export interface ParsedItem {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  /** Indeks baris OCR asal (untuk menandai di layar tinjau). */
  row: number;
  /** Angka di baris ini tidak konsisten atau tidak terbaca jelas; perlu dicek pengguna. */
  suspect: boolean;
  /** Alasan `suspect`, untuk ditampilkan. */
  note?: string;
}

/** Saran perbaikan satu digit: "angka ini kemungkinan salah baca". */
export interface Suggestion {
  /** Indeks pada `items`. */
  item: number;
  from: number;
  to: number;
}

export interface ParsedReceipt {
  items: ParsedItem[];
  /** Subtotal yang tertulis di struk, null bila tidak ada barisnya. */
  subtotal: number | null;
  serviceAmount: number;
  taxAmount: number;
  discountAmount: number;
  roundingAmount: number;
  /** Total yang tertulis di struk, null bila tidak ditemukan. */
  total: number | null;
  /** Pajak tertulis "sudah termasuk"; angka pajak tidak ditambahkan lagi. */
  taxIncluded: boolean;
  itemsSum: number;
  /** subtotal + service + pajak - diskon + pembulatan (subtotal = tertulis, atau jumlah menu). */
  expectedTotal: number;
  /** Cocok bila total tertulis sama dengan hitungan; null bila struk tidak punya baris total. */
  reconciled: boolean | null;
  warnings: string[];
  suggestions: Suggestion[];
  /** Baris yang tidak dipakai (alamat, tanggal, pembayaran, dst). */
  ignored: string[];
}
