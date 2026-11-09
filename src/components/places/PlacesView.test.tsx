// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionRoot } from '@/components/MotionRoot';
import { PLACES_KEY, parsePlaces } from '@/lib/places/store';
import { PlacesView } from './PlacesView';

beforeAll(() => {
  // animasi dikurangi => roda langsung berhenti
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const setup = () =>
  render(
    <MotionRoot>
      <PlacesView />
    </MotionRoot>,
  );

const stored = () => parsePlaces(localStorage.getItem(PLACES_KEY));
const loadSamples = async () => {
  setup();
  fireEvent.click(await screen.findByText('Coba dengan contoh'));
};
const names = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('<PlacesView />', () => {
  it('awalnya kosong dan menawarkan contoh', async () => {
    setup();
    expect(await screen.findByText('Belum ada tempat')).toBeTruthy();
  });

  it('contoh terisi, urut abjad, dan tersimpan di perangkat', async () => {
    await loadSamples();
    expect(names()).toEqual(['Billiard 88', 'Cafe A', 'Warung Mie']);
    expect(stored().map((p) => p.name).sort()).toEqual(['Billiard 88', 'Cafe A', 'Warung Mie']);
  });

  it('menampilkan service dan pajak tiap tempat serta sewa per jam', async () => {
    await loadSamples();
    expect(screen.getByText(/Service 5%, pajak 10%/)).toBeTruthy();
    expect(screen.getByText(/Rp.*45\.000 per jam/)).toBeTruthy();
  });

  it('filter kategori dan pencarian', async () => {
    await loadSamples();
    fireEvent.click(screen.getByRole('button', { name: 'Game' })); // Billiard termasuk induk Game
    expect(names()).toEqual(['Billiard 88']);
    expect(screen.getByText(/minimal 2 tempat/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Putar roda/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Semua' }));
    fireEvent.change(screen.getByLabelText('Cari tempat'), { target: { value: 'warung' } });
    expect(names()).toEqual(['Warung Mie']);
    fireEvent.change(screen.getByLabelText('Cari tempat'), { target: { value: 'zzz' } });
    expect(screen.getByText('Tidak ada tempat yang cocok.')).toBeTruthy();
  });

  it('tambah tempat lewat formulir, dengan validasi', async () => {
    await loadSamples();
    fireEvent.click(screen.getByRole('button', { name: /^Tambah$/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Tambah tempat' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));
    expect(within(dialog).getByText('Nama tempat wajib diisi.')).toBeTruthy();

    fireEvent.change(within(dialog).getByPlaceholderText('Mis. Cafe A'), { target: { value: 'Kopi Sudut' } });
    fireEvent.change(within(dialog).getByLabelText('Service (%)'), { target: { value: '7,5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    expect(names()).toContain('Kopi Sudut');
    const saved = stored().find((p) => p.name === 'Kopi Sudut');
    expect(saved).toMatchObject({ servicePct: 7.5, taxPct: 10, categorySlug: 'cafe', visits: 0 });
  });

  it('ubah tempat memperbarui persennya', async () => {
    await loadSamples();
    fireEvent.click(screen.getByRole('button', { name: 'Ubah Cafe A' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ubah tempat' });
    fireEvent.change(within(dialog).getByLabelText('Pajak (%)'), { target: { value: '11' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));
    expect(stored().find((p) => p.name === 'Cafe A')?.taxPct).toBe(11);
    expect(screen.getByText(/Service 5%, pajak 11%/)).toBeTruthy();
  });

  it('catat kunjungan memperbarui hitungan dan tersimpan', async () => {
    await loadSamples();
    expect(screen.getAllByText('Belum pernah dikunjungi')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Catat kunjungan ke Cafe A' }));
    expect(screen.getByText('1 kali, terakhir hari ini')).toBeTruthy();
    expect(stored().find((p) => p.name === 'Cafe A')?.visits).toBe(1);
  });

  it('hapus meminta konfirmasi dulu, dan batal tidak menghapus', async () => {
    await loadSamples();
    fireEvent.click(screen.getByRole('button', { name: 'Hapus Warung Mie' }));
    let dialog = await screen.findByRole('dialog', { name: 'Hapus tempat?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Batal' }));
    expect(names()).toContain('Warung Mie');

    fireEvent.click(screen.getByRole('button', { name: 'Hapus Warung Mie' }));
    dialog = await screen.findByRole('dialog', { name: 'Hapus tempat?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hapus' }));
    expect(names()).not.toContain('Warung Mie');
    expect(stored()).toHaveLength(2);
  });

  it('tiap tempat punya tautan ke kalkulator dengan id-nya', async () => {
    await loadSamples();
    const id = stored().find((p) => p.name === 'Cafe A')?.id;
    const links = screen.getAllByRole('link', { name: /Hitung patungan di sini/ });
    expect(links.map((a) => a.getAttribute('href'))).toContain(`/calculator?place=${id}`);
  });

  it('roda dari daftar: memilih satu tempat dan menawarkan hitung patungan di sana', async () => {
    await loadSamples();
    fireEvent.click(screen.getByRole('button', { name: /^Putar roda$/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Putar dari 3 tempat' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Putar roda' }));

    expect(within(dialog).getByText('Malam ini ke')).toBeTruthy();
    const link = within(dialog).getByRole('link', { name: /Hitung patungan di sini/ });
    expect(link.getAttribute('href')).toMatch(/^\/calculator\?place=/);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Catat kunjungan' }));
    expect(within(dialog).getByRole('button', { name: 'Kunjungan tercatat' })).toBeTruthy();
    expect(stored().reduce((a, p) => a + p.visits, 0)).toBe(1);
  });

  it('data rusak di penyimpanan tidak membuat halaman crash', async () => {
    localStorage.setItem(PLACES_KEY, '{"bukan":"array"}');
    setup();
    expect(await screen.findByText('Belum ada tempat')).toBeTruthy();
  });
});
