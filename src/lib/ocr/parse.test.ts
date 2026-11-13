import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/synthetic-ocr.json';
import { parseReceipt } from './parse';
import { groupRows } from './rows';
import type { OcrRow, OcrWord } from './types';

/** Baris OCR dari teks saja (cukup untuk menguji parser). */
const rows = (...lines: string[]): OcrRow[] => lines.map((text, i) => ({ words: [], text, y: i * 20 }));
const fixture = (name: string) => parseReceipt(groupRows((fixtures as Record<string, { words: OcrWord[] }>)[name].words));
const brief = (r: ReturnType<typeof parseReceipt>) => r.items.map((i) => [i.name, i.qty, i.unitPrice, i.lineTotal]);

describe('parseReceipt: format baris menu', () => {
  it('nama dan satu harga di ujung', () => {
    const r = parseReceipt(rows('Nasi Goreng  25.000', 'Es Teh  8.000', 'TOTAL  33.000'));
    expect(brief(r)).toEqual([['Nasi Goreng', 1, 25000, 25000], ['Es Teh', 1, 8000, 8000]]);
    expect(r.total).toBe(33000);
    expect(r.reconciled).toBe(true);
  });

  it('jumlah dan harga satuan di baris di bawah nama ("2 x 18.000  36.000")', () => {
    const r = parseReceipt(rows('Es Kopi Susu', '  2 x 18.000  36.000', 'TOTAL  36.000'));
    expect(brief(r)).toEqual([['Es Kopi Susu', 2, 18000, 36000]]);
    expect(r.items[0].suspect).toBe(false);
  });

  it('penanda "@" dan "*" juga dikenali', () => {
    const r = parseReceipt(rows('INDOMIE GORENG', '5 @ 3.500  17.500', 'AQUA 600ML', '2 * 4.000  8.000'));
    expect(brief(r)).toEqual([['INDOMIE GORENG', 5, 3500, 17500], ['AQUA 600ML', 2, 4000, 8000]]);
  });

  it('jumlah dan harga satuan satu baris dengan nama', () => {
    const r = parseReceipt(rows('Kopi Hitam 3 x 12.000  36.000'));
    expect(brief(r)).toEqual([['Kopi Hitam', 3, 12000, 36000]]);
  });

  it('akhiran "x3" di belakang nama: harga baris dibagi jumlah', () => {
    const r = parseReceipt(rows('Es Teh Manis x3  21.000'));
    expect(brief(r)).toEqual([['Es Teh Manis', 3, 7000, 21000]]);
    expect(r.items[0].suspect).toBe(false);
  });

  it('akhiran "x3" yang tidak habis dibagi ditandai ragu', () => {
    const r = parseReceipt(rows('Es Teh Manis x3  20.000'));
    expect(r.items[0]).toMatchObject({ qty: 1, lineTotal: 20000, suspect: true });
  });

  it('tanpa penanda x, baris jumlah hanya diterima bila hitungannya pas', () => {
    const ok = parseReceipt(rows('TEH PUCUK', '2 5.000 10.000'));
    expect(brief(ok)).toEqual([['TEH PUCUK', 2, 5000, 10000]]);
    const bad = parseReceipt(rows('TEH PUCUK', '2 5.000 12.000'));
    expect(bad.items[0].suspect).toBe(true); // tidak dipaksa menjadi 2 x 5.000
  });

  it('baris jumlah yang rusak: harga diambil dari total baris dan ditandai', () => {
    const r = parseReceipt(rows('INDOMIE GORENG SPESIAL', '503.500  17.500'));
    expect(r.items[0]).toMatchObject({ name: 'INDOMIE GORENG SPESIAL', qty: 1, lineTotal: 17500, suspect: true });
    expect(r.warnings.join(' ')).toMatch(/INDOMIE GORENG SPESIAL/);
  });

  it('nama dibersihkan dari sampah foto di ujung dan titik menempel', () => {
    const r = parseReceipt(rows('Nasi Rendang 757. Il  35.000', 'TEH. PUCUK.  5.000'));
    expect(r.items.map((i) => i.name)).toEqual(['Nasi Rendang', 'TEH PUCUK']);
  });
});

