'use client';

import { useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { MoneyInput } from '@/components/calculator/MoneyInput';
import { formatIDR } from '@/lib/engine/split';
import { MAX_PORTIONS, validateItem } from '@/lib/room/bills';
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
  canDelete,
  onSet,
  onDelete,
}: {
  item: BillItemRow;
  eaters: AssignmentRow[];
  participants: Participant[];
  active: Participant | undefined;
  activeIsMe: boolean;
  canDelete: boolean;
  onSet: (shares: number) => void;
  onDelete: () => void;
}) {
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? 'seseorang';
  const mine = active ? (eaters.find((a) => a.participant_id === active.id)?.shares ?? 0) : 0;
  const max = Math.max(MAX_PORTIONS, item.qty);

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
          {canDelete && (
            <button type="button" aria-label={`Hapus ${item.name}`} onClick={onDelete} className="grid h-11 w-11 place-items-center rounded-control text-muted hover:bg-sand">
              <Trash2 size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {eaters.length === 0 ? (
        <p className="text-sm text-warning">Belum ada yang menandai.</p>
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

/** Form tambah menu (siapa pun yang ikut boleh menambah menu yang terlewat). */
export function AddItemForm({
  busy,
  onAdd,
  onCancel,
}: {
  busy: boolean;
  onAdd: (input: { name: string; unitPrice: number; qty: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const input = { name, unitPrice: price ?? 0, qty };
    const problem = validateItem(input);
    if (problem) return setError(problem);
    setError(null);
    await onAdd(input);
    setName('');
    setPrice(null);
    setQty(1);
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
        <button type="button" className={primary} disabled={busy} onClick={submit}>Tambah menu</button>
      </div>
    </div>
  );
}
