// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Hangout, Participant, SpinState } from '@/lib/supabase/types';

const api = vi.hoisted(() => ({
  acceptSpin: vi.fn(),
  vetoSpin: vi.fn(),
  clearPlace: vi.fn(),
  startSpin: vi.fn(),
}));
vi.mock('@/components/SupabaseProvider', () => ({
  useSupabase: () => ({ supabase: { tag: 'sb' }, session: null, restored: true, ensureSession: vi.fn() }),
}));
vi.mock('@/lib/room/api', async (orig) => ({ ...(await orig<typeof import('@/lib/room/api')>()), ...api }));

import { MotionRoot } from '@/components/MotionRoot';
import { PLACES_KEY, SAMPLE_PLACES, createPlace } from '@/lib/places/store';
import { RoomPlace, calculatorHref } from './RoomPlace';

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
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
  Object.values(api).forEach((f) => f.mockReset().mockResolvedValue(undefined));
});
afterEach(cleanup);

const hangout = (over: Partial<Hangout> = {}): Hangout => ({
  id: 'h1',
  host_id: 'u-host',
  title: 'Malming',
  status: 'planning',
  scheduled_at: null,
  invite_code: 'ABCD2345',
  place_label: null,
  place_meta: null,
  ...over,
});
const people: Participant[] = [
  { id: 'p-host', name: 'Host', rsvp: 'going', user_id: 'u-host' },
  { id: 'p-budi', name: 'Budi', rsvp: 'going', user_id: 'u-budi' },
  { id: 'p-siti', name: 'Siti', rsvp: 'maybe', user_id: 'u-siti' },
];
const meta = { service_pct: 5, tax_pct: 10, tax_on_service: true };
const spinRow = (over: Partial<SpinState> = {}): SpinState => ({
  id: 's1',
  hangout_id: 'h1',
  kind: 'place',
  options: [{ label: 'Cafe A', weight: 1, meta }, { label: 'Billiard 88', weight: 1 }],
  winner_index: 0,
  winner: { label: 'Cafe A', weight: 1, meta },
  status: 'active',
  created_by: 'u-budi',
  created_at: '2026-11-09T10:00:00Z',
  vetoed_by: [],
  ...over,
});

function setup(props: Partial<React.ComponentProps<typeof RoomPlace>> = {}) {
  const onChanged = vi.fn();
  render(
    <MotionRoot>
      <RoomPlace
        hangout={hangout()}
        spin={null}
        participants={people}
        me={people[1]}
        isHost={false}
        onChanged={onChanged}
        {...props}
      />
    </MotionRoot>,
  );
  return { onChanged };
}

describe('calculatorHref', () => {
  it('membawa nama dan angka tempat, dan bisa dibaca balik oleh kalkulator', () => {
    const href = calculatorHref('Cafe A & Bar', meta);
    const q = new URLSearchParams(href.split('?')[1]);
    expect(q.get('title')).toBe('Cafe A & Bar');
    expect([q.get('service'), q.get('tax'), q.get('onservice')]).toEqual(['5', '10', '1']);
    expect(calculatorHref('X', null)).toBe('/calculator?title=X');
  });
});

