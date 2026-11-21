// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  announcements: true as boolean | null, // null = baris langganan tidak ada
  updateError: null as { message: string } | null,
  updates: [] as { payload: Record<string, unknown>; endpoint: string }[],
  selects: [] as string[],
  rpc: vi.fn(),
  subscription: null as null | { endpoint: string; toJSON: () => unknown; unsubscribe: () => Promise<boolean> },
  ctx: null as unknown,
}));
// Objek klien harus stabil antar render (seperti provider sungguhan), kalau tidak efek pemuatan berulang menimpa pilihan pengguna
h.ctx = {
  supabase: {
    from: () => ({
      select: (cols: string) => {
        h.selects.push(cols);
        return { eq: () => ({ maybeSingle: async () => ({ data: h.announcements === null ? null : { announcements: h.announcements }, error: null }) }) };
      },
      update: (payload: Record<string, unknown>) => ({
        eq: async (_c: string, endpoint: string) => {
          h.updates.push({ payload, endpoint });
          return { error: h.updateError };
        },
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: h.rpc,
  },
  session: null,
  restored: true,
  ensureSession: async () => ({ user: { id: 'u1' } }),
};

vi.mock('@/components/SupabaseProvider', () => ({ useSupabase: () => h.ctx }));

const makeSub = () => ({ endpoint: 'https://push/perangkat-ini', toJSON: () => ({ keys: { p256dh: 'k', auth: 'a' } }), unsubscribe: vi.fn().mockResolvedValue(true) });

async function loadToggle() {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U');
  return (await import('./PushToggle')).PushToggle;
}

beforeEach(() => {
  h.announcements = true;
  h.updateError = null;
  h.updates.length = 0;
  h.selects.length = 0;
  h.rpc.mockReset().mockResolvedValue({ error: null });
  h.subscription = makeSub();
  const reg = {
    pushManager: {
      getSubscription: async () => h.subscription,
      subscribe: vi.fn(async () => (h.subscription = makeSub())),
    },
  };
  Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => reg, ready: Promise.resolve(reg) }, configurable: true });
  (window as unknown as { PushManager: unknown }).PushManager = function PushManager() {};
  (window as unknown as { Notification: unknown }).Notification = { permission: 'granted', requestPermission: async () => 'granted' };
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const checkbox = () => screen.getByRole('checkbox', { name: /Terima pengumuman dari Valls/ }) as HTMLInputElement;

describe('<PushToggle /> saklar pengumuman', () => {
  it('notifikasi menyala: saklar pengumuman tampil sesuai pengaturan perangkat, beserta penjelasannya', async () => {
    const PushToggle = await loadToggle();
    render(<PushToggle />);
    expect(await screen.findByRole('button', { name: /Matikan notifikasi/ })).toBeTruthy();
    await waitFor(() => expect(checkbox().checked).toBe(true));
    expect(screen.getByText(/Notifikasi tagihan dan transfer tetap aktif/)).toBeTruthy();
    expect(h.selects).toContain('announcements');
  });

  it('pengaturan tersimpan mati: kotak tidak tercentang', async () => {
    h.announcements = false;
    const PushToggle = await loadToggle();
    render(<PushToggle />);
    await waitFor(() => expect(checkbox().checked).toBe(false));
  });

  it('mengubah saklar menyimpan ke langganan perangkat ini saja', async () => {
    const PushToggle = await loadToggle();
    render(<PushToggle />);
    await waitFor(() => expect(checkbox().checked).toBe(true));
    fireEvent.click(checkbox());
    await waitFor(() => expect(h.updates).toEqual([{ payload: { announcements: false }, endpoint: 'https://push/perangkat-ini' }]));
    expect(checkbox().checked).toBe(false);
    fireEvent.click(checkbox());
    await waitFor(() => expect(h.updates.at(-1)).toEqual({ payload: { announcements: true }, endpoint: 'https://push/perangkat-ini' }));
  });

  it('gagal menyimpan: saklar kembali ke nilai semula dan ada pesan', async () => {
    h.updateError = { message: 'jaringan putus' };
    const PushToggle = await loadToggle();
    render(<PushToggle />);
    await waitFor(() => expect(checkbox().checked).toBe(true));
    fireEvent.click(checkbox());
    expect(await screen.findByText('Gagal menyimpan pengaturan pengumuman.')).toBeTruthy();
    expect(checkbox().checked).toBe(true);
  });

  it('notifikasi mati: saklar pengumuman tidak tampil', async () => {
    h.subscription = null;
    const PushToggle = await loadToggle();
    render(<PushToggle />);
    expect(await screen.findByRole('button', { name: /Aktifkan notifikasi/ })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('mematikan notifikasi menyembunyikan saklar pengumuman', async () => {
    const PushToggle = await loadToggle();
    render(<PushToggle />);
    await waitFor(() => expect(checkbox()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Matikan notifikasi/ }));
    expect(await screen.findByRole('button', { name: /Aktifkan notifikasi/ })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('menyalakan notifikasi lalu memuat pengaturan pengumuman (bawaan hidup)', async () => {
    h.subscription = null;
    const PushToggle = await loadToggle();
    render(<PushToggle />);
    fireEvent.click(await screen.findByRole('button', { name: /Aktifkan notifikasi/ }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('register_push_subscription', expect.objectContaining({ p_endpoint: 'https://push/perangkat-ini' })));
    await waitFor(() => expect(checkbox().checked).toBe(true));
  });
});
