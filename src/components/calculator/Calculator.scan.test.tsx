// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import fixtures from '@/lib/ocr/__fixtures__/synthetic-ocr.json';
import type { OcrWord } from '@/lib/ocr/types';
import { Calculator } from './Calculator';
import { STORAGE_KEY } from './state';

const h = vi.hoisted(() => ({
  run: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock('@/lib/ocr/engines', async (orig) => ({ ...(await orig<typeof import('@/lib/ocr/engines')>()), runEngine: h.run }));
vi.mock('@/lib/ocr/preprocess', async (orig) => ({ ...(await orig<typeof import('@/lib/ocr/preprocess')>()), prepareCanvas: h.prepare }));

const fx = (name: string): OcrWord[] => (fixtures as Record<string, { words: OcrWord[] }>)[name].words;
const out = (words: OcrWord[]) => ({ text: '', words, loadMs: 0, recognizeMs: 10 });

const scan = (name = 'struk.jpg') =>
  fireEvent.change(screen.getByLabelText('Foto struk'), { target: { files: [new File(['x'], name, { type: 'image/jpeg' })] } });

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.removeAttribute('open');
  };
  localStorage.clear();
  window.history.replaceState(null, '', '/calculator');
  h.run.mockReset().mockResolvedValue(out(fx('cafe_clean')));
  h.prepare.mockReset().mockResolvedValue({});
});

afterEach(cleanup);

describe('<Calculator /> scan struk', () => {
  it('menampilkan tombol Scan struk dan keterangan privasi di halaman kalkulator', () => {
    render(<Calculator />);
    const scanBtn = screen.getByRole('button', { name: 'Scan struk' });
    expect(scanBtn).toBeTruthy();
    expect(screen.getByText(/tidak diunggah/)).toBeTruthy();
    expect(screen.getByText(/perlu dicek ulang dengan struk/)).toBeTruthy();
  });

  it('alur scan struk: membaca foto, meninjau hasil, dan menyimpan menu serta service/pajak ke kalkulator', async () => {
    render(<Calculator />);
    scan();

    // Lembar tinjau terbuka
    expect(await screen.findByText('Cek ulang hasil scan dengan struk')).toBeTruthy();

    // Membaca item dari struk cafe_clean
    expect((screen.getByLabelText('Nama menu baris 1') as HTMLInputElement).value).toBe('Es Kopi Susu');
    expect((screen.getByLabelText('Nama menu baris 2') as HTMLInputElement).value).toBe('Croissant Butter');

    // Simpan ke kalkulator
    const saveBtn = await screen.findByRole('button', { name: 'Simpan ke tagihan' });
    fireEvent.click(saveBtn);

    // Lembar tinjau menutup
    await waitFor(() => expect(screen.queryByText('Cek ulang hasil scan dengan struk')).toBeNull());

    // Notifikasi scan muncul
    const note = await screen.findByRole('status');
    expect(note.textContent).toMatch(/3 menu dari scan struk sudah ditambahkan/);

    // Menu muncul di daftar pesanan kalkulator
    const menuInputs = screen.getAllByPlaceholderText('Nama menu') as HTMLInputElement[];
    expect(menuInputs).toHaveLength(3);
    expect(menuInputs[0].value).toBe('Es Kopi Susu');
    expect(menuInputs[1].value).toBe('Croissant Butter');
    expect(menuInputs[2].value).toBe('Matcha Latte');

    // Angka service dan tax override terisi dari struk
    const serviceInput = screen.getByLabelText('Service (Rp)') as HTMLInputElement;
    const taxInput = screen.getByLabelText('Pajak (Rp)') as HTMLInputElement;
    expect(serviceInput.value.replace(/\D/g, '')).toBe('4800');
    expect(taxInput.value.replace(/\D/g, '')).toBe('10080');

    // Data tersimpan di localStorage
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(saved.items).toHaveLength(3);
    expect(saved.serviceOverride).toBe(4800);
    expect(saved.taxOverride).toBe(10080);

    // Notifikasi scan dapat ditutup
    fireEvent.click(screen.getByRole('button', { name: 'Tutup info scan' }));
    expect(screen.queryByText(/3 menu dari scan struk sudah ditambahkan/)).toBeNull();
  });

  it('menu hasil scan dapat langsung ditandai siapa yang makan bila orang sudah ditambahkan', async () => {
    render(<Calculator />);

    // Tambah teman: Febyan dan Budi
    const nameInput = screen.getByPlaceholderText('Nama teman');
    fireEvent.change(nameInput, { target: { value: 'Febyan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(nameInput, { target: { value: 'Budi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));

    // Scan struk
    scan();
    const saveBtn = await screen.findByRole('button', { name: 'Simpan ke tagihan' });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(screen.queryByText('Cek ulang hasil scan dengan struk')).toBeNull());

    // Setiap menu memiliki tombol untuk Febyan dan Budi
    const firstItem = screen.getAllByPlaceholderText('Nama menu')[0].closest('div.space-y-2') as HTMLElement;
    const febyanBtn = within(firstItem).getByRole('button', { name: 'Febyan' });
    const budiBtn = within(firstItem).getByRole('button', { name: 'Budi' });
    expect(febyanBtn).toBeTruthy();
    expect(budiBtn).toBeTruthy();

    // Tandai Febyan makan item pertama
    fireEvent.click(febyanBtn);
    expect(febyanBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('reset data kalkulator juga membersihkan notifikasi scan', async () => {
    render(<Calculator />);
    scan();
    const saveBtn = await screen.findByRole('button', { name: 'Simpan ke tagihan' });
    fireEvent.click(saveBtn);
    await screen.findByRole('status');

    // Klik reset
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ya, reset' }));

    // Menu dan notifikasi kosong kembali
    expect(screen.getByText('Belum ada pesanan.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
