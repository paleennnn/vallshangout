// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SiteFooter } from './SiteFooter';

afterEach(cleanup);

describe('<SiteFooter />', () => {
  it('menampilkan teks kredit kreator dan tautan instagram', () => {
    render(<SiteFooter />);

    const paleenLink = screen.getByRole('link', { name: 'Paleennnn' });
    expect(paleenLink.getAttribute('href')).toBe('https://www.instagram.com/valeennszz');
    expect(paleenLink.getAttribute('target')).toBe('_blank');

    const rizalLink = screen.getByRole('link', { name: 'Rizal' });
    expect(rizalLink.getAttribute('href')).toBe('https://www.instagram.com/aymkip._');
    expect(rizalLink.getAttribute('target')).toBe('_blank');

    expect(screen.getByText(/Logo & Favicon by/i)).toBeTruthy();
    expect(screen.getByText(/© 2026/i)).toBeTruthy();
  });

  it('menampilkan tombol "Support me" dan membuka modal QRIS', () => {
    render(<SiteFooter />);

    const supportBtn = screen.getByRole('button', { name: /support me/i });
    expect(supportBtn).toBeTruthy();

    // Dialog awalnya belum terbuka
    const img = screen.getByAltText('Donasi') as HTMLImageElement;
    expect(img.src).toContain(process.env.NEXT_PUBLIC_QRIS_ASSET_NAME || 'bg-pattern-3928.png');

    // Klik tombol support
    fireEvent.click(supportBtn);

    // Modal popup aktif
    expect(screen.getByText('Support VallsHangout')).toBeTruthy();
    expect(screen.getByText(/G TRADING & AIRDROP/i)).toBeTruthy();

    // Tutup modal
    const closeBtn = screen.getByRole('button', { name: 'Tutup modal donasi' });
    fireEvent.click(closeBtn);
  });
});

