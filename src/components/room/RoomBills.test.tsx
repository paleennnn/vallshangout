// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AssignmentRow, BillItemRow, BillRow, BillsBundle, Hangout, Participant } from '@/lib/supabase/types';

const h = vi.hoisted(() => {
  const onCalls: unknown[][] = [];
  const channel: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> } = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockImplementation((...args: unknown[]) => {
    onCalls.push(args);
    return channel;
  });
  channel.subscribe.mockImplementation(() => channel);
  const supabase = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
  return {
    onCalls,
    supabase,
    ctx: { supabase, session: { user: { id: 'u-budi' } }, restored: true, ensureSession: vi.fn() },
    api: {
      fetchBillsBundle: vi.fn(),
      setAssignment: vi.fn(),
      finalizeBill: vi.fn(),
      reopenBill: vi.fn(),
      deleteBill: vi.fn(),
      createBill: vi.fn(),
      addItem: vi.fn(),
      updateItem: vi.fn(),
      setTransferStatus: vi.fn(),
      replanTransfers: vi.fn(),
    },
  };
});
vi.mock('@/components/SupabaseProvider', () => ({ useSupabase: () => h.ctx }));
vi.mock('@/lib/room/bills', async (orig) => ({ ...(await orig<typeof import('@/lib/room/bills')>()), ...h.api }));

import { RoomBills } from './RoomBills';

const hangout: Hangout = {
  id: 'h1',
  host_id: 'u-host',
  title: 'Malming',
  status: 'ongoing',
  scheduled_at: null,
  invite_code: 'ABCD2345',
  place_label: 'Cafe A',
  place_meta: { service_pct: 5, tax_pct: 10, tax_on_service: true },
};
const host: Participant = { id: 'p-host', name: 'Host', rsvp: 'going', user_id: 'u-host' };
const budi: Participant = { id: 'p-budi', name: 'Budi', rsvp: 'going', user_id: 'u-budi' };
const tamu: Participant = { id: 'p-tamu', name: 'Tamu', rsvp: 'going', user_id: null };
const people = [host, budi, tamu];

const draft: BillRow = {
  id: 'b1',
  hangout_id: 'h1',
  title: 'Makan malam',
  paid_by: 'p-host',
  service_pct: null,
  tax_pct: null,
  service_amount: 0,
  tax_amount: 0,
  discount_amount: 0,
  rounding_amount: 0,
  status: 'draft',
  created_at: '2026-11-11T10:00:00Z',
};
const item = (id: string, name: string, unit_price: number): BillItemRow => ({
  id,
  bill_id: 'b1',
  name,
  unit_price,
  qty: 1,
  sort_order: 0,
  created_at: '2026-11-11T10:00:00Z',
});
const steak = item('i1', 'Steak', 50000);
const nasi = item('i2', 'Nasi goreng', 30000);
const mark = (item_id: string, participant_id: string, shares = 1): AssignmentRow => ({ item_id, participant_id, shares });

const bundle = (over: Partial<BillsBundle> = {}): BillsBundle => ({
  bills: [draft],
  items: [steak, nasi],
  assignments: [],
  shares: [],
  transfers: [],
  ...over,
});

function setup(opts: { me?: Participant | undefined; isHost?: boolean } = {}) {
  const me = 'me' in opts ? opts.me : budi;
  return render(<RoomBills hangout={hangout} participants={people} me={me} isHost={opts.isHost ?? false} />);
}

beforeEach(() => {
  h.onCalls.length = 0;
  h.supabase.channel.mockClear();
  h.supabase.removeChannel.mockClear();
  for (const fn of Object.values(h.api)) fn.mockReset().mockResolvedValue(undefined);
  h.api.fetchBillsBundle.mockResolvedValue(bundle());
});
afterEach(cleanup);

