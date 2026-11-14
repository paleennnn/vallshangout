import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SplitError,
  computeBillShares,
  formatIDR,
  computeCharges,
  toFinalizePayload,
  type Bill,
  type Money,
} from '@/lib/engine/split';
import { remainingBalances, settleUp, settlementMessage, toTransfersPayload } from '@/lib/engine/settle';
import type {
  AssignmentRow,
  BillItemRow,
  BillRow,
  BillsBundle,
  BillShareRow,
  Participant,
  TransferRow,
} from '@/lib/supabase/types';

/**
 * Lapisan data patungan di room. Perhitungan memakai mesin murni di lib/engine; server hanya
 * memvalidasi (finalize_bill, replace_transfers), jadi di sini hanya menyusun data lalu memanggil RPC.
 */

export const MAX_ITEMS_PER_BILL = 60;
export const MAX_PORTIONS = 4;

export const EMPTY_BUNDLE: BillsBundle = { bills: [], items: [], assignments: [], shares: [], transfers: [] };

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

const BILL_COLUMNS =
  'id,hangout_id,title,paid_by,service_pct,tax_pct,service_amount,tax_amount,discount_amount,rounding_amount,status,created_at';

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

export async function fetchBillsBundle(sb: SupabaseClient, hangoutId: string): Promise<BillsBundle> {
  const [bills, items, assignments, shares, transfers] = await Promise.all([
    sb.from('bills').select(BILL_COLUMNS).eq('hangout_id', hangoutId).order('created_at'),
    sb.from('bill_items').select('id,bill_id,name,unit_price,qty,sort_order,created_at').eq('hangout_id', hangoutId).order('sort_order').order('created_at'),
    sb.from('bill_item_assignments').select('item_id,participant_id,shares').eq('hangout_id', hangoutId),
    sb.from('bill_shares').select('bill_id,participant_id,subtotal,service_amount,tax_amount,discount_amount,rounding_amount,total').eq('hangout_id', hangoutId),
    sb.from('transfers').select('id,from_participant,to_participant,amount,status').eq('hangout_id', hangoutId).order('created_at'),
  ]);
  return {
    bills: (check(bills, 'Gagal memuat tagihan') as BillRow[] | null) ?? [],
    items: (check(items, 'Gagal memuat pesanan') as BillItemRow[] | null) ?? [],
    // numeric dari PostgREST bisa berupa teks pada sebagian konfigurasi; pastikan angka
    assignments: ((check(assignments, 'Gagal memuat tanda pesanan') as AssignmentRow[] | null) ?? []).map((a) => ({
      ...a,
      shares: Number(a.shares),
    })),
    shares: (check(shares, 'Gagal memuat hasil bagi') as BillShareRow[] | null) ?? [],
    transfers: (check(transfers, 'Gagal memuat transfer') as TransferRow[] | null) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Tagihan
// ---------------------------------------------------------------------------

export interface NewBillInput {
  title: string;
  paidBy: string;
  servicePct: number | null;
  taxPct: number | null;
}

export function validateNewBill(input: NewBillInput): string | null {
  const title = input.title.trim();
  if (!title) return 'Nama tagihan wajib diisi.';
  if (title.length > 80) return 'Nama tagihan maksimal 80 karakter.';
  if (!input.paidBy) return 'Pilih siapa yang bayar ke kasir.';
  for (const pct of [input.servicePct, input.taxPct]) {
    if (pct !== null && !(pct >= 0 && pct <= 100)) return 'Persen harus antara 0 dan 100.';
  }
  return null;
}

export async function createBill(sb: SupabaseClient, hangoutId: string, input: NewBillInput): Promise<BillRow> {
  const problem = validateNewBill(input);
  if (problem) throw new Error(problem);
  const res = await sb
    .from('bills')
    .insert({
      hangout_id: hangoutId,
      title: input.title.trim(),
      paid_by: input.paidBy,
      service_pct: input.servicePct,
      tax_pct: input.taxPct,
    })
    .select(BILL_COLUMNS)
    .single();
  return check(res, 'Gagal membuat tagihan') as BillRow;
}

export interface BillChargesPatch {
  paid_by?: string;
  service_pct?: number | null;
  tax_pct?: number | null;
  service_amount?: Money;
  tax_amount?: Money;
  discount_amount?: Money;
  rounding_amount?: Money;
}

export async function updateBill(sb: SupabaseClient, billId: string, patch: BillChargesPatch): Promise<void> {
  const res = await sb.from('bills').update(patch).eq('id', billId).select('id');
  const rows = check(res, 'Gagal menyimpan tagihan') as { id: string }[] | null;
  if (!rows || rows.length === 0) throw new Error('Tagihan tidak bisa diubah (mungkin sudah final).');
}

export async function deleteBill(sb: SupabaseClient, billId: string): Promise<void> {
  const res = await sb.from('bills').delete().eq('id', billId).eq('status', 'draft').select('id');
  const rows = check(res, 'Gagal menghapus tagihan') as { id: string }[] | null;
  if (!rows || rows.length === 0) throw new Error('Hanya tagihan yang masih draft yang bisa dihapus.');
}

// ---------------------------------------------------------------------------
// Pesanan dan tanda "siapa makan apa"
// ---------------------------------------------------------------------------

export interface NewItemInput {
  name: string;
  unitPrice: Money;
  qty: number;
}

export function validateItem(input: NewItemInput): string | null {
  const name = input.name.trim();
  if (!name) return 'Nama menu wajib diisi.';
  if (name.length > 100) return 'Nama menu maksimal 100 karakter.';
  if (!Number.isSafeInteger(input.unitPrice) || input.unitPrice <= 0) return 'Harga harus lebih dari 0.';
  if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 99) return 'Jumlah harus 1 sampai 99.';
  return null;
}

export async function addItem(
  sb: SupabaseClient,
  hangoutId: string,
  billId: string,
  input: NewItemInput,
  sortOrder: number,
): Promise<BillItemRow> {
  const problem = validateItem(input);
  if (problem) throw new Error(problem);
  const res = await sb
    .from('bill_items')
    .insert({
      hangout_id: hangoutId,
      bill_id: billId,
      name: input.name.trim(),
      unit_price: input.unitPrice,
      qty: input.qty,
      sort_order: sortOrder,
    })
    .select('id,bill_id,name,unit_price,qty,sort_order,created_at')
    .single();
  return check(res, 'Gagal menambah menu') as BillItemRow;
}

/** Menyimpan banyak menu sekaligus (satu permintaan, jadi semuanya masuk atau tidak sama sekali). */
export async function addItems(
  sb: SupabaseClient,
  hangoutId: string,
  billId: string,
  inputs: NewItemInput[],
  firstSortOrder: number,
  existingCount = 0,
): Promise<BillItemRow[]> {
  if (inputs.length === 0) throw new Error('Tidak ada menu untuk disimpan.');
  if (existingCount + inputs.length > MAX_ITEMS_PER_BILL) {
    throw new Error(`Satu tagihan maksimal ${MAX_ITEMS_PER_BILL} menu (sekarang ${existingCount}, akan ditambah ${inputs.length}).`);
  }
  for (const [i, it] of inputs.entries()) {
    const problem = validateItem(it);
    if (problem) throw new Error(`Menu ke-${i + 1}: ${problem}`);
  }
  const res = await sb
    .from('bill_items')
    .insert(
      inputs.map((it, i) => ({
        hangout_id: hangoutId,
        bill_id: billId,
        name: it.name.trim(),
        unit_price: it.unitPrice,
        qty: it.qty,
        sort_order: firstSortOrder + i,
      })),
    )
    .select('id,bill_id,name,unit_price,qty,sort_order,created_at');
  return (check(res, 'Gagal menyimpan menu') as BillItemRow[] | null) ?? [];
}

export async function updateItem(sb: SupabaseClient, itemId: string, input: NewItemInput): Promise<void> {
  const problem = validateItem(input);
  if (problem) throw new Error(problem);
  const res = await sb
    .from('bill_items')
    .update({ name: input.name.trim(), unit_price: input.unitPrice, qty: input.qty })
    .eq('id', itemId)
    .select('id');
  const rows = check(res, 'Gagal mengubah menu') as { id: string }[] | null;
  if (!rows || rows.length === 0) throw new Error('Menu tidak bisa diubah (mungkin tagihan sudah final).');
}

export async function deleteItem(sb: SupabaseClient, itemId: string): Promise<void> {
  check(await sb.from('bill_items').delete().eq('id', itemId), 'Gagal menghapus menu');
}

/** shares <= 0 menghapus tanda; selain itu menyimpan jumlah porsi (upsert per item dan peserta). */
export async function setAssignment(
  sb: SupabaseClient,
  hangoutId: string,
  itemId: string,
  participantId: string,
  shares: number,
): Promise<void> {
  if (shares <= 0) {
    check(
      await sb.from('bill_item_assignments').delete().eq('item_id', itemId).eq('participant_id', participantId),
      'Gagal menghapus tanda',
    );
    return;
  }
  check(
    await sb
      .from('bill_item_assignments')
      .upsert(
        { hangout_id: hangoutId, item_id: itemId, participant_id: participantId, shares },
        { onConflict: 'item_id,participant_id' },
      ),
    'Gagal menandai pesanan',
  );
}

// ---------------------------------------------------------------------------
// Hitung (murni, dipakai UI untuk pratinjau dan finalisasi)
// ---------------------------------------------------------------------------

export function billSubtotal(items: BillItemRow[]): Money {
  return items.reduce((acc, it) => acc + it.unit_price * it.qty, 0);
}

export function billGrandTotal(bill: BillRow, items: BillItemRow[]): Money {
  return (
    billSubtotal(items) + bill.service_amount + bill.tax_amount - bill.discount_amount + bill.rounding_amount
  );
}

/** Menu yang belum ditandai siapa pun (menghalangi finalisasi). */
export function unassignedItems(items: BillItemRow[], assignments: AssignmentRow[]): BillItemRow[] {
  const marked = new Set(assignments.map((a) => a.item_id));
  return items.filter((it) => !marked.has(it.id));
}

/** Peserta yang sudah menandai sedikitnya satu menu di tagihan ini (urutan kemunculan). */
export function billMarkers(assignments: AssignmentRow[]): string[] {
  return [...new Set(assignments.map((a) => a.participant_id))];
}

export interface ShareOptions {
  /** Bagi rata menu yang belum ditandai ke semua orang yang sudah menandai sesuatu. */
  shareUnassigned?: boolean;
}

function engineOptions(assignments: AssignmentRow[], opts?: ShareOptions) {
  return opts?.shareUnassigned
    ? { onUnassigned: 'everyone' as const, participantIds: billMarkers(assignments) }
    : {};
}

export function toEngineBill(bill: BillRow, items: BillItemRow[], assignments: AssignmentRow[]): Bill {
  return {
    items: items.map((it) => ({
      id: it.id,
      name: it.name,
      unitPrice: it.unit_price,
      qty: it.qty,
      assignments: assignments
        .filter((a) => a.item_id === it.id)
        .map((a) => ({ participantId: a.participant_id, shares: a.shares })),
    })),
    serviceAmount: bill.service_amount,
    taxAmount: bill.tax_amount,
    discountAmount: bill.discount_amount,
    roundingAmount: bill.rounding_amount,
  };
}

/** Pratinjau pembagian; mengembalikan pesan galat berbahasa Indonesia bila belum bisa dihitung. */
export function previewShares(
  bill: BillRow,
  items: BillItemRow[],
  assignments: AssignmentRow[],
  opts?: ShareOptions,
) {
  if (items.length === 0) return { ok: false as const, message: 'Belum ada menu di tagihan ini.' };
  try {
    return {
      ok: true as const,
      result: computeBillShares(toEngineBill(bill, items, assignments), engineOptions(assignments, opts)),
    };
  } catch (e) {
    return { ok: false as const, message: e instanceof SplitError ? e.message : 'Gagal menghitung pembagian.' };
  }
}

/** Service dan pajak dari persen untuk subtotal saat ini (hanya untuk mengisi angka struk). */
export function chargesFromPct(
  subtotal: Money,
  servicePct: number,
  taxPct: number,
  taxOnService: boolean,
  discountAmount: Money,
) {
  return computeCharges(subtotal, { servicePct, taxPct, taxOnService, discountAmount });
}

// ---------------------------------------------------------------------------
// Finalisasi dan rencana transfer
// ---------------------------------------------------------------------------

/**
 * Susun ulang rencana transfer dari saldo hangout (view hangout_balances) dikurangi transfer yang
 * sudah paid/confirmed. Rumusnya sama dengan validasi replace_transfers di server.
 */
export async function replanTransfers(sb: SupabaseClient, hangoutId: string): Promise<void> {
  const [balRes, trRes] = await Promise.all([
    sb.from('hangout_balances').select('participant_id,net').eq('hangout_id', hangoutId),
    sb.from('transfers').select('from_participant,to_participant,amount,status').eq('hangout_id', hangoutId),
  ]);
  const balances = ((check(balRes, 'Gagal memuat saldo') as { participant_id: string; net: number }[] | null) ?? []).map(
    (b) => ({ participantId: b.participant_id, net: Number(b.net) }),
  );
  const done = ((check(trRes, 'Gagal memuat transfer') as Pick<TransferRow, 'from_participant' | 'to_participant' | 'amount' | 'status'>[] | null) ?? [])
    .filter((t) => t.status !== 'pending')
    .map((t) => ({ from: t.from_participant, to: t.to_participant, amount: Number(t.amount) }));

  const plan = settleUp(remainingBalances(balances, done));
  check(
    await sb.rpc('replace_transfers', { p_hangout: hangoutId, p_transfers: toTransfersPayload(plan) }),
    'Gagal menyusun rencana transfer',
  );
}

/** Hitung di klien, finalisasi di server, lalu perbarui rencana transfer hangout. */
export async function finalizeBill(
  sb: SupabaseClient,
  bill: BillRow,
  items: BillItemRow[],
  assignments: AssignmentRow[],
  opts?: ShareOptions,
): Promise<void> {
  const missing = unassignedItems(items, assignments);
  if (missing.length > 0) {
    if (!opts?.shareUnassigned) {
      throw new Error(`Masih ada menu yang belum ditandai: ${missing.map((m) => m.name).join(', ')}.`);
    }
    if (billMarkers(assignments).length === 0) {
      throw new Error('Belum ada yang menandai menu apa pun, jadi menu tidak bisa dibagi rata.');
    }
  }
  let payload;
  try {
    payload = toFinalizePayload(
      computeBillShares(toEngineBill(bill, items, assignments), engineOptions(assignments, opts)).shares,
    );
  } catch (e) {
    throw new Error(e instanceof SplitError ? e.message : 'Gagal menghitung pembagian.');
  }
  check(await sb.rpc('finalize_bill', { p_bill: bill.id, p_shares: payload }), 'Gagal memfinalkan tagihan');
  try {
    await replanTransfers(sb, bill.hangout_id);
  } catch (e) {
    throw new Error(
      `Tagihan sudah final, tetapi rencana transfer belum diperbarui (${e instanceof Error ? e.message : 'galat'}). Tekan "Hitung ulang transfer".`,
    );
  }
}

/** Buka kembali bill final (membuang hasil bagi), lalu perbarui rencana transfer. */
export async function reopenBill(sb: SupabaseClient, bill: BillRow): Promise<void> {
  const res = await sb.from('bills').update({ status: 'draft' }).eq('id', bill.id).select('id');
  const rows = check(res, 'Gagal membuka tagihan') as { id: string }[] | null;
  if (!rows || rows.length === 0) throw new Error('Tagihan tidak bisa dibuka kembali.');
  await replanTransfers(sb, bill.hangout_id);
}

export async function setTransferStatus(
  sb: SupabaseClient,
  transferId: string,
  status: TransferRow['status'],
): Promise<void> {
  const res = await sb.from('transfers').update({ status }).eq('id', transferId).select('id');
  const rows = check(res, 'Gagal mengubah status transfer') as { id: string }[] | null;
  if (!rows || rows.length === 0) throw new Error('Status transfer tidak bisa diubah.');
}

// ---------------------------------------------------------------------------
// Teks untuk dibagikan
// ---------------------------------------------------------------------------

/**
 * Teks siap tempel ke grup WhatsApp, formatnya sama dengan kalkulator: judul, total, bagian tiap
 * orang (dijumlah dari semua tagihan final), lalu transfer yang belum dikonfirmasi lunas.
 */
export function buildWhatsappText(opts: {
  title: string;
  shares: Pick<BillShareRow, 'participant_id' | 'total'>[];
  transfers: Pick<TransferRow, 'from_participant' | 'to_participant' | 'amount' | 'status'>[];
  nameOf: (participantId: string) => string;
  payInfo?: string;
}): string {
  const perPerson = new Map<string, number>();
  for (const s of opts.shares) perPerson.set(s.participant_id, (perPerson.get(s.participant_id) ?? 0) + Number(s.total));
  const total = [...perPerson.values()].reduce((a, b) => a + b, 0);

  const head =
    perPerson.size > 0
      ? [
          `*${opts.title}*`,
          `Total ${formatIDR(total)}`,
          ...[...perPerson].map(([id, t]) => `- ${opts.nameOf(id)}: ${formatIDR(t)}`),
          '',
        ]
      : [];

  return [
    ...head,
    settlementMessage({
      ...(perPerson.size > 0 ? {} : { title: opts.title }),
      transfers: opts.transfers
        .filter((t) => t.status !== 'confirmed')
        .map((t) => ({ from: t.from_participant, to: t.to_participant, amount: Number(t.amount) })),
      nameOf: opts.nameOf,
      payInfo: opts.payInfo?.trim() || undefined,
    }),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Hak menandai (aturan antarmuka; server mengizinkan semua anggota)
// ---------------------------------------------------------------------------

/**
 * Atas nama siapa seseorang boleh menandai pesanan: dirinya sendiri dan teman tanpa akun;
 * host boleh untuk semua orang. Server mengizinkan semua anggota, jadi ini aturan kesopanan di UI.
 */
export function markableParticipants(participants: Participant[], me: Participant | undefined, isHost: boolean): Participant[] {
  if (isHost) return participants;
  return participants.filter((p) => p.id === me?.id || p.user_id === null);
}
