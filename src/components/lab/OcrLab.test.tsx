// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import fixtures from '@/lib/ocr/__fixtures__/synthetic-ocr.json';
import type { OcrWord } from '@/lib/ocr/types';

const h = vi.hoisted(() => ({
  run: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock('@/lib/ocr/engines', async (orig) => ({ ...(await orig<typeof import('@/lib/ocr/engines')>()), runEngine: h.run }));
vi.mock('@/lib/ocr/preprocess', async (orig) => ({ ...(await orig<typeof import('@/lib/ocr/preprocess')>()), prepareCanvas: h.prepare }));

import { OcrLab } from './OcrLab';

const fx = (name: string) => (fixtures as Record<string, { text: string; words: OcrWord[] }>)[name];
const output = (name: string) => ({ text: fx(name).text, words: fx(name).words, loadMs: 1200, recognizeMs: 800 });
const plain = (s: string | null) => (s ?? '').replace(/\u00a0/g, ' ');

beforeEach(() => {
  h.run.mockReset();
  h.prepare.mockReset().mockResolvedValue({ toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/jpeg' })) });
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const pick = (name = 'struk.jpg') =>
  fireEvent.change(screen.getByLabelText('Pilih foto dari galeri'), { target: { files: [new File(['x'], name, { type: 'image/jpeg' })] } });

describe('<OcrLab />', () => {
  it('awalnya: Tesseract terpilih, PaddleOCR tidak, dan tombol jalan nonaktif sampai ada foto', () => {
    render(<OcrLab />);
    expect((screen.getByRole('checkbox', { name: /Tesseract/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: /PaddleOCR/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('button', { name: 'Jalankan OCR' }) as HTMLButtonElement).disabled).toBe(true);
    pick();
    expect((screen.getByRole('button', { name: 'Jalankan OCR' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Dipilih: struk.jpg/)).toBeTruthy();
  });

  it('menjalankan mesin dan menampilkan menu, biaya, waktu, dan status cocok', async () => {
    h.run.mockResolvedValue(output('cafe_clean'));
    render(<OcrLab />);
    pick();
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan OCR' }));

    const found = (await screen.findByText(/Hasil terbaca \(3 menu\)/)).closest('details')!;
    expect(h.run).toHaveBeenCalledWith('tesseract', expect.anything());
    for (const name of ['Es Kopi Susu', 'Croissant Butter', 'Matcha Latte']) expect(within(found).getByText(name)).toBeTruthy();
    expect(plain(screen.getByRole('status').textContent)).toMatch(/Cocok: hitungan Rp 110.800/);
    expect(screen.getByText(/Muat model 1.2 dtk, baca foto 800 ms/)).toBeTruthy();
  });

  it('opsi pra-olah diteruskan ke penyiapan foto', async () => {
    h.run.mockResolvedValue(output('cafe_clean'));
    render(<OcrLab />);
    pick();
    fireEvent.click(screen.getByRole('checkbox', { name: /Perjelas kontras/ }));
    fireEvent.change(screen.getByLabelText(/Ukuran foto/), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan OCR' }));
    await screen.findByText(/Hasil terbaca/);
    expect(h.prepare).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ enhance: false, maxEdge: 2000 }));
  });

  it('baris menu yang meragukan ditandai dengan alasannya, dan hasil tak cocok diberi peringatan', async () => {
    h.run.mockResolvedValue(output('cafe_hard'));
    render(<OcrLab />);
    pick();
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan OCR' }));
    expect(await screen.findByText(/Tidak cocok: hitungan/)).toBeTruthy();
    expect(screen.getByText(/Cek: 2 x 18068 tidak sama dengan 36806/)).toBeTruthy();
    expect(screen.getByText(/Peringatan \(\d+\)/)).toBeTruthy();
  });

  it('satu mesin gagal tidak menghentikan mesin lain, galatnya tampil apa adanya', async () => {
    h.run.mockImplementation(async (id: string) => {
      if (id === 'paddle') throw new Error('failed to load model: 404');
      return output('resto_clean');
    });
    render(<OcrLab />);
    pick();
    fireEvent.click(screen.getByRole('checkbox', { name: /PaddleOCR/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan OCR' }));

    expect(await screen.findByText(/Hasil terbaca \(4 menu\)/)).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toMatch(/failed to load model: 404/);
    expect(h.run).toHaveBeenCalledTimes(2);
  });

  it('foto tidak bisa dibuka: galat penyiapan ditampilkan', async () => {
    h.prepare.mockRejectedValue(new Error('Kanvas tidak tersedia di browser ini.'));
    render(<OcrLab />);
    pick();
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan OCR' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Kanvas tidak tersedia/);
    expect(h.run).not.toHaveBeenCalled();
  });

  it('laporan JSON berisi hasil baca tetapi tidak memuat gambar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    h.run.mockResolvedValue(output('mart_clean'));
    render(<OcrLab />);
    pick();
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan OCR' }));
    fireEvent.click(await screen.findByRole('button', { name: /Salin laporan/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const report = JSON.parse(writeText.mock.calls[0][0]);
    expect(report.runs[0].engine).toBe('tesseract');
    expect(report.runs[0].rawText).toContain('INDOMIE');
    expect(report.runs[0].parsed.items).toHaveLength(3);
    expect(report.runs[0].parsed.total).toBe(30500);
    expect(JSON.stringify(report)).not.toMatch(/data:image|blob:/);
    expect(await screen.findByRole('button', { name: /Tersalin/ })).toBeTruthy();
  });

  it('bagian baris terbaca dan teks mentah tersedia untuk diperiksa', async () => {
    h.run.mockResolvedValue(output('cafe_clean'));
    render(<OcrLab />);
    pick();
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan OCR' }));
    const rows = (await screen.findByText(/Baris terbaca \(\d+\)/)).closest('details')!;
    expect(within(rows).getByText(/Croissant Butter\s+28\.000/)).toBeTruthy();
    expect(screen.getByText('Teks mentah dari mesin')).toBeTruthy();
  });
});
