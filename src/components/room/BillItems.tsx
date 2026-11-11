'use client';

import { useState } from 'react';
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { MoneyInput } from '@/components/calculator/MoneyInput';
import { formatIDR } from '@/lib/engine/split';
import { MAX_PORTIONS, validateItem, type NewItemInput } from '@/lib/room/bills';
import type { AssignmentRow, BillItemRow, Participant } from '@/lib/supabase/types';
import { field, primary, secondary } from './ui';

const iconBtn = 'grid h-11 w-11 place-items-center rounded-control bg-sand hover:bg-sand-strong disabled:opacity-50';

/** Satu menu: siapa saja yang menandainya, plus kontrol menandai atas nama `active`. */
export function ItemRow({
  item,
  eaters,
  participants,
  active,
  activeIsMe,
  canManage,
  sharedEvenly,
  onSet,
  onEdit,
  onDelete,
}: {
  item: BillItemRow;
  eaters: AssignmentRow[];
  participants: Participant[];
  active: Participant | undefined;
  activeIsMe: boolean;
  /** Host atau yang bayar ke kasir: boleh mengubah dan menghapus menu. */
  canManage: boolean;
  /** Menu yang belum ditandai akan dibagi rata saat difinalkan. */
  sharedEvenly: boolean;
  onSet: (shares: number) => void;
  /** Mengembalikan true bila tersimpan, supaya form ditutup hanya saat berhasil. */
  onEdit: (input: NewItemInput) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? 'seseorang';
  const mine = active ? (eaters.find((a) => a.participant_id === active.id)?.shares ?? 0) : 0;
  const max = Math.max(MAX_PORTIONS, item.qty);

  if (editing) {
    return (
      <li>
        <ItemForm
          initial={{ name: item.name, unitPrice: item.unit_price, qty: item.qty }}
          submitLabel="Simpan menu"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            const ok = await onEdit(input);
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold">{item.name}</p>
          <p className="text-sm tabular-nums text-muted">
            {formatIDR(item.unit_price)} × {item.qty}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="font-semibold tabular-nums">{formatIDR(item.unit_price * item.qty)}</span>
          {canManage && (
            <>
              <button type="button" aria-label={`Ubah ${item.name}`} onClick={() => setEditing(true)} className="grid h-11 w-11 place-items-center rounded-control text-muted hover:bg-sand">
                <Pencil size={18} aria-hidden="true" />
              </button>
              <button type="button" aria-label={`Hapus ${item.name}`} onClick={onDelete} className="grid h-11 w-11 place-items-center rounded-control text-muted hover:bg-sand">
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      {eaters.length === 0 ? (
        sharedEvenly ? (
          <p className="text-sm text-muted">Belum ditandai, dibagi rata saat difinalkan.</p>
        ) : (
          <p className="text-sm text-warning">Belum ada yang menandai.</p>
        )
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Yang menandai ${item.name}`}>
          {eaters.map((a) => (
            <li key={a.participant_id} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-sm text-brand-ink">
              {nameOf(a.participant_id)}
              {a.shares > 1 ? ` ×${a.shares}` : ''}
            </li>
          ))}
        </ul>
      )}

      {active &&
        (mine === 0 ? (
          <button type="button" className={`${secondary} w-full`} onClick={() => onSet(1)}>
            {activeIsMe ? 'Aku pesan ini' : `Tandai untuk ${active.name}`}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" aria-label={`Kurangi porsi ${active.name}`} className={iconBtn} onClick={() => onSet(mine - 1)}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <span className="min-w-0 flex-1 text-center text-sm font-semibold tabular-nums">
              {activeIsMe ? 'Porsimu' : `Porsi ${active.name}`}: {mine}
            </span>
            <button type="button" aria-label={`Tambah porsi ${active.name}`} className={iconBtn} disabled={mine >= max} onClick={() => onSet(mine + 1)}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
    </li>
  );
}

/** Form menu: dipakai untuk menambah (kosong) dan mengubah (`initial` terisi). */
export function ItemForm({
  initial,
  submitLabel,
  busy = false,
  onSubmit,
  onCancel,
}: {
  initial?: NewItemInput;
  submitLabel: string;
  busy?: boolean;
  /** Mengembalikan true bila berhasil; form tambah baru dikosongkan hanya saat berhasil. */
  onSubmit: (input: NewItemInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState<number | null>(initial?.unitPrice ?? null);
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const input = { name, unitPrice: price ?? 0, qty };
    const problem = validateItem(input);
    if (problem) return setError(problem);
    setError(null);
    const ok = await onSubmit(input);
    if (ok && !initial) {
      setName('');
      setPrice(null);
      setQty(1);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-line-strong p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        placeholder="Nama menu"
        aria-label="Nama menu"
        className={field}
      />
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <MoneyInput value={price} onChange={setPrice} placeholder="Harga satuan" ariaLabel="Harga satuan" className="h-11" />
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Kurangi jumlah" className={iconBtn} onClick={() => setQty((q) => Math.max(1, q - 1))}>
            <Minus size={16} aria-hidden="true" />
          </button>
          <span className="min-w-8 text-center tabular-nums" aria-label="Jumlah">{qty}</span>
          <button type="button" aria-label="Tambah jumlah" className={iconBtn} onClick={() => setQty((q) => Math.min(99, q + 1))}>
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={secondary} onClick={onCancel}>Batal</button>
        <button type="button" className={primary} disabled={busy} onClick={submit}>{submitLabel}</button>
      </div>
    </div>
  );
}
