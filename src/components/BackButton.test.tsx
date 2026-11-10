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

import { BackButton } from './BackButton';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('<BackButton />', () => {
  it('merender tombol dengan label default "Kembali"', () => {
    render(<BackButton />);
    const button = screen.getByRole('button', { name: /kembali/i });
    expect(button).toBeTruthy();
  });

  it('memanggil router.back() saat history browser ada', () => {
    Object.defineProperty(window, 'history', {
      value: { length: 3 },
      writable: true,
    });

    render(<BackButton />);
    const button = screen.getByRole('button', { name: /kembali/i });
    fireEvent.click(button);

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('memanggil router.push(fallback) saat tidak ada riwayat browser', () => {
    Object.defineProperty(window, 'history', {
      value: { length: 1 },
      writable: true,
    });

    render(<BackButton fallback="/hangouts" />);
    const button = screen.getByRole('button', { name: /kembali/i });
    fireEvent.click(button);

    expect(mockPush).toHaveBeenCalledWith('/hangouts');
  });
});

