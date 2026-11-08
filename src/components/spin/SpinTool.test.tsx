// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionRoot } from '@/components/MotionRoot';
import { SPIN_STORAGE_KEY, SpinTool } from './SpinTool';

// Pengguna meminta animasi dikurangi => roda langsung berhenti (tanpa menunggu 4 detik).
beforeAll(() => {
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
      <SpinTool />
    </MotionRoot>,
  );

function addOption(label: string) {
  fireEvent.change(screen.getByLabelText('Pilihan baru'), { target: { value: label } });
  fireEvent.click(screen.getByRole('button', { name: /Tambah/ }));
}

describe('<SpinTool />', () => {
  it('awalnya meminta pilihan dan belum menampilkan roda', () => {
    setup();
    expect(screen.getByText('Tambahkan pilihan dulu')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Putar roda' })).toBeNull();
  });

  it('roda muncul setelah 2 pilihan; menolak duplikat tanpa peduli huruf besar', () => {
    setup();
    addOption('Cafe A');
    expect(screen.queryByRole('button', { name: 'Putar roda' })).toBeNull();
    addOption('cafe a');
    expect(screen.getByText(/sudah ada di roda/)).toBeTruthy();
    addOption('Billiard');
    expect(screen.getByRole('button', { name: 'Putar roda' })).toBeTruthy();
    expect(screen.getByText('2/20')).toBeTruthy();
  });

  it('memutar, menampilkan hasil dari daftar, mencatat riwayat, dan "coret" menyisihkan pilihan', () => {
    setup();
    ['Cafe A', 'Billiard', 'Karaoke'].forEach(addOption);

    fireEvent.click(screen.getByRole('button', { name: 'Putar roda' }));
    expect(screen.getByText('Hasilnya')).toBeTruthy();
    const hasil = screen.getByText('Hasilnya').nextElementSibling as HTMLElement;
    expect(['Cafe A', 'Billiard', 'Karaoke']).toContain(hasil.textContent);
    expect(screen.getByText('Hasil sebelumnya')).toBeTruthy();

    const winner = hasil.textContent as string;
    fireEvent.click(screen.getByRole('button', { name: 'Coret dari roda' }));
    expect(screen.getByText('2/20')).toBeTruthy();
    expect(screen.queryByRole('button', { name: `Hapus ${winner}` })).toBeNull();
    expect(screen.queryByText('Hasilnya')).toBeNull(); // hasil lama dibersihkan
  });

  it('"Putar lagi" menghasilkan hasil baru', () => {
    setup();
    ['A', 'B'].forEach(addOption);
    fireEvent.click(screen.getByRole('button', { name: 'Putar roda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Putar lagi' }));
    const history = screen.getByText('Hasil sebelumnya').closest('section') as HTMLElement;
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
  });

  it('tersimpan di perangkat dan pulih setelah muat ulang', () => {
    const first = setup();
    ['Cafe A', 'Billiard'].forEach(addOption);
    fireEvent.click(screen.getByRole('button', { name: 'Putar roda' }));
    const saved = JSON.parse(localStorage.getItem(SPIN_STORAGE_KEY) ?? 'null');
    expect(saved.options).toEqual(['Cafe A', 'Billiard']);
    expect(saved.history).toHaveLength(1);

    first.unmount();
    setup();
    expect(screen.getByRole('button', { name: 'Putar roda' })).toBeTruthy();
    expect(screen.getByText('Hasil sebelumnya')).toBeTruthy();
  });

  it('"Coba dengan contoh" mengisi roda, dan data rusak di penyimpanan diabaikan', () => {
    localStorage.setItem(SPIN_STORAGE_KEY, '{"options":"bukan-array"}');
    setup();
    fireEvent.click(screen.getByText('Coba dengan contoh'));
    expect(screen.getByRole('button', { name: 'Putar roda' })).toBeTruthy();
    expect(screen.getByText('6/20')).toBeTruthy();
  });
});
