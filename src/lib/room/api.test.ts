import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  acceptSpin,
  clearPlace,
  fetchLatestSpin,
  setRsvp,
  startSpin,
  validateSpinOptions,
  vetoSpin,
} from './api';

const sb = (x: object) => x as unknown as SupabaseClient;
const opt = (label: string, weight = 1) => ({ label, weight });

describe('validateSpinOptions', () => {
  it('menerima 2 sampai 20 pilihan unik berbobot > 0', () => {
    expect(validateSpinOptions([opt('A'), opt('B')])).toBeNull();
    expect(validateSpinOptions(Array.from({ length: 20 }, (_, i) => opt(`T${i}`)))).toBeNull();
  });

  it('menolak terlalu sedikit, terlalu banyak, nama kosong atau panjang, bobot salah, dan duplikat', () => {
    expect(validateSpinOptions([opt('A')])).toMatch(/minimal 2/);
    expect(validateSpinOptions(Array.from({ length: 21 }, (_, i) => opt(`T${i}`)))).toMatch(/Maksimal 20/);
    expect(validateSpinOptions([opt('A'), opt('  ')])).toMatch(/butuh nama/);
    expect(validateSpinOptions([opt('A'), opt('x'.repeat(81))])).toMatch(/80 karakter/);
    expect(validateSpinOptions([opt('A'), opt('B', 0)])).toMatch(/Bobot/);
    expect(validateSpinOptions([opt('A'), opt('B', Number.NaN)])).toMatch(/Bobot/);
    expect(validateSpinOptions([opt('Cafe'), opt(' cafe ')])).toMatch(/dua kali/);
  });
});

describe('startSpin', () => {
  it('memanggil rpc do_spin dengan nama parameter yang benar dan label dirapikan', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 's1', winner_index: 1 }, error: null });
    const meta = { service_pct: 5, tax_pct: 10, tax_on_service: true };
    const row = await startSpin(sb({ rpc }), 'h1', [{ label: ' Cafe A ', weight: 1.5, meta }, opt('Billiard')]);
    expect(row).toMatchObject({ id: 's1' });
    expect(rpc).toHaveBeenCalledWith('do_spin', {
      p_hangout: 'h1',
      p_kind: 'place',
      p_options: [{ label: 'Cafe A', weight: 1.5, meta }, { label: 'Billiard', weight: 1 }],
    });
  });

  it('opsi tidak valid ditolak sebelum menyentuh jaringan', async () => {
    const rpc = vi.fn();
    await expect(startSpin(sb({ rpc }), 'h1', [opt('A')])).rejects.toThrow(/minimal 2/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('galat server dibungkus dengan pesan yang jelas', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'bukan anggota hangout' } });
    await expect(startSpin(sb({ rpc }), 'h1', [opt('A'), opt('B')])).rejects.toThrow('Gagal memutar roda: bukan anggota hangout');
  });
});

describe('vetoSpin dan acceptSpin', () => {
  it('memanggil rpc dengan p_spin', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await vetoSpin(sb({ rpc }), 's1');
    await acceptSpin(sb({ rpc }), 's2');
    expect(rpc).toHaveBeenNthCalledWith(1, 'veto_spin', { p_spin: 's1' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'accept_spin', { p_spin: 's2' });
  });

  it('meneruskan pesan galat server', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'hanya host yang boleh menerima hasil spin' } });
    await expect(acceptSpin(sb({ rpc }), 's1')).rejects.toThrow(/hanya host/);
  });
});

const updateChain = (data: unknown, error: { message: string } | null = null) => ({
  from: () => ({ update: () => ({ eq: () => ({ select: async () => ({ data, error }) }) }) }),
});

describe('clearPlace dan setRsvp (UPDATE yang bisa diam-diam mengenai 0 baris karena RLS)', () => {
  it('0 baris terpengaruh dianggap ditolak, bukan sukses', async () => {
    await expect(clearPlace(sb(updateChain([])), 'h1')).rejects.toThrow(/Hanya host/);
    await expect(setRsvp(sb(updateChain([])), 'p1', 'going')).rejects.toThrow(/pemiliknya/);
  });

  it('berhasil bila ada baris terpengaruh', async () => {
    await expect(clearPlace(sb(updateChain([{ id: 'h1' }])), 'h1')).resolves.toBeUndefined();
    await expect(setRsvp(sb(updateChain([{ id: 'p1' }])), 'p1', 'maybe')).resolves.toBeUndefined();
  });

  it('galat database diteruskan', async () => {
    await expect(setRsvp(sb(updateChain(null, { message: 'boom' })), 'p1', 'no')).rejects.toThrow('Gagal mengubah kehadiran: boom');
  });
});

describe('fetchLatestSpin', () => {
  const spinsOnly = (rows: unknown[], vetoes: unknown[] = []) =>
    sb({
      from: (table: string) =>
        table === 'spins'
          ? { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }) }
          : { select: () => ({ eq: async () => ({ data: vetoes, error: null }) }) },
    });

  it('null bila belum ada undian', async () => {
    expect(await fetchLatestSpin(spinsOnly([]), 'h1')).toBeNull();
  });

  it('menggabungkan undian terbaru dengan daftar peserta yang mem-veto', async () => {
    const spin = { id: 's1', hangout_id: 'h1', status: 'vetoed', winner: { label: 'A', weight: 1 }, options: [], winner_index: 0, kind: 'place', created_by: null, created_at: 'x' };
    const r = await fetchLatestSpin(spinsOnly([spin], [{ participant_id: 'p2' }, { participant_id: 'p3' }]), 'h1');
    expect(r).toMatchObject({ id: 's1', status: 'vetoed', vetoed_by: ['p2', 'p3'] });
  });
});
