import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AssignmentRow, BillItemRow, BillRow, Participant } from '@/lib/supabase/types';
import {
  addItems,
  billGrandTotal,
  billMarkers,
  buildWhatsappText,
  createBill,
  finalizeBill,
  markableParticipants,
  previewShares,
  replanTransfers,
  setAssignment,
  unassignedItems,
  updateItem,
  validateItem,
  validateNewBill,
} from './bills';

const bill: BillRow = {
  id: 'b1',
  hangout_id: 'h1',
  title: 'Cafe A',
  paid_by: 'p-a',
  service_pct: 5,
  tax_pct: 10,
  service_amount: 4000,
  tax_amount: 8400,
  discount_amount: 0,
  rounding_amount: 0,
  status: 'draft',
  created_at: '2026-11-11T00:00:00Z',
};
const item = (id: string, name: string, unit_price: number, qty = 1): BillItemRow => ({
  id,
  bill_id: 'b1',
  name,
  unit_price,
  qty,
  sort_order: 0,
  created_at: '2026-11-11T00:00:00Z',
});
const items = [item('i1', 'Steak', 50000), item('i2', 'Nasi goreng', 30000)];
const mark = (item_id: string, participant_id: string, shares = 1): AssignmentRow => ({ item_id, participant_id, shares });
const people: Participant[] = [
  { id: 'p-a', name: 'Aji', rsvp: 'going', user_id: 'u-a' },
  { id: 'p-b', name: 'Budi', rsvp: 'going', user_id: 'u-b' },
  { id: 'p-tamu', name: 'Tamu', rsvp: 'going', user_id: null },
];

const sb = (x: object) => x as unknown as SupabaseClient;

/** Query builder palsu yang bisa di-await dan mencatat panggilannya. */
function fakeClient(tables: Record<string, unknown[]>, rpc = vi.fn().mockResolvedValue({ data: null, error: null })) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const op of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'upsert', 'single']) {
      q[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return q;
      };
    }
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: null });
    return q;
  };
  return { client: sb({ from, rpc }), calls, rpc };
}

describe('validasi', () => {
  it('tagihan baru: nama, pembayar, dan persen', () => {
    expect(validateNewBill({ title: 'Cafe', paidBy: 'p', servicePct: 5, taxPct: null })).toBeNull();
    expect(validateNewBill({ title: '  ', paidBy: 'p', servicePct: null, taxPct: null })).toMatch(/Nama tagihan/);
    expect(validateNewBill({ title: 'x'.repeat(81), paidBy: 'p', servicePct: null, taxPct: null })).toMatch(/80 karakter/);
    expect(validateNewBill({ title: 'Cafe', paidBy: '', servicePct: null, taxPct: null })).toMatch(/bayar/);
    expect(validateNewBill({ title: 'Cafe', paidBy: 'p', servicePct: 101, taxPct: null })).toMatch(/Persen/);
  });

  it('menu: nama, harga bulat > 0, dan jumlah 1 sampai 99', () => {
    expect(validateItem({ name: 'Es teh', unitPrice: 10000, qty: 2 })).toBeNull();
    expect(validateItem({ name: '', unitPrice: 10000, qty: 1 })).toMatch(/Nama menu/);
    expect(validateItem({ name: 'A', unitPrice: 0, qty: 1 })).toMatch(/Harga/);
    expect(validateItem({ name: 'A', unitPrice: 1500.5, qty: 1 })).toMatch(/Harga/);
    expect(validateItem({ name: 'A', unitPrice: 1000, qty: 100 })).toMatch(/Jumlah/);
  });

  it('createBill menolak input salah sebelum menyentuh jaringan', async () => {
    const { client, calls } = fakeClient({});
    await expect(createBill(client, 'h1', { title: '', paidBy: 'p', servicePct: null, taxPct: null })).rejects.toThrow(/Nama tagihan/);
    expect(calls).toHaveLength(0);
  });
});

describe('perhitungan murni', () => {
  it('total = subtotal + service + pajak - diskon + pembulatan', () => {
    expect(billGrandTotal(bill, items)).toBe(80000 + 4000 + 8400);
    expect(billGrandTotal({ ...bill, discount_amount: 5000, rounding_amount: -400 }, items)).toBe(80000 + 4000 + 8400 - 5000 - 400);
  });

  it('menu yang belum ditandai dikenali', () => {
    expect(unassignedItems(items, [mark('i1', 'p-a')]).map((i) => i.id)).toEqual(['i2']);
    expect(unassignedItems(items, [mark('i1', 'p-a'), mark('i2', 'p-b')])).toEqual([]);
  });

  it('pratinjau: jumlah pembagian persis sama dengan total', () => {
    const r = previewShares(bill, items, [mark('i1', 'p-a'), mark('i2', 'p-b')]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.grandTotal).toBe(92400);
      expect(r.result.shares.reduce((a, s) => a + s.total, 0)).toBe(92400);
    }
  });

  it('pratinjau: menu belum ditandai atau tagihan kosong memberi pesan', () => {
    const a = previewShares(bill, items, [mark('i1', 'p-a')]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.message).toMatch(/belum ditandai/);
    const b = previewShares(bill, [], []);
    expect(b.ok).toBe(false);
  });

  it('hak menandai: diri sendiri dan teman tanpa akun; host untuk semua', () => {
    expect(markableParticipants(people, people[1], false).map((p) => p.id)).toEqual(['p-b', 'p-tamu']);
    expect(markableParticipants(people, people[0], true).map((p) => p.id)).toEqual(['p-a', 'p-b', 'p-tamu']);
    expect(markableParticipants(people, undefined, false).map((p) => p.id)).toEqual(['p-tamu']);
  });
});

