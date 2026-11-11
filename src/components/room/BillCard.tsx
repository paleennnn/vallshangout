'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, LockOpen, Plus } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';
import { errorMessage } from '@/lib/errors';
import { formatIDR } from '@/lib/engine/split';
import {
  addItem,
  billGrandTotal,
  billMarkers,
  billSubtotal,
  deleteBill,
  deleteItem,
  finalizeBill,
  markableParticipants,
  previewShares,
  reopenBill,
  unassignedItems,
  updateBill,
  updateItem,
  type BillChargesPatch,
} from '@/lib/room/bills';
import type { AssignmentRow, BillItemRow, BillRow, BillShareRow, Participant } from '@/lib/supabase/types';
import { BillChargesEditor } from './BillCharges';
import { ItemForm, ItemRow } from './BillItems';
import { dangerBtn, field, fieldLabel, primary, secondary } from './ui';

interface ShareLine {
  participantId: string;
  total: number;
  subtotal: number;
  serviceAmount: number;
  taxAmount: number;
  discountAmount: number;
  roundingAmount: number;
}

function ShareList({ lines, nameOf, meId, payerId }: { lines: ShareLine[]; nameOf: (id: string) => string; meId?: string; payerId: string }) {
  return (
    <ul className="space-y-2">
      {lines.map((s) => (
        <li key={s.participantId} className={`rounded-xl p-3 ${s.participantId === meId ? 'bg-brand-soft' : 'bg-surface'} border border-line`}>
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium">
              {nameOf(s.participantId)}
              {s.participantId === meId && <span className="ml-2 text-xs text-muted">(kamu)</span>}
              {s.participantId === payerId && <span className="ml-2 rounded bg-sand px-1.5 py-0.5 text-xs text-muted">talangin</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{formatIDR(s.total)}</span>
          </div>
          <p className="mt-1 text-xs tabular-nums text-muted">
            Pesanan {formatIDR(s.subtotal)} + service {formatIDR(s.serviceAmount)} + pajak {formatIDR(s.taxAmount)}
            {s.discountAmount ? ` - diskon ${formatIDR(s.discountAmount)}` : ''}
            {s.roundingAmount ? ` ${s.roundingAmount > 0 ? '+' : '-'} pembulatan ${formatIDR(Math.abs(s.roundingAmount))}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Satu tagihan: draft (semua orang menandai pesanan) atau final (hasil bagi). */
export function BillCard({
  bill,
  items,
  assignments,
  shares,
  participants,
  me,
  isHost,
  defaultTaxOnService,
  onMark,
  onChanged,
}: {
  bill: BillRow;
  items: BillItemRow[];
  assignments: AssignmentRow[];
  shares: BillShareRow[];
  participants: Participant[];
  me: Participant | undefined;
  isHost: boolean;
  defaultTaxOnService: boolean;
  onMark: (itemId: string, participantId: string, shares: number) => void;
  onChanged: () => void;
}) {
  const { supabase } = useSupabase();
  const isDraft = bill.status === 'draft';
  const [open, setOpen] = useState(isDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareRest, setShareRest] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>(me?.id);

  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? 'seseorang';
  const canManage = isHost || (!!me && bill.paid_by === me.id);
  const markable = markableParticipants(participants, me, isHost);
  const active = markable.find((p) => p.id === activeId) ?? markable.find((p) => p.id === me?.id) ?? markable[0];

  const subtotal = billSubtotal(items);
  const grand = billGrandTotal(bill, items);
  const missing = unassignedItems(items, assignments);
  const markers = billMarkers(assignments);
  const sharing = shareRest && missing.length > 0 && markers.length > 0;
  const preview = useMemo(
    () => previewShares(bill, items, assignments, { shareUnassigned: shareRest }),
    [bill, items, assignments, shareRest],
  );

  /** Menjalankan aksi; true bila berhasil (dipakai form agar hanya menutup saat sukses). */
  async function run(action: () => Promise<void>): Promise<boolean> {
    if (!supabase) return false;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(errorMessage(e, 'Terjadi kesalahan'));
      return false;
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  const shareLines: ShareLine[] = isDraft
    ? preview.ok
      ? preview.result.shares.map((s) => ({ ...s }))
      : []
    : shares.map((s) => ({
        participantId: s.participant_id,
        total: s.total,
        subtotal: s.subtotal,
        serviceAmount: s.service_amount,
        taxAmount: s.tax_amount,
        discountAmount: s.discount_amount,
        roundingAmount: s.rounding_amount,
      }));
  const myShare = me ? shareLines.find((s) => s.participantId === me.id) : undefined;

  return (
    <div className="space-y-3 rounded-xl border border-line bg-cream p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{bill.title}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${isDraft ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'}`}>
              {isDraft ? 'Draft' : 'Final'}
            </span>
          </span>
          <span className="block text-sm text-muted">Dibayar oleh {nameOf(bill.paid_by)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-bold tabular-nums">{formatIDR(grand)}</span>
          {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
        </span>
      </button>

      {open && (
        <div className="space-y-3">
          {myShare && (
            <div className="flex items-baseline justify-between rounded-xl bg-brand-soft px-3 py-2 text-brand-ink">
              <span className="text-sm">{isDraft ? 'Bagianmu sementara' : 'Bagianmu'}</span>
              <span className="text-lg font-bold tabular-nums">{formatIDR(myShare.total)}</span>
            </div>
          )}

          {isDraft && (
            <>
              {markable.length > 1 && (
                <label className="block space-y-1">
                  <span className={fieldLabel}>Menandai atas nama</span>
                  <select value={active?.id ?? ''} onChange={(e) => setActiveId(e.target.value)} className={field}>
                    {markable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id === me?.id ? `${p.name} (kamu)` : p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {markable.length === 0 && <p className="text-sm text-muted">Hanya peserta hangout yang bisa menandai pesanan.</p>}

              {items.length === 0 && <p className="text-sm text-muted">Belum ada menu. Tambahkan menu dari struk.</p>}
              <ul className="space-y-2">
                {items.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    eaters={assignments.filter((a) => a.item_id === it.id)}
                    participants={participants}
                    active={active}
                    activeIsMe={!!active && active.id === me?.id}
                    canManage={canManage}
                    sharedEvenly={sharing}
                    onSet={(n) => active && onMark(it.id, active.id, n)}
                    onEdit={(input) => run(() => updateItem(supabase!, it.id, input))}
                    onDelete={() => void run(() => deleteItem(supabase!, it.id))}
                  />
                ))}
              </ul>

              {me &&
                (adding ? (
                  <ItemForm
                    submitLabel="Tambah menu"
                    busy={busy}
                    onCancel={() => setAdding(false)}
                    onSubmit={(input) =>
                      run(async () => {
                        const next = items.reduce((m, it) => Math.max(m, it.sort_order), -1) + 1;
                        await addItem(supabase!, bill.hangout_id, bill.id, input, next);
                      })
                    }
                  />
                ) : (
                  <button type="button" className={`${secondary} w-full`} onClick={() => setAdding(true)}>
                    <Plus size={16} aria-hidden="true" />
                    Tambah menu
                  </button>
                ))}
            </>
          )}

          <dl className="space-y-1 text-sm tabular-nums">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatIDR(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Service</dt><dd>{formatIDR(bill.service_amount)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Pajak</dt><dd>{formatIDR(bill.tax_amount)}</dd></div>
            {bill.discount_amount > 0 && <div className="flex justify-between"><dt className="text-muted">Diskon</dt><dd>- {formatIDR(bill.discount_amount)}</dd></div>}
            {bill.rounding_amount !== 0 && <div className="flex justify-between"><dt className="text-muted">Pembulatan</dt><dd>{bill.rounding_amount > 0 ? '+' : '-'} {formatIDR(Math.abs(bill.rounding_amount))}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd>{formatIDR(grand)}</dd></div>
          </dl>

          {isDraft && canManage && (
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer py-2.5 font-medium">Ubah service, pajak, diskon</summary>
              <BillChargesEditor
                key={`${bill.service_amount}-${bill.tax_amount}-${bill.discount_amount}-${bill.rounding_amount}`}
                bill={bill}
                subtotal={subtotal}
                defaultTaxOnService={defaultTaxOnService}
                busy={busy}
                onSave={async (patch: BillChargesPatch) => {
                  await run(() => updateBill(supabase!, bill.id, patch));
                }}
              />
            </details>
          )}

          {shareLines.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted">{isDraft ? 'Pembagian sementara' : 'Pembagian'}</h3>
              <ShareList lines={shareLines} nameOf={nameOf} meId={me?.id} payerId={bill.paid_by} />
            </div>
          )}
          {isDraft && !preview.ok && items.length > 0 && missing.length === 0 && (
            <p role="alert" className="text-sm text-warning">{preview.message}</p>
          )}
          {isDraft && missing.length > 0 && !sharing && (
            <p className="text-sm text-warning">
              Belum ditandai siapa pun: {missing.map((m) => m.name).join(', ')}.
            </p>
          )}
          {isDraft && missing.length > 0 && canManage && (
            <label className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
              <input
                type="checkbox"
                checked={shareRest}
                disabled={markers.length === 0}
                onChange={(e) => setShareRest(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
              />
              <span>
                <span className="font-medium">Bagi rata menu yang belum ditandai</span>
                <span className="block text-muted">
                  {markers.length === 0
                    ? 'Menunggu sedikitnya satu orang menandai pesanannya.'
                    : `Dibagi sama rata ke ${markers.length} orang yang sudah menandai: ${markers.map(nameOf).join(', ')}.`}
                </span>
              </span>
            </label>
          )}

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          {isDraft && canManage && (
            <div className="space-y-2">
              <button
                type="button"
                className={`${primary} w-full`}
                disabled={busy || !preview.ok}
                onClick={() => void run(() => finalizeBill(supabase!, bill, items, assignments, { shareUnassigned: shareRest }))}
              >
                Finalkan dan hitung transfer
              </button>
              {confirmDelete ? (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={secondary} onClick={() => setConfirmDelete(false)}>Batal</button>
                  <button type="button" className={dangerBtn} disabled={busy} onClick={() => void run(() => deleteBill(supabase!, bill.id))}>
                    Ya, hapus
                  </button>
                </div>
              ) : (
                <button type="button" className={`${dangerBtn} w-full`} onClick={() => setConfirmDelete(true)}>
                  Hapus tagihan
                </button>
              )}
            </div>
          )}
          {isDraft && !canManage && (
            <p className="text-sm text-muted">
              {nameOf(bill.paid_by)} atau host yang memfinalkan tagihan ini setelah semua menu ditandai.
            </p>
          )}

          {!isDraft && canManage && (
            <button type="button" className={`${secondary} w-full`} disabled={busy} onClick={() => void run(() => reopenBill(supabase!, bill))}>
              <LockOpen size={16} aria-hidden="true" />
              Buka kembali untuk diubah
            </button>
          )}
        </div>
      )}
    </div>
  );
}
