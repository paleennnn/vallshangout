import { normalizeNumberText, parseAmount, trailingAmount } from './money';
import type { OcrRow, ParsedItem, ParsedReceipt, Suggestion } from './types';

/** Harga menu di bawah ini dianggap bukan harga (nomor meja, jumlah, dst). */
const MIN_ITEM_PRICE = 100;

// Kata kunci dicocokkan pada label huruf kecil; toleran terhadap salah baca ringan.
const RE = {
  subtotal: /sub\s*-?\s*tot|jumlah(?!\s*(bayar|tagihan))|total\s*(item|harga|belanja)/,
  total: /(grand\s*)?total|jumlah\s*(bayar|tagihan)|amount\s*due|netto|tagihan/,
  service: /serv(ice)?\b|svc|layanan|\bsc\b|serv\./,
  tax: /pb\s*-?\s*1|ppn|pajak|\btax\b|pjk/,
  discount: /dis[ck]|diskon|potongan|promo|voucher|hemat|kupon|coupon|cashback/,
  rounding: /pembulat|rounding|\bround/,
  payment: /tunai|cash|kembali|change|debit|kredit|credit|kartu|card|qris|dibayar|payment|gopay|ovo|dana|shopee|edc|approval|\bmid\b|\btid\b/,
  taxIncluded: /(sudah\s*)?termasuk\s*(pajak|ppn|pb\s*1)|incl(uded|\.)?\s*(tax|ppn|pb)|harga\s*include/,
};