describe('parseReceipt: biaya dan total', () => {
  const sample = (...extra: string[]) =>
    rows('Kopi  50.000', 'Roti  30.000', ...extra);

  it('subtotal, service, pajak, pembulatan, dan total saling cocok', () => {
    const r = parseReceipt(sample('Subtotal  80.000', 'Service 5%  4.000', 'PB1 10%  8.400', 'Pembulatan  -400', 'TOTAL  92.000'));
    expect(r).toMatchObject({ subtotal: 80000, serviceAmount: 4000, taxAmount: 8400, roundingAmount: -400, total: 92000, expectedTotal: 92000, reconciled: true });
    expect(r.warnings).toEqual([]);
  });

  it('persen yang terbaca sebagai angka ("5%" jadi "55") tidak mengganggu jumlah rupiah', () => {
    const r = parseReceipt(sample('Service 55  4.000', 'PPN 115  8.800', 'TOTAL  92.800'));
    expect(r).toMatchObject({ serviceAmount: 4000, taxAmount: 8800, total: 92800, reconciled: true });
  });

  it('diskon dibaca sebagai pengurang walau ditulis positif', () => {
    const r = parseReceipt(sample('Jumlah  80.000', 'Diskon Member  8.000', 'Total Bayar  72.000'));
    expect(r).toMatchObject({ discountAmount: 8000, total: 72000, reconciled: true });
  });

  it('pembulatan tanpa tanda: arah ditentukan dari selisih terhadap total', () => {
    const up = parseReceipt(sample('Subtotal  80.000', 'Pembulatan  50', 'TOTAL  80.050'));
    expect(up.roundingAmount).toBe(50);
    const down = parseReceipt(sample('Subtotal  80.000', 'Pembulatan  50', 'TOTAL  79.950'));
    expect(down.roundingAmount).toBe(-50);
    expect(down.reconciled).toBe(true);
  });

  it('pajak "sudah termasuk" tidak ditambahkan lagi', () => {
    const r = parseReceipt(sample('Subtotal  80.000', 'Harga sudah termasuk PPN  7.207', 'TOTAL  80.000'));
    expect(r).toMatchObject({ taxIncluded: true, taxAmount: 0, reconciled: true });
    expect(r.warnings.join(' ')).toMatch(/sudah termasuk/);
  });

  it('tanpa baris subtotal: subtotal diambil dari jumlah menu', () => {
    const r = parseReceipt(sample('PB1  8.000', 'TOTAL  88.000'));
    expect(r).toMatchObject({ subtotal: null, itemsSum: 80000, expectedTotal: 88000, reconciled: true });
  });

  it('beberapa baris "total": dipilih yang cocok dengan hitungan', () => {
    const r = parseReceipt(sample('Subtotal  80.000', 'TOTAL  80.000', 'Tunai  100.000', 'Kembali  20.000'));
    expect(r.total).toBe(80000);
    expect(r.reconciled).toBe(true);
  });

  it('tidak ada baris total: tidak bisa dicocokkan dan diberi tahu', () => {
    const r = parseReceipt(sample('Subtotal  80.000'));
    expect(r.total).toBeNull();
    expect(r.reconciled).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/total tidak ditemukan/i);
  });
});

describe('parseReceipt: baris yang bukan menu', () => {
  it('kepala struk, tanggal, nomor meja, dan telepon tidak menjadi menu', () => {
    const r = parseReceipt(
      rows('KOPI SENOPATI', 'Jl. Senopati No. 12 Jakarta', 'Telp 02155512345', '01/11/2026 19:42', 'Kasir: Rina  Meja 5', 'Kopi  25.000', 'TOTAL  25.000'),
    );
    expect(brief(r)).toEqual([['Kopi', 1, 25000, 25000]]);
    expect(r.ignored).toContain('Telp 02155512345');
  });

  it('pembayaran dan kembalian di bawah total diabaikan', () => {
    const r = parseReceipt(rows('Kopi  25.000', 'TOTAL  25.000', 'Tunai  50.000', 'Kembali  25.000', 'QRIS  25.000'));
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(25000);
  });

  it('struk kosong: tidak ada menu dan diberi tahu', () => {
    const r = parseReceipt(rows('foto buram', 'tidak terbaca'));
    expect(r.items).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/Tidak ada menu/);
  });

  it('daftar baris kosong tidak membuat parser gagal', () => {
    expect(parseReceipt([]).items).toEqual([]);
  });
});