describe('<RoomBills />', () => {
  it('tanpa tagihan: pesan kosong dan tombol buat tagihan hanya untuk peserta', async () => {
    h.api.fetchBillsBundle.mockResolvedValue(bundle({ bills: [], items: [] }));
    const { unmount } = setup();
    expect(await screen.findByText('Belum ada tagihan.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Buat tagihan baru/ })).toBeTruthy();
    unmount();

    setup({ me: undefined });
    await screen.findByText('Belum ada tagihan.');
    expect(screen.queryByRole('button', { name: /Buat tagihan baru/ })).toBeNull();
  });

  it('berlangganan realtime ke lima tabel patungan dan berhenti saat ditutup', async () => {
    const { unmount } = setup();
    await screen.findByText('Makan malam');
    const subs = h.onCalls.map(([, cfg]) => cfg as { table: string; filter: string });
    expect(subs.map((s) => s.table).sort()).toEqual(['bill_item_assignments', 'bill_items', 'bill_shares', 'bills', 'transfers']);
    expect(subs.every((s) => s.filter === 'hangout_id=eq.h1')).toBe(true);
    unmount();
    expect(h.supabase.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('draft: menampilkan menu, siapa yang menandai, dan menu yang belum ditandai', async () => {
    h.api.fetchBillsBundle.mockResolvedValue(bundle({ assignments: [mark('i1', 'p-host')] }));
    setup();
    expect(await screen.findByText('Steak')).toBeTruthy();
    expect(screen.getByText('Nasi goreng')).toBeTruthy();
    const steakRow = screen.getByText('Steak').closest('li')!;
    expect(within(steakRow).getByText('Host')).toBeTruthy();
    expect(screen.getByText(/Belum ditandai siapa pun: Nasi goreng/)).toBeTruthy();
  });

  it('menandai pesanan sendiri: langsung tampil, lalu disimpan lewat API', async () => {
    setup();
    const row = (await screen.findByText('Nasi goreng')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Aku pesan ini' }));

    expect(await within(row).findByText('Porsimu: 1')).toBeTruthy();
    await waitFor(() => expect(h.api.setAssignment).toHaveBeenCalledWith(h.supabase, 'h1', 'i2', 'p-budi', 1));

    fireEvent.click(within(row).getByRole('button', { name: 'Tambah porsi Budi' }));
    await waitFor(() => expect(h.api.setAssignment).toHaveBeenLastCalledWith(h.supabase, 'h1', 'i2', 'p-budi', 2));
    fireEvent.click(within(row).getByRole('button', { name: 'Kurangi porsi Budi' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Kurangi porsi Budi' }));
    await waitFor(() => expect(h.api.setAssignment).toHaveBeenLastCalledWith(h.supabase, 'h1', 'i2', 'p-budi', 0));
    expect(within(row).getByRole('button', { name: 'Aku pesan ini' })).toBeTruthy();
  });

  it('teman biasa hanya bisa menandai untuk dirinya dan teman tanpa akun, bukan akun lain', async () => {
    setup();
    const select = (await screen.findByLabelText('Menandai atas nama')) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Budi (kamu)', 'Tamu']);

    fireEvent.change(select, { target: { value: 'p-tamu' } });
    const row = screen.getByText('Steak').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Tandai untuk Tamu' }));
    await waitFor(() => expect(h.api.setAssignment).toHaveBeenCalledWith(h.supabase, 'h1', 'i1', 'p-tamu', 1));
  });

  it('host boleh menandai atas nama semua peserta', async () => {
    h.ctx.session = { user: { id: 'u-host' } };
    setup({ me: host, isHost: true });
    const select = (await screen.findByLabelText('Menandai atas nama')) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['p-host', 'p-budi', 'p-tamu']);
    h.ctx.session = { user: { id: 'u-budi' } };
  });

  it('bagianmu sementara ikut menghitung service, pajak, dan diskon secara proporsional', async () => {
    h.api.fetchBillsBundle.mockResolvedValue(
      bundle({
        bills: [{ ...draft, service_amount: 4000, tax_amount: 8400 }],
        assignments: [mark('i1', 'p-host'), mark('i2', 'p-budi')],
      }),
    );
    setup();
    // Budi: 30.000 dari subtotal 80.000 => 37,5% dari (4.000 + 8.400) = 4.650; total 34.650
    const mine = (await screen.findByText('Bagianmu sementara')).parentElement!;
    expect(mine.textContent).toMatch(/34\.650/);
  });

  it('finalisasi hanya untuk host atau yang bayar, dan baru aktif bila semua menu ditandai', async () => {
    h.api.fetchBillsBundle.mockResolvedValue(bundle({ assignments: [mark('i1', 'p-host')] }));
    const { unmount } = setup();
    await screen.findByText('Steak');
    expect(screen.queryByRole('button', { name: /Finalkan/ })).toBeNull();
    expect(screen.getByText(/Host atau host yang memfinalkan|Host .* memfinalkan/)).toBeTruthy();
    unmount();

    setup({ me: host, isHost: true });
    const finalize = (await screen.findByRole('button', { name: /Finalkan dan hitung transfer/ })) as HTMLButtonElement;
    expect(finalize.disabled).toBe(true);
  });

  it('host memfinalkan tagihan yang lengkap', async () => {
    const assignments = [mark('i1', 'p-host'), mark('i2', 'p-budi')];
    h.api.fetchBillsBundle.mockResolvedValue(bundle({ assignments }));
    setup({ me: host, isHost: true });
    const finalize = (await screen.findByRole('button', { name: /Finalkan dan hitung transfer/ })) as HTMLButtonElement;
    await waitFor(() => expect(finalize.disabled).toBe(false));
    fireEvent.click(finalize);
    await waitFor(() => expect(h.api.finalizeBill).toHaveBeenCalledTimes(1));
    const [sb, bill, items, asg] = h.api.finalizeBill.mock.calls[0];
    expect(sb).toBe(h.supabase);
    expect(bill.id).toBe('b1');
    expect(items).toHaveLength(2);
    expect(asg).toEqual(assignments);
  });

  it('galat finalisasi ditampilkan', async () => {
    h.api.fetchBillsBundle.mockResolvedValue(bundle({ assignments: [mark('i1', 'p-host'), mark('i2', 'p-budi')] }));
    h.api.finalizeBill.mockRejectedValue(new Error('Gagal memfinalkan tagihan: bill sudah final'));
    setup({ me: host, isHost: true });
    fireEvent.click(await screen.findByRole('button', { name: /Finalkan dan hitung transfer/ }));
    expect((await screen.findByText(/bill sudah final/)).getAttribute('role')).toBe('alert');
  });

  it('hapus tagihan meminta konfirmasi dulu', async () => {
    setup({ me: host, isHost: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Hapus tagihan' }));
    expect(h.api.deleteBill).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, hapus' }));
    await waitFor(() => expect(h.api.deleteBill).toHaveBeenCalledWith(h.supabase, 'b1'));
  });

  it('final: ringkas dulu, rincian terbuka saat diketuk, dan bisa dibuka kembali oleh host', async () => {
    const final: BillRow = { ...draft, status: 'final', service_amount: 4000, tax_amount: 8400 };
    h.api.fetchBillsBundle.mockResolvedValue(
      bundle({
        bills: [final],
        assignments: [mark('i1', 'p-host'), mark('i2', 'p-budi')],
        shares: [
          { bill_id: 'b1', participant_id: 'p-host', subtotal: 50000, service_amount: 2500, tax_amount: 5250, discount_amount: 0, rounding_amount: 0, total: 57750 },
          { bill_id: 'b1', participant_id: 'p-budi', subtotal: 30000, service_amount: 1500, tax_amount: 3150, discount_amount: 0, rounding_amount: 0, total: 34650 },
        ],
      }),
    );
    setup({ me: host, isHost: true });
    const header = await screen.findByRole('button', { name: /Makan malam/ });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Steak')).toBeNull();

    fireEvent.click(header);
    expect(screen.getByText('Bagianmu').parentElement!.textContent).toMatch(/57\.750/);
    fireEvent.click(screen.getByRole('button', { name: /Buka kembali untuk diubah/ }));
    await waitFor(() => expect(h.api.reopenBill).toHaveBeenCalledWith(h.supabase, expect.objectContaining({ id: 'b1' })));
  });

  it('transfer: pengirim menandai sudah transfer, penerima mengonfirmasi, orang lain tidak melihat tombolnya', async () => {
    const final: BillRow = { ...draft, status: 'final' };
    h.api.fetchBillsBundle.mockResolvedValue(
      bundle({
        bills: [final],
        transfers: [
          { id: 't1', from_participant: 'p-budi', to_participant: 'p-host', amount: 34650, status: 'pending' },
          { id: 't2', from_participant: 'p-tamu', to_participant: 'p-budi', amount: 10000, status: 'paid' },
        ],
      }),
    );
    setup();
    expect(await screen.findByText('Siapa transfer ke siapa')).toBeTruthy();

    const toHost = screen.getByText('Rp 34.650', { exact: false }).closest('li')!;
    expect(within(toHost).queryByRole('button', { name: 'Konfirmasi diterima' })).toBeNull();
    fireEvent.click(within(toHost).getByRole('button', { name: 'Sudah transfer' }));
    await waitFor(() => expect(h.api.setTransferStatus).toHaveBeenCalledWith(h.supabase, 't1', 'paid'));

    const toMe = screen.getByText('Rp 10.000', { exact: false }).closest('li')!;
    expect(within(toMe).queryByRole('button', { name: 'Sudah transfer' })).toBeNull();
    fireEvent.click(within(toMe).getByRole('button', { name: 'Konfirmasi diterima' }));
    await waitFor(() => expect(h.api.setTransferStatus).toHaveBeenCalledWith(h.supabase, 't2', 'confirmed'));
  });

  it('hitung ulang transfer memanggil replanTransfers', async () => {
    h.api.fetchBillsBundle.mockResolvedValue(bundle({ bills: [{ ...draft, status: 'final' }] }));
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Hitung ulang transfer/ }));
    await waitFor(() => expect(h.api.replanTransfers).toHaveBeenCalledWith(h.supabase, 'h1'));
  });

  it('tagihan baru terisi dari tempat terpilih dan dibuat lewat API', async () => {
    h.api.fetchBillsBundle.mockResolvedValue(bundle({ bills: [], items: [] }));
    h.api.createBill.mockResolvedValue({ ...draft });
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Buat tagihan baru/ }));

    expect((screen.getByLabelText('Nama tagihan') as HTMLInputElement).value).toBe('Cafe A');
    expect((screen.getByLabelText('Service %') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('Pajak %') as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('Yang bayar ke kasir') as HTMLSelectElement).value).toBe('p-budi');

    fireEvent.click(screen.getByRole('button', { name: 'Buat tagihan' }));
    await waitFor(() =>
      expect(h.api.createBill).toHaveBeenCalledWith(h.supabase, 'h1', { title: 'Cafe A', paidBy: 'p-budi', servicePct: 5, taxPct: 10 }),
    );
  });

  it('galat memuat ditampilkan sebagai peringatan', async () => {
    h.api.fetchBillsBundle.mockRejectedValue(new Error('Gagal memuat tagihan: jaringan putus'));
    setup();
    expect((await screen.findByRole('alert')).textContent).toMatch(/jaringan putus/);
  });
});

describe('<RoomBills /> salin teks WhatsApp', () => {
  const finalBill: BillRow = { ...draft, status: 'final' };
  const finalBundle = () =>
    bundle({
      bills: [finalBill],
      assignments: [mark('i1', 'p-host'), mark('i2', 'p-budi')],
      shares: [
        { bill_id: 'b1', participant_id: 'p-host', subtotal: 50000, service_amount: 0, tax_amount: 0, discount_amount: 0, rounding_amount: 0, total: 50000 },
        { bill_id: 'b1', participant_id: 'p-budi', subtotal: 30000, service_amount: 0, tax_amount: 0, discount_amount: 0, rounding_amount: 0, total: 30000 },
      ],
      transfers: [
        { id: 't1', from_participant: 'p-budi', to_participant: 'p-host', amount: 30000, status: 'pending' },
        { id: 't2', from_participant: 'p-tamu', to_participant: 'p-host', amount: 5000, status: 'confirmed' },
      ],
    });

  it('menyalin ringkasan dengan info bayar, hanya transfer yang belum lunas, lalu menampilkan modal terima kasih', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    h.api.fetchBillsBundle.mockResolvedValue(finalBundle());
    setup();

    fireEvent.change(await screen.findByLabelText('Info bayar'), { target: { value: 'DANA 0812xxxx a.n. Host' } });
    fireEvent.click(screen.getByRole('button', { name: /Salin teks untuk WhatsApp/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = (writeText.mock.calls[0][0] as string).replace(/\u00a0/g, ' ');
    expect(text.split('\n')[0]).toBe('*Malming*');
    expect(text).toContain('Total Rp 80.000');
    expect(text).toContain('- Host: Rp 50.000');
    expect(text).toContain('- Budi ke Host: Rp 30.000');
    expect(text).not.toContain('Tamu ke Host');
    expect(text).toContain('Bayar ke: DANA 0812xxxx a.n. Host');

    expect(await screen.findByRole('button', { name: /Tersalin/ })).toBeTruthy();
    expect(document.querySelector('dialog[aria-labelledby="thank-you-title"]')).toBeTruthy();
  });

  it('bila clipboard tidak tersedia, teks ditampilkan lewat prompt agar bisa disalin manual', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    h.api.fetchBillsBundle.mockResolvedValue(finalBundle());
    setup();

    fireEvent.click(await screen.findByRole('button', { name: /Salin teks untuk WhatsApp/ }));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(prompt.mock.calls[0][1]).toContain('*Malming*');
    prompt.mockRestore();
  });
});

describe('<RoomBills /> ubah menu dan bagi rata', () => {
  it('host mengubah menu: form terisi nilai lama, tersimpan lewat API, lalu form menutup', async () => {
    setup({ me: host, isHost: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Ubah Steak' }));

    const name = screen.getByLabelText('Nama menu') as HTMLInputElement;
    expect(name.value).toBe('Steak');
    expect((screen.getByLabelText('Harga satuan') as HTMLInputElement).value.replace(/\D/g, '')).toBe('50000');

    fireEvent.change(name, { target: { value: 'Steak wagyu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan menu' }));
    await waitFor(() => expect(h.api.updateItem).toHaveBeenCalledWith(h.supabase, 'i1', { name: 'Steak wagyu', unitPrice: 50000, qty: 1 }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Simpan menu' })).toBeNull());
  });

  it('gagal menyimpan: form tetap terbuka dan galat tampil', async () => {
    h.api.updateItem.mockRejectedValue(new Error('Menu tidak bisa diubah (mungkin tagihan sudah final).'));
    setup({ me: host, isHost: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Ubah Steak' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan menu' }));
    expect((await screen.findByText(/sudah final/)).getAttribute('role')).toBe('alert');
    expect(screen.getByRole('button', { name: 'Simpan menu' })).toBeTruthy();
  });

  it('teman biasa tidak melihat tombol ubah menu', async () => {
    setup();
    await screen.findByText('Steak');
    expect(screen.queryByRole('button', { name: /^Ubah / })).toBeNull();
  });

  it('host bisa membagi rata menu yang belum ditandai, lalu finalisasi membawa opsinya', async () => {
    h.api.fetchBillsBundle.mockResolvedValue(bundle({ assignments: [mark('i1', 'p-host')] })); // Nasi goreng belum
    setup({ me: host, isHost: true });

    const finalize = (await screen.findByRole('button', { name: /Finalkan dan hitung transfer/ })) as HTMLButtonElement;
    expect(finalize.disabled).toBe(true);

    const box = screen.getByRole('checkbox', { name: /Bagi rata menu yang belum ditandai/ }) as HTMLInputElement;
    expect(screen.getByText(/Dibagi sama rata ke 1 orang yang sudah menandai: Host/)).toBeTruthy();
    fireEvent.click(box);

    await waitFor(() => expect(finalize.disabled).toBe(false));
    expect(screen.getByText(/Belum ditandai, dibagi rata saat difinalkan/)).toBeTruthy();
    expect(screen.queryByText(/Belum ditandai siapa pun/)).toBeNull();

    fireEvent.click(finalize);
    await waitFor(() => expect(h.api.finalizeBill).toHaveBeenCalledTimes(1));
    expect(h.api.finalizeBill.mock.calls[0][4]).toEqual({ shareUnassigned: true });
  });

  it('belum ada yang menandai: pilihan bagi rata nonaktif; teman biasa tidak melihatnya', async () => {
    const { unmount } = setup({ me: host, isHost: true });
    const box = (await screen.findByRole('checkbox', { name: /Bagi rata menu yang belum ditandai/ })) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(screen.getByText(/Menunggu sedikitnya satu orang menandai/)).toBeTruthy();
    unmount();

    setup();
    await screen.findByText('Steak');
    expect(screen.queryByRole('checkbox', { name: /Bagi rata/ })).toBeNull();
  });
});
