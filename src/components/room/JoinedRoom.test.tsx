// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Hangout, Participant } from '@/lib/supabase/types';

const h = vi.hoisted(() => {
  const onCalls: unknown[][] = [];
  const channel: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> } = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockImplementation((...args: unknown[]) => {
    onCalls.push(args);
    return channel;
  });
  channel.subscribe.mockImplementation(() => channel);
  const supabase = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
  return {
    onCalls,
    channel,
    supabase,
    ctx: { supabase, session: { user: { id: 'u-budi' } } as { user: { id: string } } | null, restored: true, ensureSession: vi.fn() },
    api: { fetchMyHangout: vi.fn(), fetchParticipants: vi.fn(), fetchLatestSpin: vi.fn(), setRsvp: vi.fn() },
  };
});
vi.mock('@/components/SupabaseProvider', () => ({ useSupabase: () => h.ctx }));
vi.mock('@/lib/room/api', async (orig) => ({ ...(await orig<typeof import('@/lib/room/api')>()), ...h.api }));

import { MotionRoot } from '@/components/MotionRoot';
import { JoinedRoom } from './JoinedRoom';

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

const hangout: Hangout = {
  id: 'h1',
  host_id: 'u-host',
  title: 'Malming',
  status: 'planning',
  scheduled_at: null,
  invite_code: 'ABCD2345',
  place_label: null,
  place_meta: null,
};
let people: Participant[];

beforeEach(() => {
  h.onCalls.length = 0;
  h.supabase.removeChannel.mockClear();
  h.supabase.channel.mockClear();
  h.ctx.session = { user: { id: 'u-budi' } };
  people = [
    { id: 'p-host', name: 'Host', rsvp: 'going', user_id: 'u-host' },
    { id: 'p-budi', name: 'Budi', rsvp: 'invited', user_id: 'u-budi' },
    { id: 'p-tamu', name: 'Teman Tanpa Akun', rsvp: 'going', user_id: null },
  ];
  h.api.fetchMyHangout.mockReset().mockImplementation(async () => hangout);
  h.api.fetchParticipants.mockReset().mockImplementation(async () => people);
  h.api.fetchLatestSpin.mockReset().mockResolvedValue(null);
  h.api.setRsvp.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

const setup = () =>
  render(
    <MotionRoot>
      <JoinedRoom initial={hangout} />
    </MotionRoot>,
  );

describe('<JoinedRoom />', () => {
  it('menampilkan judul, kode, peserta dengan penanda host/kamu/tanpa akun, dan ringkasan kehadiran', async () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Malming' })).toBeTruthy();
    expect(screen.getByText('ABCD2345')).toBeTruthy();
    expect(await screen.findByText('Peserta (3)')).toBeTruthy();
    expect(screen.getByText('host')).toBeTruthy();
    expect(screen.getByText('(kamu)')).toBeTruthy();
    expect(screen.getByText('tanpa akun')).toBeTruthy();
    expect(screen.getByText('2 ikut')).toBeTruthy();
  });

  it('RSVP: menandai pilihan sekarang, mengubahnya lewat API, lalu menyegarkan data', async () => {
    setup();
    const maybe = await screen.findByRole('button', { name: 'Mungkin' });
    expect(maybe.getAttribute('aria-pressed')).toBe('false');
    const before = h.api.fetchParticipants.mock.calls.length;

    fireEvent.click(maybe);
    await waitFor(() => expect(h.api.setRsvp).toHaveBeenCalledWith(h.supabase, 'p-budi', 'maybe'));
    await waitFor(() => expect(h.api.fetchParticipants.mock.calls.length).toBeGreaterThan(before));
  });

  it('anggota yang bukan peserta (mis. anggota circle) tidak melihat pilihan kehadiran', async () => {
    h.ctx.session = { user: { id: 'u-asing' } };
    setup();
    await screen.findByText('Peserta (3)');
    expect(screen.queryByText('Kamu ikut?')).toBeNull();
  });

  it('berlangganan realtime ke peserta, undian, veto, dan hangout, lalu berhenti saat ditutup', async () => {
    const { unmount } = setup();
    await screen.findByText('Peserta (3)');
    const subs = h.onCalls.map(([, cfg]) => cfg as { table: string; filter: string; event: string });
    expect(subs.map((s) => s.table).sort()).toEqual(['hangout_participants', 'hangouts', 'spin_vetoes', 'spins']);
    expect(subs.filter((s) => s.table !== 'hangouts').every((s) => s.filter === 'hangout_id=eq.h1')).toBe(true);
    expect(subs.find((s) => s.table === 'hangouts')!.filter).toBe('id=eq.h1');
    expect(h.channel.subscribe).toHaveBeenCalled();

    unmount();
    expect(h.supabase.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('galat memuat ditampilkan sebagai peringatan', async () => {
    h.api.fetchParticipants.mockRejectedValue(new Error('Gagal memuat peserta: jaringan putus'));
    setup();
    expect((await screen.findByRole('alert')).textContent).toMatch(/jaringan putus/);
  });
});