describe('setAssignment', () => {
  it('porsi > 0 di-upsert per item dan peserta', async () => {
    const { client, calls } = fakeClient({});
    await setAssignment(client, 'h1', 'i1', 'p-a', 2);
    expect(calls).toEqual([
      {
        table: 'bill_item_assignments',
        op: 'upsert',
        args: [{ hangout_id: 'h1', item_id: 'i1', participant_id: 'p-a', shares: 2 }, { onConflict: 'item_id,participant_id' }],
      },
    ]);
  });

  it('porsi 0 menghapus tanda', async () => {
    const { client, calls } = fakeClient({});
    await setAssignment(client, 'h1', 'i1', 'p-a', 0);
    expect(calls.map((c) => c.op)).toEqual(['delete', 'eq', 'eq']);
    expect(calls.filter((c) => c.op === 'eq').map((c) => c.args)).toEqual([['item_id', 'i1'], ['participant_id', 'p-a']]);
  });
});

describe('replanTransfers', () => {
  it('menyusun transfer dari saldo, memperhitungkan transfer yang sudah paid', async () => {
    // Aji talangin 100, Budi berutang 60, Citra berutang 40; Budi sudah transfer 60 (paid) ke Aji
    const { client, rpc } = fakeClient({
      hangout_balances: [
        { participant_id: 'p-a', net: 100 },
        { participant_id: 'p-b', net: -60 },
        { participant_id: 'p-c', net: -40 },
      ],
      transfers: [{ from_participant: 'p-b', to_participant: 'p-a', amount: 60, status: 'paid' }],
    });
    await replanTransfers(client, 'h1');
    expect(rpc).toHaveBeenCalledWith('replace_transfers', {
      p_hangout: 'h1',
      p_transfers: [{ from_participant: 'p-c', to_participant: 'p-a', amount: 40 }],
    });
  });

  it('semua impas menghasilkan rencana kosong', async () => {
    const { client, rpc } = fakeClient({ hangout_balances: [{ participant_id: 'p-a', net: 0 }], transfers: [] });
    await replanTransfers(client, 'h1');
    expect(rpc).toHaveBeenCalledWith('replace_transfers', { p_hangout: 'h1', p_transfers: [] });
  });
});

describe('finalizeBill', () => {
  it('menolak bila masih ada menu yang belum ditandai, tanpa menyentuh server', async () => {
    const { client, rpc } = fakeClient({});
    await expect(finalizeBill(client, bill, items, [mark('i1', 'p-a')])).rejects.toThrow(/Nasi goreng/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('mengirim hasil hitung ke finalize_bill lalu memperbarui rencana transfer', async () => {
    const { client, rpc } = fakeClient({
      hangout_balances: [
        { participant_id: 'p-a', net: 30000 },
        { participant_id: 'p-b', net: -30000 },
      ],
      transfers: [],
    });
    await finalizeBill(client, bill, items, [mark('i1', 'p-a'), mark('i2', 'p-b')]);

    const [name, args] = rpc.mock.calls[0] as [string, { p_bill: string; p_shares: { participant_id: string; total: number }[] }];
    expect(name).toBe('finalize_bill');
    expect(args.p_bill).toBe('b1');
    expect(args.p_shares.reduce((a, s) => a + s.total, 0)).toBe(92400);
    expect(rpc.mock.calls[1][0]).toBe('replace_transfers');
  });

  it('galat server saat finalisasi diteruskan', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'bill sudah final' } });
    const { client } = fakeClient({}, rpc);
    await expect(finalizeBill(client, bill, items, [mark('i1', 'p-a'), mark('i2', 'p-b')])).rejects.toThrow('Gagal memfinalkan tagihan: bill sudah final');
  });

  it('bila rencana transfer gagal, pesan menjelaskan bahwa tagihan sudah final', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'rencana transfer tidak melunasi semua saldo' } });
    const { client } = fakeClient({ hangout_balances: [], transfers: [] }, rpc);
    await expect(finalizeBill(client, bill, items, [mark('i1', 'p-a'), mark('i2', 'p-b')])).rejects.toThrow(/sudah final, tetapi rencana transfer/);
  });
});

