// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Calculator } from './Calculator';
import { STORAGE_KEY } from './state';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('<Calculator />', () => {
  it('awalnya kosong dan meminta data minimal', () => {
    render(<Calculator />);
    expect(screen.getByText(/minimal 2 orang dan 1 menu/i)).toBeTruthy();
  });

  it('contoh: service & pajak dibagi proporsional, transfer mengarah ke penalang', async () => {
    render(<Calculator />);
    fireEvent.click(screen.getByText('Coba contoh'));

    // Subtotal 124.000 + service 5% (6.200) + pajak 10% dari (subtotal+service) (13.020) = 143.220
    expect((await screen.findAllByText(/143\.220/)).length).toBeGreaterThan(0);

    const hasil = screen.getByText('4. Hasil').closest('section') as HTMLElement;
    // Febyan 66.990, Budi 43.890, Siti 32.340
    expect(within(hasil).getAllByText(/66\.990/).length).toBeGreaterThan(0);
    expect(within(hasil).getAllByText(/43\.890/).length).toBeGreaterThan(0);
    expect(within(hasil).getAllByText(/32\.340/).length).toBeGreaterThan(0);
    // Transfer: Budi -> Febyan dan Siti -> Febyan
    expect(hasil.textContent).toMatch(/Budi\s*ke\s*Febyan/);
    expect(hasil.textContent).toMatch(/Siti\s*ke\s*Febyan/);
    expect(hasil.textContent).toMatch(/talangin/);
  });

  it('menyimpan ke localStorage (tahan offline & refresh)', async () => {
    const { unmount } = render(<Calculator />);
    fireEvent.click(screen.getByText('Coba contoh'));
    await screen.findAllByText(/143\.220/);

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(saved.people).toHaveLength(3);
    expect(saved.items).toHaveLength(4);

    unmount();
    render(<Calculator />); // "refresh"
    expect((await screen.findAllByText(/143\.220/)).length).toBeGreaterThan(0);
  });

  it('item yang belum ditandai siapa pun memunculkan peringatan, bukan crash', async () => {
    render(<Calculator />);
    fireEvent.click(screen.getByText('Coba contoh'));
    await screen.findAllByText(/143\.220/);

    // Kosongkan penerima item pertama (Steak): ketuk Febyan sampai porsinya kembali 0.
    const steakCard = screen.getAllByPlaceholderText('Nama menu')[0].closest('div.space-y-2') as HTMLElement;
    const febyan = within(steakCard).getByRole('button', { name: /^Febyan/ });
    for (let i = 0; i < 4; i++) fireEvent.click(febyan);

    expect(await screen.findByText(/belum ditandai siapa pun/i)).toBeTruthy();
  });

  it('angka struk (override) menggantikan hitungan dari persen', async () => {
    render(<Calculator />);
    fireEvent.click(screen.getByText('Coba contoh'));
    await screen.findAllByText(/143\.220/);

    const [serviceInput] = screen.getAllByPlaceholderText('6200');
    fireEvent.change(serviceInput, { target: { value: '10000' } });
    // 124.000 + 10.000 + 13.020 = 147.020
    expect((await screen.findAllByText(/147\.020/)).length).toBeGreaterThan(0);
  });

  it('reset data menampilkan modal konfirmasi dan mengosongkan state saat disetujui', async () => {
    HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.showModal ?? function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = HTMLDialogElement.prototype.close ?? function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    render(<Calculator />);
    fireEvent.click(screen.getByText('Coba contoh'));
    await screen.findAllByText(/143\.220/);

    // Klik tombol Reset
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    // Modal popup muncul
    expect(screen.getByRole('heading', { name: 'Reset data kalkulator?' })).toBeTruthy();
    expect(screen.getByText(/Semua daftar teman, menu, dan hasil patungan/i)).toBeTruthy();

    // Klik Batal -> data masih ada
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect((await screen.findAllByText(/143\.220/)).length).toBeGreaterThan(0);

    // Klik Reset lagi lalu setujui (Ya, reset)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ya, reset' }));

    // Data kembali ke state awal / kosong
    expect(screen.getByText(/minimal 2 orang dan 1 menu/i)).toBeTruthy();
  });
});
