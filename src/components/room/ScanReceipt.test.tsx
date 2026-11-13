// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import fixtures from '@/lib/ocr/__fixtures__/synthetic-ocr.json';
import type { OcrWord } from '@/lib/ocr/types';
import type { BillRow } from '@/lib/supabase/types';

const h = vi.hoisted(() => ({
  supabase: { tag: 'sb' },
  run: vi.fn(),
  prepare: vi.fn(),
  addItems: vi.fn(),
  updateBill: vi.fn(),
}));
vi.mock('@/components/SupabaseProvider', () => ({ useSupabase: () => ({ supabase: h.supabase, session: null, restored: true, ensureSession: vi.fn() }) }));
vi.mock('@/lib/ocr/engines', async (orig) => ({ ...(await orig<typeof import('@/lib/ocr/engines')>()), runEngine: h.run }));
vi.mock('@/lib/ocr/preprocess', async (orig) => ({ ...(await orig<typeof import('@/lib/ocr/preprocess')>()), prepareCanvas: h.prepare }));
vi.mock('@/lib/room/bills', async (orig) => ({ ...(await orig<typeof import('@/lib/room/bills')>()), addItems: h.addItems, updateBill: h.updateBill }));

import { ScanReceipt } from './ScanReceipt';

const bill: BillRow = {
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
  created_at: '2026-11-13T10:00:00Z',
};

const fx = (name: string): OcrWord[] => (fixtures as Record<string, { words: OcrWord[] }>)[name].words;
/** Kata OCR dari teks per baris (satu "kata" per baris sudah cukup untuk parser). */
const wordsOf = (...lines: string[]): OcrWord[] =>
  lines.map((text, i) => ({ text, x0: 0, y0: i * 20, x1: text.length * 10, y1: i * 20 + 16, line: i }));
const out = (words: OcrWord[]) => ({ text: '', words, loadMs: 0, recognizeMs: 10 });
const plain = (s: string | null) => (s ?? '').replace(/\u00a0/g, ' ');

function setup(props: Partial<React.ComponentProps<typeof ScanReceipt>> = {}) {
  const onSaved = vi.fn();
  render(<ScanReceipt bill={bill} itemCount={0} nextSortOrder={0} onSaved={onSaved} {...props} />);
  return { onSaved };
}
const scan = (name = 'struk.jpg') =>
  fireEvent.change(screen.getByLabelText('Foto struk'), { target: { files: [new File(['x'], name, { type: 'image/jpeg' })] } });
const price = (n: number) => screen.getByLabelText(`Harga satuan baris ${n}`) as HTMLInputElement;
const status = () => plain(screen.getByRole('status').textContent);

