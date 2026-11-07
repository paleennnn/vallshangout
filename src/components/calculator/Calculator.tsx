'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  SplitError,
  computeBillShares,
  computeCharges,
  formatIDR,
  type Bill,
  type BillShare,
} from '@/lib/engine/split';
import { balancesFromBills, settleUp, settlementMessage, type Transfer } from '@/lib/engine/settle';
import { MoneyInput } from './MoneyInput';
import {
  emptyState,
  exampleState,
  loadState,
  parsePct,
  saveState,
  uid,
  type CalcState,
  type Line,
} from './state';

const MAX_PORTIONS = 4;

type Result =
  | { ok: true; shares: BillShare[]; grandTotal: number; subtotal: number; transfers: Transfer[] }
  | { ok: false; message: string };

export function Calculator() {
  const [state, setState] = useState<CalcState>(emptyState);
  const [hydrated, setHydrated] = useState(false);
  const [newName, setNewName] = useState('');
  const [payInfo, setPayInfo] = useState('');
  const [copied, setCopied] = useState(false);

  // Muat dari perangkat setelah mount (menghindari mismatch hidrasi SSR).
  useEffect(() => {
    const saved = loadState();
    if (saved) setState(saved);
    setPayInfo(localStorage.getItem('vh:payinfo') ?? '');
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);
  useEffect(() => {
    if (hydrated) localStorage.setItem('vh:payinfo', payInfo);
  }, [payInfo, hydrated]);

  const patch = (p: Partial<CalcState>) => setState((s) => ({ ...s, ...p }));
  const nameOf = (id: string) => state.people.find((p) => p.id === id)?.name ?? '?';

  // ── orang ──
  function addPerson() {
    const name = newName.trim();
    if (!name) return;
    const id = uid();
    setState((s) => ({ ...s, people: [...s.people, { id, name }], paidBy: s.paidBy ?? id }));
    setNewName('');
  }
  function removePerson(id: string) {
    setState((s) => {
      const people = s.people.filter((p) => p.id !== id);
      return {
        ...s,
        people,
        paidBy: s.paidBy === id ? (people[0]?.id ?? null) : s.paidBy,
        items: s.items.map((it) => {
          const { [id]: _removed, ...eaters } = it.eaters;
          return { ...it, eaters };
        }),
      };
    });
  }

  // ── item ──
  const updateItem = (id: string, p: Partial<Line>) =>
    setState((s) => ({ ...s, items: s.items.map((it) => (it.id === id ? { ...it, ...p } : it)) }));
  const addItem = () =>
    setState((s) => ({ ...s, items: [...s.items, { id: uid(), name: '', price: 0, qty: 1, eaters: {} }] }));
  const removeItem = (id: string) => setState((s) => ({ ...s, items: s.items.filter((it) => it.id !== id) }));

  /** Ketuk: tidak ikut -> 1 porsi -> 2 -> ... -> tidak ikut. */
  function cyclePortion(item: Line, personId: string) {
    const next = ((item.eaters[personId] ?? 0) + 1) % (MAX_PORTIONS + 1);
    const eaters = { ...item.eaters };
    if (next === 0) delete eaters[personId];
    else eaters[personId] = next;
    updateItem(item.id, { eaters });
  }
  function toggleEveryone(item: Line) {
    const all = state.people.every((p) => item.eaters[p.id]);
    updateItem(item.id, { eaters: all ? {} : Object.fromEntries(state.people.map((p) => [p.id, 1])) });
  }

  // ── hitung ──
  const filledItems = state.items.filter((it) => it.price > 0);
  const subtotal = filledItems.reduce((a, it) => a + it.price * it.qty, 0);
  const auto = useMemo(
    () =>
      computeCharges(subtotal, {
        servicePct: parsePct(state.servicePct),
        taxPct: parsePct(state.taxPct),
        taxOnService: state.taxOnService,
        discountAmount: state.discount,
      }),
    [subtotal, state.servicePct, state.taxPct, state.taxOnService, state.discount],
  );
  const serviceAmount = state.serviceOverride ?? auto.serviceAmount;
  const taxAmount = state.taxOverride ?? auto.taxAmount;

  const result: Result | null = useMemo(() => {
    if (state.people.length < 2 || filledItems.length === 0 || !state.paidBy) return null;
    try {
      const bill: Bill = {
        items: filledItems.map((it) => ({
          id: it.id,
          name: it.name || 'Item tanpa nama',
          unitPrice: it.price,
          qty: it.qty,
          assignments: Object.entries(it.eaters).map(([participantId, shares]) => ({ participantId, shares })),
        })),
        serviceAmount,
        taxAmount,
        discountAmount: state.discount,
        roundingAmount: state.rounding,
      };
      const { shares, grandTotal, subtotal: sub } = computeBillShares(bill);
      const balances = balancesFromBills(
        [{ paidBy: state.paidBy, grandTotal, shares }],
        state.people.map((p) => p.id),
      );
      return { ok: true, shares, grandTotal, subtotal: sub, transfers: settleUp(balances) };
    } catch (e) {
      return { ok: false, message: e instanceof SplitError ? e.message : 'Terjadi kesalahan menghitung' };
    }
  }, [state.people, state.paidBy, state.discount, state.rounding, filledItems, serviceAmount, taxAmount]);

  function whatsappText(r: Extract<Result, { ok: true }>) {
    const lines = r.shares.map((s) => `• ${nameOf(s.participantId)}: ${formatIDR(s.total)}`);
    return [
      `*${state.title || 'Patungan'}* — total ${formatIDR(r.grandTotal)}`,
      ...lines,
      '',
      settlementMessage({
        title: 'Transfer',
        transfers: r.transfers,
        nameOf,
        payInfo: payInfo.trim() || undefined,
      }),
    ].join('\n');
  }

  async function copyResult(r: Extract<Result, { ok: true }>) {
    const text = whatsappText(r);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt('Salin teks ini:', text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const card = 'rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3';
  const label = 'text-xs font-medium uppercase tracking-wide text-zinc-400';

  return (
    <div className="space-y-5">
      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <input
            value={state.title}
            onChange={(e) => patch({ title: e.target.value })}
            aria-label="Nama acara"
            maxLength={60}
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
          />
          <div className="flex gap-2 text-xs">
            {state.people.length === 0 && (
              <button type="button" onClick={() => setState(exampleState())} className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15">
                Coba contoh
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirm('Hapus semua data kalkulator?')) setState(emptyState);
              }}
              className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      {/* 1. Orang */}
      <section className={card}>
        <h2 className="font-semibold">1. Siapa saja?</h2>
        <div className="flex flex-wrap gap-2">
          {state.people.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-brand-500/20 py-1 pl-3 pr-1 text-sm">
              {p.name}
              <button
                type="button"
                aria-label={`Hapus ${p.name}`}
                onClick={() => removePerson(p.id)}
                className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/10"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPerson()}
            maxLength={40}
            placeholder="Nama teman"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none focus:border-brand-400"
          />
          <button type="button" onClick={addPerson} className="rounded-lg bg-brand-500 px-4 py-2 font-semibold hover:bg-brand-400">
            Tambah
          </button>
        </div>
        {state.people.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-zinc-400">Yang bayar ke kasir:</span>
            <select
              value={state.paidBy ?? ''}
              onChange={(e) => patch({ paidBy: e.target.value || null })}
              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1"
            >
              {state.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {/* 2. Pesanan */}
      <section className={card}>
        <h2 className="font-semibold">2. Pesanan</h2>
        {state.items.length === 0 && <p className="text-sm text-zinc-400">Belum ada pesanan.</p>}
        <div className="space-y-3">
          {state.items.map((it) => (
            <div key={it.id} className="space-y-2 rounded-xl bg-black/20 p-3">
              <div className="flex gap-2">
                <input
                  value={it.name}
                  onChange={(e) => updateItem(it.id, { name: e.target.value })}
                  placeholder="Nama menu"
                  maxLength={100}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none focus:border-brand-400"
                />
                <button type="button" aria-label="Hapus item" onClick={() => removeItem(it.id)} className="rounded-lg px-2 text-zinc-400 hover:bg-white/10">
                  🗑
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-40">
                  <MoneyInput value={it.price || null} onChange={(v) => updateItem(it.id, { price: v ?? 0 })} placeholder="Harga satuan" ariaLabel="Harga satuan" />
                </div>
                <div className="flex items-center overflow-hidden rounded-lg border border-white/10">
                  <button type="button" aria-label="Kurangi jumlah" onClick={() => updateItem(it.id, { qty: Math.max(1, it.qty - 1) })} className="px-3 py-2 hover:bg-white/10">−</button>
                  <span className="min-w-8 text-center tabular-nums">{it.qty}</span>
                  <button type="button" aria-label="Tambah jumlah" onClick={() => updateItem(it.id, { qty: Math.min(99, it.qty + 1) })} className="px-3 py-2 hover:bg-white/10">+</button>
                </div>
                <span className="ml-auto text-sm tabular-nums text-zinc-400">{formatIDR(it.price * it.qty)}</span>
              </div>
              {state.people.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {state.people.map((p) => {
                    const n = it.eaters[p.id] ?? 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => cyclePortion(it, p.id)}
                        aria-pressed={n > 0}
                        className={`rounded-full px-3 py-1 text-sm transition ${
                          n > 0 ? 'bg-brand-500 text-white' : 'bg-white/10 text-zinc-300 hover:bg-white/15'
                        }`}
                      >
                        {p.name}
                        {n > 1 ? ` ×${n}` : ''}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => toggleEveryone(it)} className="text-xs text-brand-300 underline-offset-2 hover:underline">
                    semua
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addItem} className="w-full rounded-lg border border-dashed border-white/20 py-2 text-sm hover:bg-white/5">
          + Tambah menu
        </button>
        {state.items.length > 0 && (
          <p className="text-xs text-zinc-500">Ketuk nama untuk menandai siapa yang makan; ketuk lagi untuk menambah porsi.</p>
        )}
      </section>

      {/* 3. Biaya */}
      <section className={card}>
        <h2 className="font-semibold">3. Service, pajak, diskon</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={label}>Service %</span>
            <input inputMode="decimal" value={state.servicePct} onChange={(e) => patch({ servicePct: e.target.value, serviceOverride: null })} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right outline-none focus:border-brand-400" />
          </label>
          <label className="space-y-1">
            <span className={label}>Pajak %</span>
            <input inputMode="decimal" value={state.taxPct} onChange={(e) => patch({ taxPct: e.target.value, taxOverride: null })} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right outline-none focus:border-brand-400" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.taxOnService} onChange={(e) => patch({ taxOnService: e.target.checked })} className="h-4 w-4 accent-violet-500" />
          Pajak dihitung dari (subtotal + service)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={label}>Diskon (Rp)</span>
            <MoneyInput value={state.discount || null} onChange={(v) => patch({ discount: v ?? 0 })} placeholder="0" />
          </label>
          <label className="space-y-1">
            <span className={label}>Pembulatan (Rp)</span>
            <MoneyInput value={state.rounding || null} onChange={(v) => patch({ rounding: v ?? 0 })} placeholder="0" allowNegative />
          </label>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-400">Isi angka persis dari struk (opsional)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className={label}>Service (Rp)</span>
              <MoneyInput value={state.serviceOverride} onChange={(v) => patch({ serviceOverride: v })} placeholder={String(auto.serviceAmount)} />
            </label>
            <label className="space-y-1">
              <span className={label}>Pajak (Rp)</span>
              <MoneyInput value={state.taxOverride} onChange={(v) => patch({ taxOverride: v })} placeholder={String(auto.taxAmount)} />
            </label>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Angka di struk selalu menang atas hitungan dari persen.</p>
        </details>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-zinc-400">Subtotal</dt><dd className="tabular-nums">{formatIDR(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-400">Service</dt><dd className="tabular-nums">{formatIDR(serviceAmount)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-400">Pajak</dt><dd className="tabular-nums">{formatIDR(taxAmount)}</dd></div>
        </dl>
      </section>

      {/* 4. Hasil */}
      <section className={card} aria-live="polite">
        <h2 className="font-semibold">4. Hasil</h2>
        {result === null && (
          <p className="text-sm text-zinc-400">Tambahkan minimal 2 orang dan 1 menu berharga untuk melihat hasil.</p>
        )}
        {result?.ok === false && <p className="text-sm text-amber-300">⚠ {result.message}</p>}
        {result?.ok && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-zinc-400">Total tagihan</span>
              <span className="text-2xl font-bold tabular-nums">{formatIDR(result.grandTotal)}</span>
            </div>

            <ul className="space-y-2">
              {result.shares.map((s) => (
                <li key={s.participantId} className="rounded-xl bg-black/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {nameOf(s.participantId)}
                      {s.participantId === state.paidBy && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-xs text-zinc-300">talangin</span>}
                    </span>
                    <span className="font-semibold tabular-nums">{formatIDR(s.total)}</span>
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-zinc-400">
                    Pesanan {formatIDR(s.subtotal)} + service {formatIDR(s.serviceAmount)} + pajak {formatIDR(s.taxAmount)}
                    {s.discountAmount ? ` − diskon ${formatIDR(s.discountAmount)}` : ''}
                    {s.roundingAmount ? ` ${s.roundingAmount > 0 ? '+' : '−'} pembulatan ${formatIDR(Math.abs(s.roundingAmount))}` : ''}
                  </p>
                </li>
              ))}
            </ul>

            <h3 className="pt-2 text-sm font-semibold text-zinc-300">Siapa transfer ke siapa</h3>
            {result.transfers.length === 0 ? (
              <p className="text-sm text-zinc-400">Semua sudah impas 🎉</p>
            ) : (
              <ul className="space-y-1">
                {result.transfers.map((t, i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl bg-brand-500/15 px-3 py-2">
                    <span>
                      {nameOf(t.from)} <span className="text-zinc-400">→</span> {nameOf(t.to)}
                    </span>
                    <span className="font-semibold tabular-nums">{formatIDR(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}

            <input
              value={payInfo}
              onChange={(e) => setPayInfo(e.target.value)}
              maxLength={120}
              placeholder="Info bayar (mis. DANA 0812xxxx a.n. Febyan)"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
            <button type="button" onClick={() => copyResult(result)} className="w-full rounded-xl bg-brand-500 px-4 py-3 font-semibold hover:bg-brand-400">
              {copied ? '✓ Tersalin' : '📋 Salin teks untuk WhatsApp'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
