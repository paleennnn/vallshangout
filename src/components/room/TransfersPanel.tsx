'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, RefreshCw } from 'lucide-react';
import { ThankYouModal } from '@/components/calculator/ThankYouModal';
import { useSupabase } from '@/components/SupabaseProvider';
import { errorMessage } from '@/lib/errors';
import { formatIDR } from '@/lib/engine/split';
import { buildWhatsappText, replanTransfers, setTransferStatus } from '@/lib/room/bills';
import { notifyRoom } from '@/lib/room/notify';
import type { BillShareRow, Participant, TransferRow } from '@/lib/supabase/types';
import { field, primary, secondary } from './ui';

const STATUS_LABEL: Record<TransferRow['status'], string> = {
  pending: 'Belum transfer',
  paid: 'Menunggu konfirmasi',
  confirmed: 'Lunas',
};
const STATUS_STYLE: Record<TransferRow['status'], string> = {
  pending: 'bg-warning-bg text-warning',
  paid: 'bg-info-bg text-info',
  confirmed: 'bg-success-bg text-success',
};

const small = 'inline-flex h-11 items-center justify-center rounded-control bg-sand px-3 text-sm font-semibold hover:bg-sand-strong disabled:opacity-60';

/** Rencana "siapa transfer ke siapa" untuk seluruh hangout, lengkap dengan status bayar. */
export function TransfersPanel({
  hangoutId,
  title,
  shares,
  transfers,
  participants,
  me,
  isHost,
  onChanged,
}: {
  hangoutId: string;
  /** Judul di baris pertama teks WhatsApp. */
  title: string;
  /** Hasil bagi semua tagihan final (bill_shares hanya ada untuk tagihan final). */
  shares: BillShareRow[];
  transfers: TransferRow[];
  participants: Participant[];
  me: Participant | undefined;
  isHost: boolean;
  onChanged: () => void;
}) {
  const { supabase } = useSupabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payInfo, setPayInfo] = useState('');
  const [copied, setCopied] = useState(false);
  const [thanks, setThanks] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? 'seseorang';

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

  async function copyText() {
    const text = buildWhatsappText({ title, shares, transfers, nameOf, payInfo });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt('Salin teks ini:', text);
    }
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    setThanks(true);
  }

  async function set(t: TransferRow, status: TransferRow['status']) {
    const ok = await run(() => setTransferStatus(supabase!, t.id, status));
    // Penerima perlu tahu ada transfer yang menunggu konfirmasinya
    if (ok && status === 'paid') void notifyRoom(supabase!, hangoutId, 'transfer_paid', t.id);
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted">Siapa transfer ke siapa</h3>
      {transfers.length === 0 ? (
        <p className="text-sm text-muted">Semua sudah impas.</p>
      ) : (
        <ul className="space-y-2">
          {transfers.map((t) => {
            const iAmSender = !!me && t.from_participant === me.id;
            const iAmReceiver = !!me && t.to_participant === me.id;
            return (
              <li key={t.id} className="space-y-2 rounded-xl border border-line bg-cream p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{nameOf(t.from_participant)}</span>
                    <ArrowRight size={16} className="shrink-0 text-muted" aria-hidden="true" />
                    <span className="sr-only">ke</span>
                    <span className="truncate">{nameOf(t.to_participant)}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatIDR(t.amount)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                  {t.status === 'pending' && (iAmSender || isHost) && (
                    <button type="button" className={small} disabled={busy} onClick={() => set(t, 'paid')}>Sudah transfer</button>
                  )}
                  {t.status === 'paid' && (iAmSender || isHost) && (
                    <button type="button" className={small} disabled={busy} onClick={() => set(t, 'pending')}>Batal transfer</button>
                  )}
                  {t.status !== 'confirmed' && (iAmReceiver || isHost) && (
                    <button type="button" className={small} disabled={busy} onClick={() => set(t, 'confirmed')}>Konfirmasi diterima</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <input
        value={payInfo}
        onChange={(e) => setPayInfo(e.target.value)}
        maxLength={120}
        placeholder="Info bayar (mis. DANA 0812xxxx a.n. Febyan)"
        aria-label="Info bayar"
        className={`${field} text-sm`}
      />
      <button type="button" className={`${primary} w-full`} onClick={copyText}>
        {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
        {copied ? 'Tersalin' : 'Salin teks untuk WhatsApp'}
      </button>
      <ThankYouModal isOpen={thanks} onClose={() => setThanks(false)} />

      <button type="button" className={`${secondary} w-full`} disabled={busy} onClick={() => void run(() => replanTransfers(supabase!, hangoutId))}>
        <RefreshCw size={16} aria-hidden="true" />
        Hitung ulang transfer
      </button>
    </div>
  );
}
