// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThankYouModal } from './ThankYouModal';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ??
    function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ??
    function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
});

afterEach(cleanup);

describe('<ThankYouModal />', () => {
  it('menampilkan ucapan terima kasih dan pesan sering nongkrong saat dibuka', () => {
    const handleClose = vi.fn();
    render(<ThankYouModal isOpen={true} onClose={handleClose} />);

    expect(
      screen.getByRole('heading', { name: /terima kasih telah menggunakan vallshangout/i }),
    ).toBeTruthy();
    expect(screen.getByText(/sering-sering nongkrong ya/i)).toBeTruthy();
    expect(screen.getByText(/teks berhasil disalin ke clipboard/i)).toBeTruthy();
    expect(screen.getByText('🍻')).toBeTruthy();
  });

  it('memiliki tombol "Support me" dan dapat beralih ke modal QRIS', () => {
    const handleClose = vi.fn();
    render(<ThankYouModal isOpen={true} onClose={handleClose} />);

    // Cari tombol support me
    const supportBtn = screen.getByRole('button', { name: /support me/i });
    expect(supportBtn).toBeTruthy();

    // Klik tombol support me
    fireEvent.click(supportBtn);

    // Beralih ke tampilan QRIS
    expect(screen.getByText('Support VallsHangout')).toBeTruthy();
    expect(screen.getByAltText('Donasi')).toBeTruthy();
    expect(screen.getByText(/G TRADING & AIRDROP/i)).toBeTruthy();
    expect(screen.getByText(/NMID: ID1025427539560/i)).toBeTruthy();

    // Tombol kembali mengembalikan ke tampilan terima kasih
    const backBtn = screen.getByRole('button', { name: /kembali/i });
    fireEvent.click(backBtn);
    expect(
      screen.getByRole('heading', { name: /terima kasih telah menggunakan vallshangout/i }),
    ).toBeTruthy();
  });

  it('tombol tutup memicu callback onClose', () => {
    const handleClose = vi.fn();
    render(<ThankYouModal isOpen={true} onClose={handleClose} />);

    const closeBtn = screen.getByRole('button', { name: /tutup modal/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    const finishBtn = screen.getByRole('button', { name: /selesai/i });
    fireEvent.click(finishBtn);
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});

