// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

import { NotFoundContent } from './NotFoundContent';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('<NotFoundContent />', () => {
  it('merender teks wajib "Jangan nyari yang gaada ya😋"', () => {
    render(<NotFoundContent />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('Jangan nyari yang gaada ya');
    expect(heading.textContent).toContain('😋');
  });

  it('memiliki link menuju beranda ("Balik ke Beranda")', () => {
    render(<NotFoundContent />);

    const homeLink = screen.getByRole('link', { name: /balik ke beranda/i });
    expect(homeLink).toBeTruthy();
    expect(homeLink.getAttribute('href')).toBe('/');
  });

  it('memiliki tombol kembali ke halaman sebelumnya dan memanggil router.back() saat diklik', () => {
    // Simulasi history length > 1
    Object.defineProperty(window, 'history', {
      value: { length: 2 },
      writable: true,
    });

    render(<NotFoundContent />);

    const backButton = screen.getByRole('button', { name: /ke halaman sebelumnya/i });
    expect(backButton).toBeTruthy();

    fireEvent.click(backButton);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('menampilkan chip animasi mengejek (ZONK dan Nyari apa)', () => {
    render(<NotFoundContent />);

    expect(screen.getByText(/404 ZONK!/i)).toBeTruthy();
    expect(screen.getByText(/Nyari apa hayoo\?/i)).toBeTruthy();
  });
});