describe('parseReceipt: rekonsiliasi dan saran perbaikan satu digit', () => {
  it('subtotal tidak sama dengan jumlah menu dilaporkan', () => {
    const r = parseReceipt(rows('Kopi  50.000', 'Roti  30.000', 'Subtotal  90.000', 'TOTAL  90.000'));
    expect(r.warnings.join(' ')).toMatch(/Jumlah menu 80000 tidak sama dengan subtotal di struk 90000/);
    expect(r.reconciled).toBe(true); // total cocok dengan subtotal tertulis; yang salah ada di menu
  });

  it('satu angka menu keliru satu digit: disarankan perbaikannya', () => {
    const r = parseReceipt(rows('Kopi  50.600', 'Roti  30.000', 'Subtotal  80.000', 'TOTAL  80.000'));
    expect(r.suggestions).toEqual([{ item: 0, from: 50600, to: 50000 }]);
  });

  it('banyak kandidat sama-sama masuk akal: tidak menebak', () => {
    const r = parseReceipt(rows('Kopi  50.000', 'Roti  30.000', 'Subtotal  80.060', 'TOTAL  80.060'));
    expect(r.suggestions).toEqual([]);
  });

  it('total tertulis tidak sama dengan hitungan: selisih dilaporkan', () => {
    const r = parseReceipt(rows('Kopi  50.000', 'Subtotal  50.000', 'PB1  5.000', 'TOTAL  56.000'));
    expect(r.reconciled).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/Total di struk 56000 tidak sama dengan hitungan 55000 \(selisih 1000\)/);
  });
});

describe('parseReceipt: keluaran Tesseract asli (gambar uji sintetis)', () => {
  it('struk kafe bersih: semua menu, biaya, dan total cocok', () => {
    const r = fixture('cafe_clean');
    expect(brief(r)).toEqual([['Es Kopi Susu', 2, 18000, 36000], ['Croissant Butter', 1, 28000, 28000], ['Matcha Latte', 1, 32000, 32000]]);
    expect(r).toMatchObject({ subtotal: 96000, serviceAmount: 4800, taxAmount: 10080, roundingAmount: -80, total: 110800, reconciled: true });
    expect(r.warnings).toEqual([]);
  });

  it('struk rumah makan bersih: diskon, pajak, dan "x3" cocok', () => {
    const r = fixture('resto_clean');
    expect(brief(r)).toEqual([['Nasi Rendang', 1, 35000, 35000], ['Ayam Pop', 1, 30000, 30000], ['Es Teh Manis', 3, 7000, 21000], ['Gulai Otak', 1, 27500, 27500]]);
    expect(r).toMatchObject({ subtotal: 113500, discountAmount: 11350, taxAmount: 11237, total: 113387, reconciled: true });
  });

  it('struk minimarket bersih: "5 @ 3.500" terbaca sebagai "503.500", ditandai untuk dicek tetapi total cocok', () => {
    const r = fixture('mart_clean');
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({ name: 'INDOMIE GORENG SPESIAL', lineTotal: 17500, suspect: true });
    expect(r.items[1]).toMatchObject({ qty: 2, unitPrice: 4000, lineTotal: 8000 });
    expect(r.total).toBe(30500);
    expect(r.reconciled).toBe(true);
  });

  it('foto buruk: struktur tetap utuh, kesalahan digit dilaporkan dan tidak diam-diam benar', () => {
    const cafe = fixture('cafe_hard');
    expect(cafe.items.map((i) => i.name)).toEqual(['Es Kopi Susu', 'Croissant Butter', 'Marcha Latre']);
    expect(cafe.reconciled).toBe(false);
    expect(cafe.warnings.length).toBeGreaterThan(0);

    const resto = fixture('resto_hard');
    expect(resto.items.map((i) => i.name)).toEqual(['Nasi Rendang', 'Ayain Pop', 'Es Teh Mapis', 'Gulai Otak']);
    expect(resto.reconciled).toBe(false);

    const mart = fixture('mart_hard');
    expect(mart.items).toHaveLength(3);
    expect(mart.items.every((i) => i.suspect)).toBe(true);
    expect(mart.reconciled).toBe(false);
  });
});
