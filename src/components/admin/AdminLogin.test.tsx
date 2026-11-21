// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh }) }));

import { AdminLogin } from './AdminLogin';

const fetchMock = vi.fn();
beforeEach(() => {
  h.refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const field = () => screen.getByLabelText('Kata sandi') as HTMLInputElement;
const button = () => screen.getByRole('button', { name: /Masuk|Memeriksa/ }) as HTMLButtonElement;

describe('<AdminLogin />', () => {
  it('kolom berjenis password, dan tombol nonaktif sampai ada isinya', () => {
    render(<AdminLogin />);
    expect(field().type).toBe('password');
    expect(button().disabled).toBe(true);
    fireEvent.change(field(), { target: { value: 'x' } });
    expect(button().disabled).toBe(false);
  });

  it('berhasil: mengirim kata sandi ke API, mengosongkan kolom, dan memuat ulang halaman', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<AdminLogin />);
    fireEvent.change(field(), { target: { value: 'kata-sandi-admin-yang-panjang' } });
    fireEvent.click(button());
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ password: 'kata-sandi-admin-yang-panjang' });
    expect(field().value).toBe('');
  });

  it('Enter di kolom juga mengirim', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<AdminLogin />);
    fireEvent.change(field(), { target: { value: 'abc' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('salah atau terkunci: pesan dari server tampil dan halaman tidak dimuat ulang', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: 'Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.' }) });
    render(<AdminLogin />);
    fireEvent.change(field(), { target: { value: 'salah' } });
    fireEvent.click(button());
    expect((await screen.findByRole('alert')).textContent).toMatch(/Terlalu banyak percobaan gagal/);
    expect(h.refresh).not.toHaveBeenCalled();
    expect(field().value).toBe('salah');
  });

  it('jaringan putus: pesan umum, tombol bisa dipakai lagi', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<AdminLogin />);
    fireEvent.change(field(), { target: { value: 'abc' } });
    fireEvent.click(button());
    expect((await screen.findByRole('alert')).textContent).toMatch(/Tidak bisa menghubungi server/);
    expect(button().disabled).toBe(false);
  });
});
