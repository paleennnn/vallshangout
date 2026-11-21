// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => {
  const refresh = vi.fn();
  return { refresh, router: { refresh }, unstable: false }; // objek router stabil, seperti di Next.js
});
vi.mock('next/navigation', () => ({ useRouter: () => (h.unstable ? { refresh: h.refresh } : h.router) }));

import { AdminPush } from './AdminPush';

const CID = '11111111-1111-4111-8111-111111111111';
const campaign = (over: Record<string, unknown> = {}) => ({
  id: CID,
  created_at: '2026-11-15T08:00:00Z',
  title: 'Yuk nongkrong',
  body: 'Udah lama ga ketemu',
  url: '/',
  audience: 'all',
  inactive_days: null,
  recipients: 120,
  sent: 0,
  failed: 0,
  removed: 0,
  status: 'sending',
  ...over,
});

type Reply = { status?: number; body: unknown };
interface Call {
  method: string;
  path: string;
  query: string;
  body: Record<string, unknown>;
}
const calls: Call[] = [];
const handlers: Record<string, (call: Call) => Reply> = {};
const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
  const [path, query = ''] = input.split('?');
  const method = init?.method ?? 'GET';
  const call: Call = { method, path, query, body: init?.body ? JSON.parse(init.body as string) : {} };
  calls.push(call);
  const reply = handlers[`${method} ${path}`]?.(call) ?? { status: 404, body: { error: 'tidak ada handler' } };
  const status = reply.status ?? 200;
  return { ok: status < 400, status, json: async () => reply.body };
});

function device(endpoint: string | null) {
  const reg = endpoint ? { pushManager: { getSubscription: async () => ({ endpoint }) } } : undefined;
  Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => reg }, configurable: true });
}

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(handlers)) delete handlers[k];
  h.refresh.mockReset();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  handlers['GET /api/admin/push/campaigns'] = () => ({ body: { campaigns: [] } });
  handlers['GET /api/admin/push/audience'] = () => ({ body: { devices: 40, users: 25 } });
  h.unstable = false;
  device(null);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const title = () => screen.getByLabelText(/^Judul/) as HTMLInputElement;
const body = () => screen.getByLabelText(/^Isi pesan/) as HTMLTextAreaElement;
const sendBtn = () => screen.getByRole('button', { name: /Kirim ke semua/ }) as HTMLButtonElement;
const testBtn = () => screen.getByRole('button', { name: /Kirim uji ke perangkat ini/ }) as HTMLButtonElement;
const fill = (t = 'Yuk nongkrong', b = 'Guyss, kalian udah lama ga nongkrong lohh, yuk cuss pakai VallsHangout') => {
  fireEvent.change(title(), { target: { value: t } });
  fireEvent.change(body(), { target: { value: b } });
};
const callsTo = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