describe('buildWhatsappText', () => {
  // formatIDR memakai spasi tak terputus setelah "Rp" (sama seperti pesan di kalkulator)
  const plain = (s: string) => s.replace(/\u00a0/g, ' ');
  const names: Record<string, string> = { 'p-a': 'Aji', 'p-b': 'Budi', 'p-c': 'Citra' };
  const nameOf = (id: string) => names[id] ?? '?';
  const tr = (from: string, to: string, amount: number, status: 'pending' | 'paid' | 'confirmed') => ({
    from_participant: from,
    to_participant: to,
    amount,
    status,
  });

  it('judul, total, bagian tiap orang (dijumlah antar tagihan), lalu transfer, dan info bayar', () => {
    const text = plain(buildWhatsappText({
      title: 'Malming',
      shares: [
        { participant_id: 'p-a', total: 50000 },
        { participant_id: 'p-b', total: 30000 },
        { participant_id: 'p-b', total: 20000 }, // tagihan kedua
      ],
      transfers: [tr('p-b', 'p-a', 50000, 'pending')],
      nameOf,
      payInfo: '  DANA 0812xxxx a.n. Aji ',
    }));
    expect(text).toBe(
      [
        '*Malming*',
        'Total Rp 100.000',
        '- Aji: Rp 50.000',
        '- Budi: Rp 50.000',
        '',
        'Yang perlu ditransfer:',
        '- Budi ke Aji: Rp 50.000',
        '',
        'Bayar ke: DANA 0812xxxx a.n. Aji',
      ].join('\n'),
    );
  });

  it('transfer yang sudah dikonfirmasi tidak ikut; yang paid (menunggu konfirmasi) tetap ikut', () => {
    const text = plain(buildWhatsappText({
      title: 'Malming',
      shares: [{ participant_id: 'p-a', total: 90000 }],
      transfers: [tr('p-b', 'p-a', 30000, 'confirmed'), tr('p-c', 'p-a', 60000, 'paid')],
      nameOf,
    }));
    expect(text).toContain('- Citra ke Aji: Rp 60.000');
    expect(text).not.toContain('Budi ke Aji');
    expect(text).not.toContain('Bayar ke');
  });

  it('semua transfer sudah dikonfirmasi: "Semua sudah impas."', () => {
    const text = buildWhatsappText({
      title: 'Malming',
      shares: [{ participant_id: 'p-a', total: 30000 }],
      transfers: [tr('p-b', 'p-a', 30000, 'confirmed')],
      nameOf,
    });
    expect(text.split('\n').at(-1)).toBe('Semua sudah impas.');
  });

  it('tanpa hasil bagi (belum ada tagihan final): hanya judul dan transfer', () => {
    const text = plain(buildWhatsappText({ title: 'Malming', shares: [], transfers: [tr('p-b', 'p-a', 10000, 'pending')], nameOf }));
    expect(text).toBe('*Malming*\nYang perlu ditransfer:\n- Budi ke Aji: Rp 10.000');
  });
});

describe('updateItem', () => {
  it('menyimpan nama, harga, dan jumlah yang sudah dirapikan', async () => {
    const { client, calls } = fakeClient({ bill_items: [{ id: 'i1' }] });
    await updateItem(client, 'i1', { name: '  Steak  ', unitPrice: 55000, qty: 2 });
    expect(calls.find((c) => c.op === 'update')!.args).toEqual([{ name: 'Steak', unit_price: 55000, qty: 2 }]);
    expect(calls.find((c) => c.op === 'eq')!.args).toEqual(['id', 'i1']);
  });

  it('menolak input salah sebelum menyentuh jaringan', async () => {
    const { client, calls } = fakeClient({});
    await expect(updateItem(client, 'i1', { name: '', unitPrice: 1000, qty: 1 })).rejects.toThrow(/Nama menu/);
    await expect(updateItem(client, 'i1', { name: 'A', unitPrice: 0, qty: 1 })).rejects.toThrow(/Harga/);
    expect(calls).toHaveLength(0);
  });

  it('tidak ada baris berubah (mis. bill sudah final) memberi pesan yang jelas', async () => {
    const { client } = fakeClient({ bill_items: [] });
    await expect(updateItem(client, 'i1', { name: 'A', unitPrice: 1000, qty: 1 })).rejects.toThrow(/sudah final/);
  });
});