describe('<RoomPlace /> tanpa tempat', () => {
  it('menawarkan undi tempat untuk anggota; peserta tanpa baris (belum jadi peserta) tidak bisa', () => {
    setup();
    expect((screen.getByRole('button', { name: /Undi tempat/ }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    setup({ me: undefined });
    expect((screen.getByRole('button', { name: /Undi tempat/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('<RoomPlace /> tempat sudah terpilih', () => {
  const chosen = hangout({ place_label: 'Cafe A', place_meta: meta });

  it('menampilkan nama, service/pajak, dan tautan kalkulator berisi angkanya', () => {
    setup({ hangout: chosen });
    expect(screen.getByText('Cafe A')).toBeTruthy();
    expect(screen.getByText(/Service 5%, pajak 10% \(dari subtotal \+ service\)/)).toBeTruthy();
    const href = screen.getByRole('link', { name: /Hitung patungan di sini/ }).getAttribute('href')!;
    expect(new URLSearchParams(href.split('?')[1]).get('service')).toBe('5');
  });

  it('hanya host yang melihat Undi ulang dan Kosongkan; Kosongkan memanggil API lalu menyegarkan', async () => {
    setup({ hangout: chosen, isHost: false });
    expect(screen.queryByRole('button', { name: /Kosongkan/ })).toBeNull();
    cleanup();

    const { onChanged } = setup({ hangout: chosen, isHost: true });
    expect(screen.getByRole('button', { name: /Undi ulang/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Kosongkan/ }));
    await waitFor(() => expect(api.clearPlace).toHaveBeenCalledWith({ tag: 'sb' }, 'h1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});

describe('<RoomPlace /> hasil undian', () => {
  it('host: Terima menerima hasil; peserta: Veto, bukan Terima, dan pesan menunggu host', async () => {
    const { onChanged } = setup({ spin: spinRow(), isHost: true, me: people[0] });
    fireEvent.click(screen.getByRole('button', { name: /Terima tempat ini/ }));
    await waitFor(() => expect(api.acceptSpin).toHaveBeenCalledWith({ tag: 'sb' }, 's1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    cleanup();

    setup({ spin: spinRow(), isHost: false });
    expect(screen.queryByRole('button', { name: /Terima tempat ini/ })).toBeNull();
    expect(screen.getByText('Menunggu host menerima hasil ini.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Veto' }));
    await waitFor(() => expect(api.vetoSpin).toHaveBeenCalledWith({ tag: 'sb' }, 's1'));
  });

  it('peserta yang sudah veto tidak bisa veto lagi', () => {
    setup({ spin: spinRow({ vetoed_by: ['p-budi'] }) });
    expect((screen.getByRole('button', { name: 'Kamu sudah veto' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('undian di-veto: menyebut nama pemveto, menawarkan Putar lagi, tanpa tombol Veto atau Terima', () => {
    setup({ spin: spinRow({ status: 'vetoed', vetoed_by: ['p-budi', 'p-siti'] }), isHost: true, me: people[0] });
    expect(screen.getByText(/Di-veto oleh Budi, Siti/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Putar lagi/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Veto' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Terima tempat ini/ })).toBeNull();
  });

  it('galat dari API ditampilkan sebagai peringatan, bukan crash', async () => {
    api.acceptSpin.mockRejectedValue(new Error('Gagal menerima hasil: spin tidak aktif'));
    setup({ spin: spinRow(), isHost: true, me: people[0] });
    fireEvent.click(screen.getByRole('button', { name: /Terima tempat ini/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/spin tidak aktif/);
  });
});

describe('<RoomPlace /> lembar undian', () => {
  const seed = () => {
    const places = SAMPLE_PLACES.map((s) => createPlace(s));
    localStorage.setItem(PLACES_KEY, JSON.stringify(places));
    return places;
  };

  it('kandidat dari tempat lokal, memutar lewat server, berhenti di pemenang server, lalu selesai', async () => {
    seed();
    const { onChanged } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Undi tempat/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Undi tempat' });

    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(3);
    fireEvent.click(within(dialog).getByLabelText(/Warung Mie/)); // buang satu
    api.startSpin.mockResolvedValue({ id: 's9', winner_index: 1, winner: { label: 'Cafe A', weight: 1 } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Putar roda (2 tempat)' }));

    await waitFor(() => expect(api.startSpin).toHaveBeenCalledTimes(1));
    const [sbArg, hid, options] = api.startSpin.mock.calls[0];
    expect(sbArg).toEqual({ tag: 'sb' });
    expect(hid).toBe('h1');
    expect(options).toHaveLength(2);
    expect(options.map((o: { label: string }) => o.label).sort()).toEqual(['Billiard 88', 'Cafe A']);
    const cafe = options.find((o: { label: string }) => o.label === 'Cafe A');
    expect(cafe.meta).toEqual({ service_pct: 5, tax_pct: 10, tax_on_service: true });
    expect(cafe.weight).toBeGreaterThan(0);

    expect(await within(dialog).findByText('Hasilnya')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Selesai' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled()); // kartu room disegarkan setelah animasi
  });

  it('nama tempat bebas bisa ditambahkan; duplikat ditolak; butuh minimal 2 tempat', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Undi tempat/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Undi tempat' });

    expect(within(dialog).getByText(/Belum ada tempat tersimpan/)).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'halaman Tempat' }).getAttribute('href')).toBe('/places');
    const start = () => within(dialog).getByRole('button', { name: /^Putar roda/ }) as HTMLButtonElement;
    expect(start().disabled).toBe(true);

    const add = (v: string) => {
      fireEvent.change(within(dialog).getByLabelText('Nama tempat lain'), { target: { value: v } });
      fireEvent.click(within(dialog).getByRole('button', { name: /Tambah/ }));
    };
    add('Kopi Sudut');
    expect(start().disabled).toBe(true);
    add('kopi sudut');
    expect(within(dialog).getByRole('alert').textContent).toMatch(/sudah ada/);
    add('Karaoke Ria');
    expect(start().disabled).toBe(false);
    expect(start().textContent).toBe('Putar roda (2 tempat)');
  });

  it('galat server saat memutar: pesan tampil dan kembali ke pilihan kandidat', async () => {
    seed();
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Undi tempat/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Undi tempat' });
    api.startSpin.mockRejectedValue(new Error('Gagal memutar roda: bukan anggota hangout'));
    fireEvent.click(within(dialog).getByRole('button', { name: /^Putar roda/ }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/bukan anggota hangout/);
    expect(within(dialog).getByRole('button', { name: /^Putar roda/ })).toBeTruthy();
  });
});