const qtyRowRe = /^\s*(\d{1,3})\s*[.,:]?\s*[xX@*]\s*[.,:]?\s*([\dOolIS.,:]+)\s+([\dOolIS.,:]+)\s*$/;
const qtyNoMarkerRe = /^\s*(\d{1,3})\s+([\dOolIS.,:]+)\s+([\dOolIS.,:]+)\s*$/;
const inlineQtyRe = /^(.*?)\s*(\d{1,3})\s*[xX@*]\s*([\dOolIS.,:]+)\s+([\dOolIS.,:]+)\s*$/;
const nameQtySuffixRe = /^(.*?)\s*\bx\s*(\d{1,2})\b[\s:'"”“.,]*$/i;

const NOTE_QTY_UNREADABLE = 'jumlah dan harga satuan tidak terbaca jelas, harga diambil dari total baris';

const label = (text: string) => text.toLowerCase().replace(/[^a-z0-9%.\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Nama menu dibersihkan dari sisa titik atau garis hasil salah baca. */
function cleanName(s: string): string {
  return s
    .replace(/["'“”‘’|_~]+/g, ' ')
    .replace(/\s[.:;,]+(?=\s|$)/g, ' ')
    .replace(/^[\s.:;,\-=]+|[\s.:;,\-=]+$/g, '')
    .split(/\s+/)
    .map((t) => t.replace(/^[.:;,]+|[.:;,]+$/g, '')) // titik menempel di ujung kata ("TEH.")
    .filter(Boolean)
    .join(' ');
}

/** Membuang tanda baca yang berdiri sendiri (sisa bercak foto) sebelum mencocokkan pola. */
const denoise = (text: string) => text.replace(/(^|\s)[.:;,|'"“”_~]+(?=\s|$)/g, '$1').replace(/\s+/g, ' ').trim();

/** Membuang potongan sampah di ujung nama (mis. "757. Il") selama masih ada nama yang bermakna. */
function trimNoise(name: string): string {
  const tokens = name.split(' ');
  while (tokens.length > 1 && /^([\dIl|.,:]{1,5}|[A-Za-z]{1,2})$/.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

/** Nama menu butuh sedikitnya dua huruf berurutan (bukan sekadar "x"). */
const looksLikeName = (name: string) => /[a-z]{2}/i.test(name);

/** Harga tanpa pemisah ribuan dan sangat panjang lebih mirip nomor telepon atau ID. */
const plausiblePrice = (raw: string) => /[.,]/.test(raw) || raw.replace(/\D/g, '').length <= 6;

function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/**
 * Menyusun struk dari baris-baris OCR. Prinsipnya: menu ada di atas, lalu subtotal, service,
 * pajak, diskon, pembulatan, dan total. Hasilnya SELALU berupa usulan: totalnya dicocokkan
 * dengan hitungan, dan ketidakcocokan dilaporkan di `warnings` agar ditinjau pengguna.
 */
export function parseReceipt(rows: OcrRow[]): ParsedReceipt {
  const items: ParsedItem[] = [];
  const ignored: string[] = [];
  const warnings: string[] = [];

  let subtotal: number | null = null;
  let service = 0;
  let tax = 0;
  let discount = 0;
  let rounding = 0;
  let roundingSigned = false;
  const totals: number[] = [];
  let taxIncluded = false;
  let inItems = true;
  let pendingName: { name: string; row: number } | null = null;

  rows.forEach((row, idx) => {
    const text = denoise(normalizeNumberText(row.text));
    const lab = label(text);
    const tail = trailingAmount(text);
    const labelText = label(tail ? text.slice(0, tail.index) : text);

    // 1) Baris biaya: subtotal, service, pajak, diskon, pembulatan, total (berhenti membaca menu)
    const keyed =
      (RE.subtotal.test(labelText) && 'subtotal') ||
      (RE.rounding.test(labelText) && 'rounding') ||
      (RE.tax.test(labelText) && 'tax') ||
      (RE.service.test(labelText) && 'service') ||
      (RE.discount.test(labelText) && 'discount') ||
      (RE.total.test(labelText) && 'total') ||
      null;

    if (keyed) {
      inItems = false;
      pendingName = null;
      if (RE.taxIncluded.test(lab) && keyed === 'tax') {
        taxIncluded = true;
        return;
      }
      if (!tail) {
        ignored.push(row.text);
        return;
      }
      const a = tail.amount;
      switch (keyed) {
        case 'subtotal':
          subtotal = Math.abs(a);
          break;
        case 'service':
          service += Math.abs(a);
          break;
        case 'tax':
          tax += Math.abs(a);
          break;
        case 'discount':
          discount += Math.abs(a);
          break;
        case 'rounding':
          rounding = a;
          roundingSigned = a < 0 || /^\s*[-(]/.test(text.slice(tail.index));
          break;
        case 'total':
          totals.push(Math.abs(a));
          break;
      }
      return;
    }

    if (!inItems || RE.payment.test(labelText)) {
      if (row.text.trim()) ignored.push(row.text);
      return;
    }

    // 2) Baris menu
    // 2a) "2 x 18.000 36.000" di baris sendiri, melengkapi nama di baris sebelumnya
    const qrow = text.match(qtyRowRe) ?? text.match(qtyNoMarkerRe);
    if (qrow && pendingName) {
      const qty = Number(qrow[1]);
      const unit = parseAmount(qrow[2]);
      const total = parseAmount(qrow[3]);
      if (unit !== null && total !== null && unit >= MIN_ITEM_PRICE && qty >= 1) {
        const consistent = unit * qty === total;
        // tanpa penanda x atau @, hanya diterima bila hitungannya pas
        if (consistent || qtyRowRe.test(text)) {
          items.push({ name: pendingName.name, qty, unitPrice: unit, lineTotal: total, row: idx, suspect: !consistent, note: consistent ? undefined : `${qty} x ${unit} tidak sama dengan ${total}` });
          pendingName = null;
          return;
        }
      }
    }

    // 2b) Baris dengan dua angka di ujung (satuan lalu total) setelah baris nama, mis. "503.500 17.500"
    const two = text.match(/^\s*([\dOolIS.,:]+)\s+([\dOolIS.,:]+)\s*$/);
    if (two && pendingName) {
      const unit = parseAmount(two[1]);
      const total = parseAmount(two[2]);
      if (unit !== null && total !== null && total >= MIN_ITEM_PRICE) {
        const ratio = unit > 0 ? total / unit : NaN;
        if (Number.isInteger(ratio) && ratio >= 1 && ratio <= 99) {
          items.push({ name: pendingName.name, qty: ratio, unitPrice: unit, lineTotal: total, row: idx, suspect: false });
        } else {
          items.push({ name: pendingName.name, qty: 1, unitPrice: total, lineTotal: total, row: idx, suspect: true, note: NOTE_QTY_UNREADABLE });
        }
        pendingName = null;
        return;
      }
    }

    // 2c) Nama dan "2 x 18.000 36.000" dalam satu baris
    const inline = text.match(inlineQtyRe);
    if (inline && looksLikeName(cleanName(inline[1]))) {
      const qty = Number(inline[2]);
      const unit = parseAmount(inline[3]);
      const total = parseAmount(inline[4]);
      if (unit !== null && total !== null && unit >= MIN_ITEM_PRICE) {
        items.push({ name: trimNoise(cleanName(inline[1])), qty, unitPrice: unit, lineTotal: total, row: idx, suspect: unit * qty !== total, note: unit * qty !== total ? `${qty} x ${unit} tidak sama dengan ${total}` : undefined });
        if (pendingName) ignored.push(pendingName.name);
        pendingName = null;
        return;
      }
    }

    // 2d) Nama dan satu harga di ujung (jumlah 1, atau "x3" di belakang nama)
    if (tail && tail.amount >= MIN_ITEM_PRICE && plausiblePrice(text.slice(tail.index).trim())) {
      const rawName = text.slice(0, tail.index);
      const named = rawName.match(nameQtySuffixRe);
      const name = trimNoise(cleanName(named ? named[1] : rawName));
      if (looksLikeName(name)) {
        const qty = named ? Number(named[2]) : 1;
        if (qty > 1 && tail.amount % qty === 0) {
          items.push({ name, qty, unitPrice: tail.amount / qty, lineTotal: tail.amount, row: idx, suspect: false });
        } else {
          items.push({
            name: qty > 1 ? `${name} x${qty}` : name,
            qty: 1,
            unitPrice: tail.amount,
            lineTotal: tail.amount,
            row: idx,
            suspect: qty > 1,
            note: qty > 1 ? `harga total ${tail.amount} tidak habis dibagi jumlah ${qty}` : undefined,
          });
        }
        if (pendingName) ignored.push(pendingName.name); // nama tanpa harga yang ternyata bukan menu (kepala struk)
        pendingName = null;
        return;
      }
      // Tidak ada nama di baris ini, tetapi baris sebelumnya adalah nama tanpa harga: pakai itu
      if (pendingName) {
        items.push({ name: pendingName.name, qty: 1, unitPrice: tail.amount, lineTotal: tail.amount, row: idx, suspect: true, note: NOTE_QTY_UNREADABLE });
        pendingName = null;
        return;
      }
    }

    // 2e) Baris tanpa harga: kemungkinan nama menu yang harganya di baris berikutnya, atau kepala struk
    const name = trimNoise(cleanName(text));
    if (!tail && name.length >= 3 && looksLikeName(name)) {
      if (pendingName) ignored.push(pendingName.name);
      pendingName = { name, row: idx };
    } else if (row.text.trim()) {
      ignored.push(row.text);
    }
  });

  // Pembulatan tanpa tanda: arahnya ditentukan dari selisih terhadap total tertulis
  const itemsSum = items.reduce((a, i) => a + i.lineTotal, 0);
  const base = subtotal ?? itemsSum;
  const charged = base + service + (taxIncluded ? 0 : tax) - discount;
  const writtenTotal = pickTotal(totals, charged, rounding);
  if (rounding !== 0 && !roundingSigned && writtenTotal !== null) {
    const residual = writtenTotal - charged;
    if (Math.abs(residual) === Math.abs(rounding)) rounding = residual;
  }

  const expectedTotal = charged + rounding;
  const reconciled = writtenTotal === null ? null : writtenTotal === expectedTotal;

  if (items.length === 0) warnings.push('Tidak ada menu yang terbaca. Coba foto lebih dekat dan terang, atau isi manual.');
  if (subtotal !== null && itemsSum !== subtotal) {
    warnings.push(`Jumlah menu ${itemsSum} tidak sama dengan subtotal di struk ${subtotal} (selisih ${subtotal - itemsSum}).`);
  }
  if (writtenTotal === null) {
    warnings.push('Baris total tidak ditemukan, jadi hitungan tidak bisa dicocokkan.');
  } else if (!reconciled) {
    warnings.push(`Total di struk ${writtenTotal} tidak sama dengan hitungan ${expectedTotal} (selisih ${writtenTotal - expectedTotal}).`);
  }
  if (taxIncluded) warnings.push('Pajak tertulis sudah termasuk di harga, jadi tidak ditambahkan lagi.');
  for (const it of items) {
    if (it.suspect) warnings.push(`Cek "${it.name}": ${it.note ?? 'angkanya tidak konsisten'}.`);
  }

  // Saran satu digit: bila satu angka menu diubah satu digit saja bisa mencocokkan subtotal
  const suggestions: Suggestion[] = [];
  const target = subtotal ?? (writtenTotal !== null ? writtenTotal - service - (taxIncluded ? 0 : tax) + discount - rounding : null);
  if (target !== null && target !== itemsSum) {
    const delta = target - itemsSum;
    items.forEach((it, i) => {
      const to = it.lineTotal + delta;
      if (to > 0 && hamming(String(it.lineTotal), String(to)) === 1) {
        suggestions.push({ item: i, from: it.lineTotal, to });
      }
    });
    // Bila banyak menu sama-sama memenuhi syarat, saran tidak informatif: lebih baik tidak menebak
    if (suggestions.length > 1) suggestions.length = 0;
  }

  return {
    items,
    subtotal,
    serviceAmount: service,
    taxAmount: taxIncluded ? 0 : tax,
    discountAmount: discount,
    roundingAmount: rounding,
    total: writtenTotal,
    taxIncluded,
    itemsSum,
    expectedTotal,
    reconciled,
    warnings,
    suggestions,
    ignored,
  };
}

/** Beberapa baris bertuliskan "total": ambil yang paling cocok dengan hitungan, kalau tidak ada ambil yang terakhir. */
function pickTotal(totals: number[], charged: number, rounding: number): number | null {
  if (totals.length === 0) return null;
  const fit = totals.find((t) => t === charged + rounding || t === charged + Math.abs(rounding) || t === charged - Math.abs(rounding));
  return fit ?? totals[totals.length - 1];
}
