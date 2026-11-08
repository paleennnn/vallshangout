'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy, MapPin, Minus, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import {
  SplitError,
  computeBillShares,
  computeCharges,
  formatIDR,
  type Bill,
  type BillShare,
} from '@/lib/engine/split';
import { balancesFromBills, settleUp, settlementMessage, type Transfer } from '@/lib/engine/settle';
import { loadPlaces, type Place } from '@/lib/places/store';
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

/** Nilai kalkulator yang ikut dari sebuah tempat tersimpan. */
function placePatch(place: Place): Partial<CalcState> {
  return {
    title: place.name,
    servicePct: String(place.servicePct),
    taxPct: String(place.taxPct),
    taxOnService: place.taxOnService,
    serviceOverride: null,
    taxOverride: null,
  };
}

export function Calculator() {
  const [state, setState] = useState<CalcState>(emptyState);
  const [hydrated, setHydrated] = useState(false);
  const [newName, setNewName] = useState('');
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([]);
  const [payInfo, setPayInfo] = useState('');
  const [copied, setCopied] = useState(false);
  const resetDialogRef = useRef<HTMLDialogElement>(null);

  function openResetModal() {
    if (typeof resetDialogRef.current?.showModal === 'function') {
      resetDialogRef.current.showModal();
    } else {
      resetDialogRef.current?.setAttribute('open', '');
    }
  }

  function closeResetModal() {
    if (typeof resetDialogRef.current?.close === 'function') {
      resetDialogRef.current.close();
    } else {
      resetDialogRef.current?.removeAttribute('open');
    }
  }

  function confirmReset() {
    setState(emptyState);
    closeResetModal();
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = resetDialogRef.current;
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width;
    if (!isInDialog) {
      closeResetModal();
    }
  };

  // Muat dari perangkat setelah mount (menghindari mismatch hidrasi SSR).
  useEffect(() => {
    const saved = loadState();
    if (saved) setState(saved);
    const places = loadPlaces();
    setSavedPlaces(places);
    // Datang dari halaman Tempat (?place=ID): isi nama acara, service, dan pajak tempat itu
    const wanted = new URLSearchParams(window.location.search).get('place');
    const place = wanted ? places.find((p) => p.id === wanted) : undefined;
    if (place) {
      setState((s) => ({ ...s, ...placePatch(place) }));
      window.history.replaceState(null, '', window.location.pathname);
    }
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

  // orang
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

  // item
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

  // hitung
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
    const lines = r.shares.map((s) => `- ${nameOf(s.participantId)}: ${formatIDR(s.total)}`);
    return [
      `*${state.title || 'Patungan'}*`,
      `Total ${formatIDR(r.grandTotal)}`,
      ...lines,
      '',
      settlementMessage({
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

  const card = 'rounded-2xl border border-line bg-surface p-4 space-y-3';
  const label = 'text-sm font-medium text-muted';

  return (
    <div className="space-y-5">
      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <input
            value={state.title}
            onChange={(e) => patch({ title: e.target.value })}
            aria-label="Nama acara"
            maxLength={60}
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold"
          />
          <div className="flex gap-2 text-xs">
            {state.people.length === 0 && (
              <button type="button" onClick={() => setState(exampleState())} className="rounded-lg bg-sand px-3 py-1.5 hover:bg-sand-strong">
                Coba contoh
              </button>
            )}
            <button
              type="button"
              onClick={openResetModal}
              className="rounded-lg bg-sand px-3 py-1.5 hover:bg-sand-strong"
            >
              Reset
            </button>
          </div>
        </div>
        {savedPlaces.length > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <MapPin size={16} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="sr-only">Isi dari tempat tersimpan</span>
            <select
              value=""
              onChange={(e) => {
                const place = savedPlaces.find((p) => p.id === e.target.value);
                if (place) patch(placePatch(place));
              }}
              className="h-10 min-w-0 flex-1 rounded-control border border-line bg-surface px-2"
            >
              <option value="">Isi service dan pajak dari tempat tersimpan</option>
              {savedPlaces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (service {p.servicePct}%, pajak {p.taxPct}%)
                </option>
              ))}
            </select>
          </label>
        ) : (
          <Link href="/places" className="inline-flex items-center gap-1.5 text-sm text-brand-ink underline underline-offset-4">
            <MapPin size={14} aria-hidden="true" />
            Simpan tempat langganan agar service dan pajaknya terisi otomatis
          </Link>
        )}
      </section>

      {/* 1. Orang */}
      <section className={card}>
        <h2 className="font-semibold">1. Siapa saja?</h2>
        <div className="flex flex-wrap gap-2">
          {state.people.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-brand-soft text-brand-ink py-1 pl-3 pr-1 text-sm">
              {p.name}
              <button
                type="button"
                aria-label={`Hapus ${p.name}`}
                onClick={() => removePerson(p.id)}
                className="grid h-6 w-6 place-items-center rounded-full hover:bg-sand"
              >
                <X size={14} aria-hidden="true" />
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
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 focus:border-brand"
          />
          <button type="button" onClick={addPerson} className="rounded-lg bg-brand px-4 py-2 font-semibold hover:bg-brand-hover">
            Tambah
          </button>
        </div>
        {state.people.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Yang bayar ke kasir:</span>
            <select
              value={state.paidBy ?? ''}
              onChange={(e) => patch({ paidBy: e.target.value || null })}
              className="rounded-lg border border-line bg-surface px-2 py-1"
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
        {state.items.length === 0 && <p className="text-sm text-muted">Belum ada pesanan.</p>}
        <div className="space-y-3">
          {state.items.map((it) => (
            <div key={it.id} className="space-y-2 rounded-xl bg-cream p-3">
              <div className="flex gap-2">
                <input
                  value={it.name}
                  onChange={(e) => updateItem(it.id, { name: e.target.value })}
                  placeholder="Nama menu"
                  maxLength={100}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 focus:border-brand"
                />
                <button type="button" aria-label="Hapus item" onClick={() => removeItem(it.id)} className="rounded-lg p-2 text-muted hover:bg-sand">
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-40">
                  <MoneyInput value={it.price || null} onChange={(v) => updateItem(it.id, { price: v ?? 0 })} placeholder="Harga satuan" ariaLabel="Harga satuan" />
                </div>
                <div className="flex items-center overflow-hidden rounded-lg border border-line">
                  <button type="button" aria-label="Kurangi jumlah" onClick={() => updateItem(it.id, { qty: Math.max(1, it.qty - 1) })} className="px-3 py-2 hover:bg-sand"><Minus size={16} aria-hidden="true" /></button>
                  <span className="min-w-8 text-center tabular-nums">{it.qty}</span>
                  <button type="button" aria-label="Tambah jumlah" onClick={() => updateItem(it.id, { qty: Math.min(99, it.qty + 1) })} className="px-3 py-2 hover:bg-sand"><Plus size={16} aria-hidden="true" /></button>
                </div>
                <span className="ml-auto text-sm tabular-nums text-muted">{formatIDR(it.price * it.qty)}</span>
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
                          n > 0 ? 'bg-brand text-ink' : 'bg-sand text-muted hover:bg-sand-strong'
                        }`}
                      >
                        {p.name}
                        {n > 1 ? ` ×${n}` : ''}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => toggleEveryone(it)} className="text-xs text-brand-ink underline-offset-2 hover:underline">
                    semua
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addItem} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong py-2 text-sm font-medium hover:bg-sand">
          <Plus size={16} aria-hidden="true" />
          Tambah menu
        </button>
        {state.items.length > 0 && (
          <p className="text-xs text-muted">Ketuk nama untuk menandai siapa yang makan; ketuk lagi untuk menambah porsi.</p>
        )}
      </section>

      {/* 3. Biaya */}
      <section className={card}>
        <h2 className="font-semibold">3. Service, pajak, diskon</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={label}>Service %</span>
            <input inputMode="decimal" value={state.servicePct} onChange={(e) => patch({ servicePct: e.target.value, serviceOverride: null })} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-right focus:border-brand" />
          </label>
          <label className="space-y-1">
            <span className={label}>Pajak %</span>
            <input inputMode="decimal" value={state.taxPct} onChange={(e) => patch({ taxPct: e.target.value, taxOverride: null })} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-right focus:border-brand" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.taxOnService} onChange={(e) => patch({ taxOnService: e.target.checked })} className="h-4 w-4 accent-brand" />
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
          <summary className="cursor-pointer text-muted">Isi angka persis dari struk (opsional)</summary>
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
          <p className="mt-2 text-xs text-muted">Angka di struk selalu menang atas hitungan dari persen.</p>
        </details>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatIDR(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Service</dt><dd className="tabular-nums">{formatIDR(serviceAmount)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Pajak</dt><dd className="tabular-nums">{formatIDR(taxAmount)}</dd></div>
        </dl>
      </section>

      {/* 4. Hasil */}
      <section className={card} aria-live="polite">
        <h2 className="font-semibold">4. Hasil</h2>
        {result === null && (
          <p className="text-sm text-muted">Tambahkan minimal 2 orang dan 1 menu berharga untuk melihat hasil.</p>
        )}
        {result?.ok === false && (
          <p className="flex items-start gap-2 text-sm text-warning">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {result.message}
          </p>
        )}
        {result?.ok && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-muted">Total tagihan</span>
              <span className="text-2xl font-bold tabular-nums">{formatIDR(result.grandTotal)}</span>
            </div>

            <ul className="space-y-2">
              {result.shares.map((s) => (
                <li key={s.participantId} className="rounded-xl bg-cream p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {nameOf(s.participantId)}
                      {s.participantId === state.paidBy && <span className="ml-2 rounded bg-sand px-1.5 py-0.5 text-xs text-muted">talangin</span>}
                    </span>
                    <span className="font-semibold tabular-nums">{formatIDR(s.total)}</span>
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-muted">
                    Pesanan {formatIDR(s.subtotal)} + service {formatIDR(s.serviceAmount)} + pajak {formatIDR(s.taxAmount)}
                    {s.discountAmount ? ` − diskon ${formatIDR(s.discountAmount)}` : ''}
                    {s.roundingAmount ? ` ${s.roundingAmount > 0 ? '+' : '−'} pembulatan ${formatIDR(Math.abs(s.roundingAmount))}` : ''}
                  </p>
                </li>
              ))}
            </ul>

            <h3 className="pt-2 text-sm font-semibold text-muted">Siapa transfer ke siapa</h3>
            {result.transfers.length === 0 ? (
              <p className="text-sm text-muted">Semua sudah impas.</p>
            ) : (
              <ul className="space-y-1">
                {result.transfers.map((t, i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl bg-brand-soft px-3 py-2">
                    <span className="flex items-center gap-2">
                      {nameOf(t.from)}
                      <ArrowRight size={16} className="text-muted" aria-hidden="true" />
                      <span className="sr-only">ke</span>
                      {nameOf(t.to)}
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
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand"
            />
            <button type="button" onClick={() => copyResult(result)} className="w-full rounded-xl bg-brand px-4 py-3 font-semibold hover:bg-brand-hover">
              <span className="inline-flex items-center justify-center gap-2">
                {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                {copied ? 'Tersalin' : 'Salin teks untuk WhatsApp'}
              </span>
            </button>
          </>
        )}
      </section>

      {/* Modal Popup Konfirmasi Reset */}
      <dialog
        ref={resetDialogRef}
        onClick={handleBackdropClick}
        aria-labelledby="reset-dialog-title"
        aria-describedby="reset-dialog-desc"
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-surface p-5 text-ink shadow-xl backdrop:bg-night/60 backdrop:backdrop-blur-xs"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h2 id="reset-dialog-title" className="text-lg font-bold">
              Reset data kalkulator?
            </h2>
            <p id="reset-dialog-desc" className="text-sm text-muted">
              Semua daftar teman, menu, dan hasil patungan yang tersimpan di perangkatmu akan dihapus.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              autoFocus
              onClick={closeResetModal}
              className="rounded-lg bg-sand px-4 py-2 text-sm font-semibold text-ink hover:bg-sand-strong"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={confirmReset}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Ya, reset
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