beforeEach(() => {
  h.run.mockReset().mockResolvedValue(out(fx('cafe_clean')));
  h.prepare.mockReset().mockResolvedValue({});
  h.addItems.mockReset().mockResolvedValue([]);
  h.updateBill.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('<ScanReceipt />', () => {
  it('tombol Scan struk disertai keterangan bahwa foto tidak diunggah dan hasilnya perlu dicek ulang', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Scan struk' })).toBeTruthy();
    expect(screen.getByText(/tidak diunggah/)).toBeTruthy();
    expect(screen.getByText(/perlu dicek ulang dengan struk/)).toBeTruthy();
  });

  it('membaca foto dengan Tesseract lalu membuka lembar tinjau dengan peringatan cek ulang', async () => {
    setup();
    scan();
    const alert = await screen.findByText('Cek ulang hasil scan dengan struk');
    expect(alert.closest('[role="alert"]')!.textContent).toMatch(/cocokkan setiap baris dan total .* struk asli sebelum menyimpan/);
    expect(h.prepare).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ maxEdge: 1600, enhance: true }));
    expect(h.run).toHaveBeenCalledWith('tesseract', expect.anything());
    expect((screen.getByLabelText('Nama menu baris 1') as HTMLInputElement).value).toBe('Es Kopi Susu');
    expect(price(1).value.replace(/\D/g, '')).toBe('18000');
    expect(screen.getByLabelText('Jumlah baris 1').textContent).toBe('2');
    expect(status()).toMatch(/Cocok: hitungan Rp 110.800/);
  });

  it('mengubah angka langsung memperbarui pencocokan dengan total struk', async () => {
    setup();
    scan();
    await screen.findByText('Cek ulang hasil scan dengan struk');
    fireEvent.change(price(2), { target: { value: '29000' } });
    await waitFor(() => expect(status()).toMatch(/Belum cocok: hitungan Rp 111.800, total di struk Rp 110.800 \(selisih Rp 1.000\)/));
    fireEvent.change(price(2), { target: { value: '28000' } });
    await waitFor(() => expect(status()).toMatch(/Cocok/));
  });

  it('saran perbaikan satu digit bisa dipakai dan langsung mencocokkan hitungan', async () => {
    h.run.mockResolvedValue(out(wordsOf('Kopi  50.600', 'Roti  30.000', 'Subtotal  80.000', 'TOTAL  80.000')));
    setup();
    scan();
    expect(await screen.findByText(/Mungkin salah baca satu digit/)).toBeTruthy();
    expect(status()).toMatch(/Belum cocok/);
    fireEvent.click(screen.getByRole('button', { name: 'Pakai' }));
    await waitFor(() => expect(status()).toMatch(/Cocok/));
    expect(screen.queryByText(/Mungkin salah baca satu digit/)).toBeNull();
  });

  it('baris yang meragukan ditandai dengan alasannya', async () => {
    h.run.mockResolvedValue(out(fx('mart_clean')));
    setup();
    scan();
    expect(await screen.findByText(/Cek baris ini: jumlah dan harga satuan tidak terbaca jelas/)).toBeTruthy();
  });

  it('menyimpan: menu hasil edit masuk lewat addItems, angka struk lewat updateBill, lalu lembar tinjau menutup', async () => {
    const { onSaved } = setup({ itemCount: 2, nextSortOrder: 7 });
    scan();
    await screen.findByText('Cek ulang hasil scan dengan struk');
    expect(screen.getByText(/sudah punya 2 menu. Hasil scan akan ditambahkan/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nama menu baris 3'), { target: { value: 'Matcha Latte Dingin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan ke tagihan' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(3, undefined));
    expect(h.addItems).toHaveBeenCalledWith(
      h.supabase,
      'h1',
      'b1',
      [
        { name: 'Es Kopi Susu', unitPrice: 18000, qty: 2 },
        { name: 'Croissant Butter', unitPrice: 28000, qty: 1 },
        { name: 'Matcha Latte Dingin', unitPrice: 32000, qty: 1 },
      ],
      7,
      2,
    );
    expect(h.updateBill).toHaveBeenCalledWith(h.supabase, 'b1', { service_amount: 4800, tax_amount: 10080, discount_amount: 0, rounding_amount: -80 });
    await waitFor(() => expect(screen.queryByText('Cek ulang hasil scan dengan struk')).toBeNull());
  });

  it('angka struk yang tidak ditemukan scan tidak menimpa angka yang sudah tersimpan di tagihan', async () => {
    h.run.mockResolvedValue(out(wordsOf('Kopi  50.000', 'Roti  30.000')));
    const { onSaved } = setup();
    // render ulang dengan tagihan yang sudah punya service 4.000
    cleanup();
    render(<ScanReceipt bill={{ ...bill, service_amount: 4000 }} itemCount={0} nextSortOrder={0} onSaved={onSaved} />);
    scan();
    await screen.findByText('Cek ulang hasil scan dengan struk');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan ke tagihan' }));
    await waitFor(() => expect(h.updateBill).toHaveBeenCalled());
    expect(h.updateBill.mock.calls[0][2]).toMatchObject({ service_amount: 4000 });
  });

  it('validasi: nama kosong atau harga kosong menghalangi penyimpanan dan menyebut barisnya', async () => {
    setup();
    scan();
    await screen.findByText('Cek ulang hasil scan dengan struk');
    fireEvent.change(screen.getByLabelText('Nama menu baris 2'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan ke tagihan' }));
    expect((await screen.findByText(/Baris 2: Nama menu wajib diisi/)).getAttribute('role')).toBe('alert');
    expect(h.addItems).not.toHaveBeenCalled();
  });

  it('baris bisa dihapus dan ditambah; baris baru yang kosong ditolak', async () => {
    setup();
    scan();
    await screen.findByText('Cek ulang hasil scan dengan struk');
    fireEvent.click(screen.getByRole('button', { name: 'Hapus baris 1' }));
    expect(screen.queryByLabelText('Nama menu baris 3')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Tambah baris/ }));
    expect(screen.getByLabelText('Nama menu baris 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan ke tagihan' }));
    expect(await screen.findByText(/Baris 3: Nama menu wajib diisi/)).toBeTruthy();
  });

  it('gagal menyimpan menu: galat tampil, lembar tetap terbuka, angka struk tidak disentuh', async () => {
    h.addItems.mockRejectedValue(new Error('Gagal menyimpan menu: jaringan putus'));
    const { onSaved } = setup();
    scan();
    await screen.findByText('Cek ulang hasil scan dengan struk');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan ke tagihan' }));
    expect((await screen.findByText(/jaringan putus/)).getAttribute('role')).toBe('alert');
    expect(h.updateBill).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText('Cek ulang hasil scan dengan struk')).toBeTruthy();
  });

  it('menu tersimpan tetapi angka struk gagal: lembar menutup (agar tidak menyimpan dua kali) dan pemanggil diberi peringatan', async () => {
    h.updateBill.mockRejectedValue(new Error('RLS'));
    const { onSaved } = setup();
    scan();
    await screen.findByText('Cek ulang hasil scan dengan struk');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan ke tagihan' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.calls[0][0]).toBe(3);
    expect(onSaved.mock.calls[0][1]).toMatch(/Ubah service, pajak, diskon/);
    expect(screen.queryByText('Cek ulang hasil scan dengan struk')).toBeNull();
  });

  it('tidak ada menu terbaca: pesan bantuan, tanpa lembar tinjau', async () => {
    h.run.mockResolvedValue(out(wordsOf('foto buram', 'tidak terbaca')));
    setup();
    scan();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Tidak ada menu yang terbaca/);
    expect(screen.queryByText('Cek ulang hasil scan dengan struk')).toBeNull();
  });

  it('mesin OCR gagal dimuat: pesan galat dan tombol bisa dipakai lagi', async () => {
    h.run.mockRejectedValue(new Error('Failed to fetch /ocr/tesseract/core'));
    setup();
    scan();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Scan gagal: Failed to fetch .*isi menu manual/);
    expect((screen.getByRole('button', { name: 'Scan struk' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('batal menutup lembar tinjau tanpa menyimpan apa pun', async () => {
    setup();
    scan();
    await screen.findByText('Cek ulang hasil scan dengan struk');
    const sheet = screen.getByText('Cek ulang hasil scan dengan struk').closest('dialog') ?? document.body;
    fireEvent.click(within(sheet as HTMLElement).getByRole('button', { name: 'Batal' }));
    await waitFor(() => expect(screen.queryByText('Cek ulang hasil scan dengan struk')).toBeNull());
    expect(h.addItems).not.toHaveBeenCalled();
  });
});
