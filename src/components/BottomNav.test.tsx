// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

let mockPath = '/';
vi.mock('next/navigation', () => ({ usePathname: () => mockPath }));

import { BottomNav } from './BottomNav';
import { NAV_ITEMS, activeIndex } from './nav-items';

afterEach(cleanup);

describe('nav-items', () => {
  it('halaman turunan memilih item yang benar', () => {
    expect(activeIndex('/')).toBe(0);
    expect(activeIndex('/calculator')).toBe(1);
    expect(activeIndex('/spin')).toBe(2);
    expect(activeIndex('/hangouts')).toBe(3);
    expect(activeIndex('/h/ABCD2345')).toBe(3);
    expect(activeIndex('/new')).toBe(3);
    expect(activeIndex('/~offline')).toBe(-1);
  });

  it('beranda tidak ikut aktif di halaman lain', () => {
    expect(NAV_ITEMS[0].match('/calculator')).toBe(false);
  });
});

describe('<BottomNav />', () => {
  it('menampilkan 4 tujuan dengan label yang bisa dibaca pembaca layar', () => {
    mockPath = '/';
    render(<BottomNav />);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/calculator', '/spin', '/hangouts']);
    expect(screen.getByRole('link', { name: 'Kalkulator' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Navigasi utama' })).toBeTruthy();
  });

  it('menandai halaman aktif dengan aria-current dan menggeser penanda', () => {
    mockPath = '/spin';
    const { container } = render(<BottomNav />);
    const current = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('href')).toBe('/spin');
    const marker = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(marker.style.transform).toBe('translateX(200%)'); // item ke-3
    expect(marker.style.opacity).toBe('1');
  });

  it('di halaman tanpa item aktif, penanda disembunyikan', () => {
    mockPath = '/~offline';
    const { container } = render(<BottomNav />);
    expect(screen.queryAllByRole('link').some((a) => a.getAttribute('aria-current'))).toBe(false);
    expect((container.querySelector('span[aria-hidden="true"]') as HTMLElement).style.opacity).toBe('0');
  });

  it('bersembunyi saat mengetik (keyboard layar) dan muncul lagi setelah selesai', () => {
    mockPath = '/spin';
    const { container } = render(
      <>
        <input aria-label="isian" />
        <input type="checkbox" aria-label="centang" />
        <BottomNav />
      </>,
    );
    const shell = container.querySelector('.on-night') as HTMLElement;
    expect(shell.hasAttribute('inert')).toBe(false);

    fireEvent.focusIn(screen.getByLabelText('isian'));
    expect(shell.hasAttribute('inert')).toBe(true);
    expect(shell.getAttribute('aria-hidden')).toBe('true');

    fireEvent.focusOut(screen.getByLabelText('isian'));
    expect(shell.hasAttribute('inert')).toBe(false);

    // kotak centang tidak memunculkan keyboard
    fireEvent.focusIn(screen.getByLabelText('centang'));
    expect(shell.hasAttribute('inert')).toBe(false);
  });
});