describe('bagi rata menu yang belum ditandai', () => {
  const three = [item('i1', 'Steak', 50000), item('i2', 'Nasi goreng', 30000), item('i3', 'Kentang', 20000)];
  const marks = [mark('i1', 'p-a'), mark('i2', 'p-b')]; // Kentang belum ditandai

  it('penanda = orang yang sudah menandai sesuatu, tanpa duplikat', () => {
    expect(billMarkers([mark('i1', 'p-a'), mark('i2', 'p-a'), mark('i2', 'p-b')])).toEqual(['p-a', 'p-b']);
    expect(billMarkers([])).toEqual([]);
  });

  it('tanpa opsi, menu yang belum ditandai tetap menghalangi', () => {
    expect(previewShares(bill, three, marks).ok).toBe(false);
  });

  it('dengan opsi, menu itu dibagi sama rata ke yang sudah menandai dan jumlahnya tetap pas', () => {
    const r = previewShares(bill, three, marks, { shareUnassigned: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const by = Object.fromEntries(r.result.shares.map((s) => [s.participantId, s.subtotal]));
      expect(by).toEqual({ 'p-a': 50000 + 10000, 'p-b': 30000 + 10000 });
      expect(r.result.shares.reduce((a, s) => a + s.total, 0)).toBe(billGrandTotal(bill, three));
    }
  });

  it('tidak ada yang menandai sama sekali: tetap tidak bisa', async () => {
    expect(previewShares(bill, three, [], { shareUnassigned: true }).ok).toBe(false);
    const { client, rpc } = fakeClient({});
    await expect(finalizeBill(client, bill, three, [], { shareUnassigned: true })).rejects.toThrow(/dibagi rata/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('finalisasi dengan opsi mengirim hasil bagi rata ke server', async () => {
    const { client, rpc } = fakeClient({ hangout_balances: [], transfers: [] });
    await finalizeBill(client, bill, three, marks, { shareUnassigned: true });
    const [name, args] = rpc.mock.calls[0] as [string, { p_shares: { participant_id: string; subtotal: number; total: number }[] }];
    expect(name).toBe('finalize_bill');
    expect(Object.fromEntries(args.p_shares.map((s) => [s.participant_id, s.subtotal]))).toEqual({ 'p-a': 60000, 'p-b': 40000 });
    expect(args.p_shares.reduce((a, s) => a + s.total, 0)).toBe(100000 + 4000 + 8400);
  });

  it('tanpa opsi, finalisasi tetap ditolak sebelum menyentuh server', async () => {
    const { client, rpc } = fakeClient({});
    await expect(finalizeBill(client, bill, three, marks)).rejects.toThrow(/Kentang/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('addItems', () => {
  const rows = [
    { name: '  Kopi  ', unitPrice: 25000, qty: 2 },
    { name: 'Roti', unitPrice: 15000, qty: 1 },
  ];

  it('menyimpan semua menu dalam satu permintaan, dengan urutan berlanjut dan nama dirapikan', async () => {
    const { client, calls } = fakeClient({ bill_items: [{ id: 'a' }, { id: 'b' }] });
    const saved = await addItems(client, 'h1', 'b1', rows, 5, 2);
    expect(saved).toHaveLength(2);
    const inserts = calls.filter((c) => c.op === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toEqual([
      { hangout_id: 'h1', bill_id: 'b1', name: 'Kopi', unit_price: 25000, qty: 2, sort_order: 5 },
      { hangout_id: 'h1', bill_id: 'b1', name: 'Roti', unit_price: 15000, qty: 1, sort_order: 6 },
    ]);
  });

  it('menolak daftar kosong dan input yang salah, menyebut nomor menunya, sebelum menyentuh jaringan', async () => {
    const { client, calls } = fakeClient({});
    await expect(addItems(client, 'h1', 'b1', [], 0)).rejects.toThrow(/Tidak ada menu/);
    await expect(addItems(client, 'h1', 'b1', [rows[0], { name: '', unitPrice: 1000, qty: 1 }], 0)).rejects.toThrow(/Menu ke-2: Nama menu/);
    await expect(addItems(client, 'h1', 'b1', [{ name: 'A', unitPrice: 0, qty: 1 }], 0)).rejects.toThrow(/Menu ke-1: Harga/);
    expect(calls).toHaveLength(0);
  });

  it('batas jumlah menu per tagihan memperhitungkan menu yang sudah ada', async () => {
    const { client, calls } = fakeClient({});
    await expect(addItems(client, 'h1', 'b1', rows, 0, 59)).rejects.toThrow(/maksimal 60/);
    expect(calls).toHaveLength(0);
  });

  it('galat dari server diteruskan', async () => {
    const client = sb({
      from: () => {
        const q: Record<string, unknown> = {};
        q.insert = () => q;
        q.select = () => q;
        q.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: { message: 'new row violates row-level security policy' } });
        return q;
      },
    });
    await expect(addItems(client, 'h1', 'b1', rows, 0)).rejects.toThrow(/Gagal menyimpan menu: new row violates/);
  });
});