describe('<AdminPush /> form dan penerima', () => {
  it('memuat riwayat dan jumlah penerima; penghitung karakter dan batas panjang terpasang', async () => {
    render(<AdminPush />);
    expect(await screen.findByText('Belum ada siaran.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Akan sampai ke/).textContent).toMatch(/40 perangkat milik 25 pengguna/));
    expect(screen.getByText('Judul (0/60)')).toBeTruthy();
    expect(screen.getByText('Isi pesan (0/140)')).toBeTruthy();
    expect(title().maxLength).toBe(60);
    expect(body().maxLength).toBe(140);
    fill('Halo', 'abc');
    expect(screen.getByText('Judul (4/60)')).toBeTruthy();
    expect(screen.getByText('Isi pesan (3/140)')).toBeTruthy();
  });

  it('tombol kirim nonaktif sampai judul dan isi terisi; pratinjau mengikuti isian', async () => {
    render(<AdminPush />);
    await waitFor(() => expect(screen.getByText(/Akan sampai ke/)).toBeTruthy());
    expect(sendBtn().disabled).toBe(true);
    expect(testBtn().disabled).toBe(true);
    fill('Kangen kalian', 'Yuk kumpul');
    expect(sendBtn().disabled).toBe(false);
    expect(testBtn().disabled).toBe(false);
    const preview = screen.getByLabelText('Pratinjau notifikasi');
    expect(within(preview).getByText('Kangen kalian')).toBeTruthy();
    expect(within(preview).getByText('Yuk kumpul')).toBeTruthy();
  });

  it('audiens tidak aktif memakai jumlah hari (bawaan 14), dan hari tidak valid menghalangi pengiriman', async () => {
    handlers['GET /api/admin/push/audience'] = (c) => ({ body: c.query.includes('inactive') ? { devices: 7, users: 5 } : { devices: 40, users: 25 } });
    render(<AdminPush />);
    fill();
    fireEvent.click(screen.getByRole('radio', { name: /Yang tidak aktif lebih dari/ }));
    await waitFor(() => expect(screen.getByText(/Akan sampai ke/).textContent).toMatch(/7 perangkat milik 5 pengguna/));
    expect(callsTo('GET', '/api/admin/push/audience').at(-1)!.query).toBe('audience=inactive&days=14');

    fireEvent.change(screen.getByLabelText('Hari tidak aktif'), { target: { value: '30' } });
    await waitFor(() => expect(callsTo('GET', '/api/admin/push/audience').at(-1)!.query).toBe('audience=inactive&days=30'));

    fireEvent.change(screen.getByLabelText('Hari tidak aktif'), { target: { value: '' } });
    expect(await screen.findByText('Isi jumlah hari antara 1 dan 365.')).toBeTruthy();
    expect(sendBtn().disabled).toBe(true);
  });

  it('tidak ada perangkat yang cocok: kirim nonaktif', async () => {
    handlers['GET /api/admin/push/audience'] = () => ({ body: { devices: 0, users: 0 } });
    render(<AdminPush />);
    fill();
    await waitFor(() => expect(screen.getByText(/Akan sampai ke/).textContent).toMatch(/0.*perangkat milik.*0/));
    expect(sendBtn().disabled).toBe(true);
  });
});

describe('<AdminPush /> ketahanan', () => {
  it('identitas router yang berubah tiap render tidak membuat permintaan berulang tanpa henti', async () => {
    h.unstable = true;
    render(<AdminPush />);
    await waitFor(() => expect(screen.getByText(/Akan sampai ke/)).toBeTruthy());
    await new Promise((r) => setTimeout(r, 700));
    expect(callsTo('GET', '/api/admin/push/audience').length).toBeLessThanOrEqual(2);
    expect(callsTo('GET', '/api/admin/push/campaigns').length).toBeLessThanOrEqual(2);
  });
});

describe('<AdminPush /> pesan uji', () => {
  it('perangkat ini belum berlangganan: petunjuk, tanpa menghubungi server', async () => {
    render(<AdminPush />);
    fill();
    fireEvent.click(testBtn());
    expect((await screen.findByRole('alert')).textContent).toMatch(/belum berlangganan.*aktifkan notifikasi/i);
    expect(callsTo('POST', '/api/admin/push/test')).toHaveLength(0);
  });

  it('mengirim isian yang sama beserta endpoint perangkat ini', async () => {
    device('https://push/hp-admin');
    handlers['POST /api/admin/push/test'] = () => ({ body: { sent: 1 } });
    render(<AdminPush />);
    fill('Judul uji', 'Isi uji');
    fireEvent.change(screen.getByPlaceholderText('/'), { target: { value: '/new' } });
    fireEvent.click(testBtn());
    expect((await screen.findByRole('status')).textContent).toMatch(/Pesan uji terkirim/);
    expect(callsTo('POST', '/api/admin/push/test')[0].body).toEqual({ endpoint: 'https://push/hp-admin', title: 'Judul uji', body: 'Isi uji', url: '/new' });
  });

  it('galat dari server ditampilkan', async () => {
    device('https://push/hp-admin');
    handlers['POST /api/admin/push/test'] = () => ({ status: 404, body: { error: 'Perangkat ini belum terdaftar.' } });
    render(<AdminPush />);
    fill();
    fireEvent.click(testBtn());
    expect((await screen.findByRole('alert')).textContent).toMatch(/belum terdaftar/);
  });
});

describe('<AdminPush /> siaran', () => {
  const batchReplies = [
    campaign({ sent: 50, status: 'sending' }),
    campaign({ sent: 98, failed: 2, status: 'sending' }),
    campaign({ sent: 118, failed: 2, removed: 1, status: 'done' }),
  ];

  it('konfirmasi menampilkan penerima dan jeda 24 jam; batal tidak mengirim apa pun', async () => {
    render(<AdminPush />);
    fill();
    await waitFor(() => expect(screen.getByText(/Akan sampai ke/)).toBeTruthy());
    fireEvent.click(sendBtn());
    const dialog = (await screen.findByText('Kirim ke semua?')).closest('dialog') ?? document.body;
    expect(within(dialog as HTMLElement).getByText(/40/)).toBeTruthy();
    expect(dialog.textContent).toMatch(/24 jam/);
    expect(dialog.textContent).toMatch(/tidak bisa dibatalkan/);
    fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Batal' }));
    expect(callsTo('POST', '/api/admin/push/campaigns')).toHaveLength(0);
  });

  it('membuat siaran lalu mengirim batch demi batch sampai selesai, dan memuat ulang riwayat', async () => {
    let n = 0;
    handlers['POST /api/admin/push/campaigns'] = () => ({ status: 201, body: { campaign: campaign() } });
    handlers[`POST /api/admin/push/campaigns/${CID}/batch`] = () => ({ body: { campaign: batchReplies[n++] } });
    render(<AdminPush />);
    fill();
    await waitFor(() => expect(screen.getByText(/Akan sampai ke/)).toBeTruthy());
    fireEvent.click(sendBtn());
    fireEvent.click(await screen.findByRole('button', { name: 'Kirim sekarang' }));

    expect((await screen.findByRole('status')).textContent).toMatch(/Selesai: 118 terkirim, 2 gagal, 1 langganan tidak berlaku dibersihkan/);
    const created = callsTo('POST', '/api/admin/push/campaigns')[0].body;
    expect(created).toMatchObject({ title: 'Yuk nongkrong', audience: 'all', url: '/' });
    expect(created.days).toBeUndefined();
    expect(callsTo('POST', `/api/admin/push/campaigns/${CID}/batch`)).toHaveLength(3);
    expect(callsTo('GET', '/api/admin/push/campaigns').length).toBeGreaterThanOrEqual(2);
  });

  it('audiens tidak aktif mengirim jumlah harinya', async () => {
    handlers['POST /api/admin/push/campaigns'] = () => ({ status: 201, body: { campaign: campaign({ audience: 'inactive', inactive_days: 21, status: 'done' }) } });
    render(<AdminPush />);
    fill();
    fireEvent.click(screen.getByRole('radio', { name: /Yang tidak aktif lebih dari/ }));
    fireEvent.change(screen.getByLabelText('Hari tidak aktif'), { target: { value: '21' } });
    await waitFor(() => expect(callsTo('GET', '/api/admin/push/audience').at(-1)!.query).toBe('audience=inactive&days=21'));
    await waitFor(() => expect(sendBtn().disabled).toBe(false));
    fireEvent.click(sendBtn());
    fireEvent.click(await screen.findByRole('button', { name: 'Kirim sekarang' }));
    await waitFor(() => expect(callsTo('POST', '/api/admin/push/campaigns')).toHaveLength(1));
    expect(callsTo('POST', '/api/admin/push/campaigns')[0].body).toMatchObject({ audience: 'inactive', days: 21 });
  });

  it('server menolak (jeda 24 jam): pesannya tampil dan tidak ada batch yang dikirim', async () => {
    handlers['POST /api/admin/push/campaigns'] = () => ({ status: 429, body: { error: 'Siaran terakhir baru saja dikirim. Jeda minimal 24 jam antar siaran.' } });
    render(<AdminPush />);
    fill();
    await waitFor(() => expect(screen.getByText(/Akan sampai ke/)).toBeTruthy());
    fireEvent.click(sendBtn());
    fireEvent.click(await screen.findByRole('button', { name: 'Kirim sekarang' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Jeda minimal 24 jam/);
    expect(calls.some((c) => c.path.endsWith('/batch'))).toBe(false);
  });

  it('batch gagal di tengah jalan: berhenti dengan petunjuk, lalu bisa dilanjutkan dari riwayat', async () => {
    let n = 0;
    handlers['POST /api/admin/push/campaigns'] = () => ({ status: 201, body: { campaign: campaign() } });
    handlers[`POST /api/admin/push/campaigns/${CID}/batch`] = () => {
      n++;
      if (n === 2) return { status: 500, body: { error: 'Gagal mengambil batch berikutnya.' } };
      return { body: { campaign: n === 1 ? campaign({ sent: 50 }) : campaign({ sent: 118, failed: 2, status: 'done' }) } };
    };
    // riwayat setelah berhenti menampilkan siaran yang belum selesai
    handlers['GET /api/admin/push/campaigns'] = () => ({ body: { campaigns: n >= 2 ? [campaign({ sent: 50 })] : [] } });
    render(<AdminPush />);
    fill();
    await waitFor(() => expect(screen.getByText(/Akan sampai ke/)).toBeTruthy());
    fireEvent.click(sendBtn());
    fireEvent.click(await screen.findByRole('button', { name: 'Kirim sekarang' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Gagal mengambil batch berikutnya.*Lanjutkan dari riwayat/);
    fireEvent.click(await screen.findByRole('button', { name: 'Lanjutkan pengiriman' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/Selesai: 118 terkirim/);
    expect(callsTo('POST', `/api/admin/push/campaigns/${CID}/batch`)).toHaveLength(3);
    expect(callsTo('POST', '/api/admin/push/campaigns')).toHaveLength(1); // melanjutkan, bukan membuat siaran baru
  });

  it('riwayat memuat siaran selesai dan yang belum selesai dengan tombol lanjut hanya untuk yang belum', async () => {
    handlers['GET /api/admin/push/campaigns'] = () => ({
      body: { campaigns: [campaign({ status: 'sending', sent: 10 }), campaign({ id: '22222222-2222-4222-8222-222222222222', title: 'Siaran lama', status: 'done', sent: 100, failed: 1, removed: 2 })] },
    });
    render(<AdminPush />);
    expect(await screen.findByText('Siaran lama')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Lanjutkan pengiriman' })).toHaveLength(1);
    expect(screen.getByText('Selesai')).toBeTruthy();
    expect(screen.getByText('Belum selesai')).toBeTruthy();
    expect(screen.getByText(/100 terkirim, 1 gagal, 2 dibersihkan dari 120 perangkat/)).toBeTruthy();
  });
});

describe('<AdminPush /> sesi', () => {
  it('sesi berakhir (401) memuat ulang halaman agar kembali ke layar masuk', async () => {
    handlers['GET /api/admin/push/campaigns'] = () => ({ status: 401, body: { error: 'Sesi berakhir. Masuk lagi.' } });
    render(<AdminPush />);
    await waitFor(() => expect(h.refresh).toHaveBeenCalled());
  });

  it('Keluar memanggil API logout lalu memuat ulang halaman', async () => {
    handlers['POST /api/admin/logout'] = () => ({ body: { ok: true } });
    render(<AdminPush />);
    fireEvent.click(await screen.findByRole('button', { name: /Keluar/ }));
    await waitFor(() => expect(callsTo('POST', '/api/admin/logout')).toHaveLength(1));
    await waitFor(() => expect(h.refresh).toHaveBeenCalled());
  });
});
