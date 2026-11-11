// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ startSpin: vi.fn() }));
vi.mock('@/components/SupabaseProvider', () => ({
  useSupabase: () => ({ supabase: { tag: 'sb' }, session: null, restored: true, ensureSession: vi.fn() }),
}));
vi.mock('@/lib/room/api', async (orig) => ({ ...(await orig<typeof import('@/lib/room/api')>()), ...api }));

import { SpinSheet } from './SpinSheet';

// Animasi aktif (prefers-reduced-motion tidak diminta), seperti di HP kebanyakan
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  localStorage.clear();
  api.startSpin.mockReset();
});
afterEach(cleanup);

function addPlace(name: string) {
  fireEvent.change(screen.getByLabelText('Nama tempat lain'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /Tambah/ }));
}

describe('<SpinSheet />', () => {
  it('roda benar-benar berputar di layar pemutar setelah server membalas, tanpa MotionRoot dari halaman', async () => {
    api.startSpin.mockResolvedValue({ winner_index: 1, winner: { label: 'Kafka' } });
    render(<SpinSheet open onClose={() => {}} hangoutId="h1" onStart={() => {}} onFinish={() => {}} />);
    addPlace('Eksa');
    addPlace('Kafka');
    fireEvent.click(screen.getByRole('button', { name: /Putar roda \(2 tempat\)/ }));

    const rotor = () => (document.querySelector('svg[viewBox="0 0 320 320"]')!.parentElement as HTMLElement).style.transform;
    await waitFor(() => expect(api.startSpin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(rotor()).toMatch(/rotate\(-?[\d.]+deg\)/), { timeout: 2000 });
    expect(rotor()).not.toBe('rotate(0deg)');
  });

  it('input nama tempat dibatasi 24 karakter dan menampilkan penghitung mendekati batas', () => {
    render(<SpinSheet open onClose={() => {}} hangoutId="h1" onStart={() => {}} onFinish={() => {}} />);
    const input = screen.getByLabelText('Nama tempat lain') as HTMLInputElement;
    expect(input.maxLength).toBe(24);
    expect(screen.queryByText(/\/24$/)).toBeNull();
    fireEvent.change(input, { target: { value: 'Warung Kopi Pak' } });
    expect(screen.queryByText('15/24')).toBeNull();
    fireEvent.change(input, { target: { value: 'Warung Kopi Pak Haji A' } });
    expect(screen.getByText('22/24')).toBeTruthy();
  });

  it('nama yang lebih panjang dari batas dipotong saat ditambahkan', () => {
    render(<SpinSheet open onClose={() => {}} hangoutId="h1" onStart={() => {}} onFinish={() => {}} />);
    // maxLength tidak berlaku untuk perubahan lewat skrip/tempel tertentu; kode juga harus memotong
    fireEvent.change(screen.getByLabelText('Nama tempat lain'), { target: { value: 'x'.repeat(40) } });
    fireEvent.click(screen.getByRole('button', { name: /Tambah/ }));
    expect(screen.getByText('x'.repeat(24))).toBeTruthy();
  });
});
