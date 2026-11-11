'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';
import { errorMessage } from '@/lib/errors';
import { EMPTY_BUNDLE, fetchBillsBundle, setAssignment } from '@/lib/room/bills';
import type { BillsBundle, Hangout, Participant } from '@/lib/supabase/types';
import { BillCard } from './BillCard';
import { NewBillSheet } from './NewBillSheet';
import { TransfersPanel } from './TransfersPanel';
import { card, primary } from './ui';

const TABLES = ['bills', 'bill_items', 'bill_item_assignments', 'bill_shares', 'transfers'] as const;

/**
 * Patungan di dalam room: tiap orang menandai pesanannya sendiri di HP masing-masing, perubahan
 * orang lain muncul lewat Realtime. Hitung dan finalisasi memakai mesin di lib/engine.
 */
export function RoomBills({
  hangout,
  participants,
  me,
  isHost,
}: {
  hangout: Hangout;
  participants: Participant[];
  me: Participant | undefined;
  isHost: boolean;
}) {
  const { supabase } = useSupabase();
  const hangoutId = hangout.id;
  const [data, setData] = useState<BillsBundle>(EMPTY_BUNDLE);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    try {
      setData(await fetchBillsBundle(supabase, hangoutId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Gagal memuat tagihan'));
    } finally {
      setLoaded(true);
    }
  }, [supabase, hangoutId]);

  // Muat awal + realtime. Banyak event beruntun (tiap tanda pesanan) digabung jadi satu muat ulang.
  useEffect(() => {
    if (!supabase) return;
    refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 250);
    };
    const filter = `hangout_id=eq.${hangoutId}`;
    let channel = supabase.channel(`bills:${hangoutId}`);
    for (const table of TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, soon);
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, hangoutId, refresh]);

  /** Tanda pesanan langsung tampil di layar sendiri (optimistis), server dan Realtime menyusul. */
  const mark = useCallback(
    async (itemId: string, participantId: string, shares: number) => {
      if (!supabase) return;
      setData((d) => ({
        ...d,
        assignments: [
          ...d.assignments.filter((a) => !(a.item_id === itemId && a.participant_id === participantId)),
          ...(shares > 0 ? [{ item_id: itemId, participant_id: participantId, shares }] : []),
        ],
      }));
      try {
        await setAssignment(supabase, hangoutId, itemId, participantId, shares);
      } catch (e) {
        setError(errorMessage(e, 'Gagal menandai pesanan'));
        refresh();
      }
    },
    [supabase, hangoutId, refresh],
  );

  const bills = useMemo(() => [...data.bills].reverse(), [data.bills]);
  const hasFinal = data.bills.some((b) => b.status === 'final');

  return (
    <section className={card} aria-live="polite">
      <div>
        <h2 className="font-semibold">Patungan</h2>
        <p className="text-sm text-muted">Tiap orang menandai pesanannya sendiri di HP masing-masing.</p>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!loaded && <p className="text-sm text-muted">Memuat tagihan…</p>}
      {loaded && bills.length === 0 && <p className="text-sm text-muted">Belum ada tagihan.</p>}

      {bills.map((bill) => {
        const items = data.items.filter((it) => it.bill_id === bill.id);
        const itemIds = new Set(items.map((it) => it.id));
        return (
          <BillCard
            key={bill.id}
            bill={bill}
            items={items}
            assignments={data.assignments.filter((a) => itemIds.has(a.item_id))}
            shares={data.shares.filter((s) => s.bill_id === bill.id)}
            participants={participants}
            me={me}
            isHost={isHost}
            defaultTaxOnService={hangout.place_meta?.tax_on_service ?? true}
            onMark={mark}
            onChanged={refresh}
          />
        );
      })}

      {(hasFinal || data.transfers.length > 0) && (
        <TransfersPanel
          hangoutId={hangoutId}
          transfers={data.transfers}
          participants={participants}
          me={me}
          isHost={isHost}
          onChanged={refresh}
        />
      )}

      {me && (
        <button type="button" className={`${primary} w-full`} onClick={() => setSheetOpen(true)}>
          <Plus size={16} aria-hidden="true" />
          Buat tagihan baru
        </button>
      )}
      <NewBillSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        hangout={hangout}
        participants={participants}
        me={me}
        onCreated={refresh}
      />
    </section>
  );
}
