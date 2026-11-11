import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  member: new Set<string>(),
  senderId: '',
  sent: [] as { endpoint: string; payload: { title: string; body: string; url: string; tag: string } }[],
  deadEndpoints: new Set<string>(),
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
      if (h.deadEndpoints.has(sub.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 });
      h.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    }),
  },
}));

/** Query builder palsu; klien pengguna meniru RLS (hanya hangout yang diikuti pengirim). */
function makeClient(key: string) {
  const isAdmin = key === 'secret';
  const visible = (table: string, r: Row) =>
    isAdmin || (table === 'hangouts' ? h.member.has(r.id as string) : h.member.has(r.hangout_id as string));
  return {
    auth: {
      getUser: async (token: string) =>
        token === 'good' ? { data: { user: { id: h.senderId } }, error: null } : { data: { user: null }, error: { message: 'bad' } },
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let mode: 'select' | 'insert' | 'delete' = 'select';
      let wantCount = false;
      let payload: Row = {};
      const rows = () => (h.db[table] ?? []).filter((r) => visible(table, r) && filters.every((f) => f(r)));
      const run = () => {
        if (mode === 'insert') {
          const list = (h.db[table] ??= []);
          if (table === 'push_events' && list.some((r) => r.event === payload.event && r.ref_id === payload.ref_id)) {
            return { data: null, error: { code: '23505' } };
          }
          list.push({ ...payload, created_at: new Date().toISOString() });
          return { data: null, error: null };
        }
        if (mode === 'delete') {
          const gone = new Set(rows());
          h.db[table] = (h.db[table] ?? []).filter((r) => !gone.has(r));
          return { data: null, error: null };
        }
        const found = rows();
        return { data: wantCount ? null : found, count: found.length, error: null };
      };
      const q = {
        select(_c?: string, opts?: { count?: string }) {
          wantCount = !!opts?.count;
          return q;
        },
        eq(c: string, v: unknown) {
          filters.push((r) => r[c] === v);
          return q;
        },
        in(c: string, vs: unknown[]) {
          filters.push((r) => vs.includes(r[c]));
          return q;
        },
        not(c: string) {
          filters.push((r) => r[c] !== null && r[c] !== undefined);
          return q;
        },
        gte(c: string, v: string) {
          filters.push((r) => (r[c] as string) >= v);
          return q;
        },
        insert(row: Row) {
          mode = 'insert';
          payload = row;
          return q;
        },
        delete() {
          mode = 'delete';
          return q;
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve(run()),
      };
      return q;
    },
  };
}
vi.mock('@supabase/supabase-js', () => ({ createClient: (_url: string, key: string) => makeClient(key) }));

import { POST } from './route';

const HID = '11111111-1111-4111-8111-111111111111';
const BILL = '22222222-2222-4222-8222-222222222222';
const TR = '33333333-3333-4333-8333-333333333333';
const P_HOST = 'aaaaaaa1-0000-4000-8000-000000000001';
const P_BUDI = 'aaaaaaa2-0000-4000-8000-000000000002';
const P_SITI = 'aaaaaaa3-0000-4000-8000-000000000003';
const P_TAMU = 'aaaaaaa4-0000-4000-8000-000000000004';
const U_HOST = 'bbbbbbb1-0000-4000-8000-000000000001';
const U_BUDI = 'bbbbbbb2-0000-4000-8000-000000000002';
const U_SITI = 'bbbbbbb3-0000-4000-8000-000000000003';

function resetDb() {
  h.sent.length = 0;
  h.deadEndpoints.clear();
  h.member = new Set([HID]);
  h.senderId = U_HOST;
  h.db = {
    hangouts: [{ id: HID, invite_code: 'ABCD2345' }],
    hangout_participants: [
      { id: P_HOST, hangout_id: HID, name: 'Host', user_id: U_HOST },
      { id: P_BUDI, hangout_id: HID, name: 'Budi', user_id: U_BUDI },
      { id: P_SITI, hangout_id: HID, name: 'Siti', user_id: U_SITI },
      { id: P_TAMU, hangout_id: HID, name: 'Tamu', user_id: null },
    ],
    bills: [{ id: BILL, hangout_id: HID, title: 'Makan malam', status: 'draft', paid_by: P_HOST }],
    bill_shares: [
      { bill_id: BILL, participant_id: P_BUDI, total: 34650 },
      { bill_id: BILL, participant_id: P_SITI, total: 57750 },
    ],
    transfers: [{ id: TR, hangout_id: HID, from_participant: P_BUDI, to_participant: P_HOST, amount: 34650, status: 'paid' }],
    push_events: [],
    push_subscriptions: [
      { user_id: U_HOST, endpoint: 'https://push/host', p256dh: 'k', auth: 'a' },
      { user_id: U_BUDI, endpoint: 'https://push/budi', p256dh: 'k', auth: 'a' },
      { user_id: U_SITI, endpoint: 'https://push/siti', p256dh: 'k', auth: 'a' },
    ],
  };
}

const call = (body: unknown, token: string | null = 'good') =>
  POST(
    new Request('http://localhost/api/push/send', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
const plain = (s: string) => s.replace(/\u00a0/g, ' ');
const sentTo = (endpoint: string) => h.sent.find((s) => s.endpoint === endpoint);

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public';
  process.env.SUPABASE_SECRET_KEY = 'secret';
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'vp';
  process.env.VAPID_PRIVATE_KEY = 'vk';
  resetDb();
});

describe('POST /api/push/send: validasi', () => {
  it('503 bila push belum dikonfigurasi', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect((await call({ hangoutId: HID, event: 'bill_created', refId: BILL })).status).toBe(503);
  });

  it('401 tanpa token atau dengan token yang tidak valid', async () => {
    expect((await call({ hangoutId: HID, event: 'bill_created', refId: BILL }, null)).status).toBe(401);
    expect((await call({ hangoutId: HID, event: 'bill_created', refId: BILL }, 'palsu')).status).toBe(401);
  });

  it('400 untuk JSON rusak, id bukan uuid, atau event yang tidak dikenal', async () => {
    expect((await call('{rusak')).status).toBe(400);
    expect((await call({ hangoutId: 'x', event: 'bill_created', refId: BILL })).status).toBe(400);
    expect((await call({ hangoutId: HID, event: 'bill_created', refId: 'x' })).status).toBe(400);
    expect((await call({ hangoutId: HID, event: 'kirim_teks_bebas', refId: BILL })).status).toBe(400);
    expect(h.db.push_events).toHaveLength(0);
  });

  it('403 bila pengirim bukan anggota hangout', async () => {
    h.member = new Set();
    expect((await call({ hangoutId: HID, event: 'bill_created', refId: BILL })).status).toBe(403);
    expect(h.sent).toHaveLength(0);
  });

  it('404 bila kejadiannya tidak cocok dengan data: status salah atau milik hangout lain', async () => {
    expect((await call({ hangoutId: HID, event: 'bill_finalized', refId: BILL })).status).toBe(404); // masih draft
    h.db.bills[0].status = 'final';
    expect((await call({ hangoutId: HID, event: 'bill_created', refId: BILL })).status).toBe(404); // sudah final
    h.db.bills[0].hangout_id = '99999999-9999-4999-8999-999999999999';
    expect((await call({ hangoutId: HID, event: 'bill_finalized', refId: BILL })).status).toBe(404);
    h.db.transfers[0].status = 'pending';
    expect((await call({ hangoutId: HID, event: 'transfer_paid', refId: TR })).status).toBe(404);
    expect(h.sent).toHaveLength(0);
    expect(h.db.push_events).toHaveLength(0);
  });
});

describe('POST /api/push/send: isi pesan', () => {
  it('bill_created: ke semua peserta ber-akun selain pengirim, tanpa teman tanpa akun', async () => {
    const res = await call({ hangoutId: HID, event: 'bill_created', refId: BILL });
    expect(await res.json()).toEqual({ sent: 2, failed: 0, removed: 0 });
    expect(sentTo('https://push/host')).toBeUndefined();
    const m = sentTo('https://push/budi')!.payload;
    expect(m).toEqual({ title: 'Tagihan baru: Makan malam', body: 'Tandai pesananmu sekarang.', url: '/h/ABCD2345', tag: `${HID}-bill_created` });
    expect(sentTo('https://push/siti')).toBeTruthy();
  });

  it('bill_finalized: tiap orang menerima bagiannya sendiri; yang tidak punya bagian tidak diganggu', async () => {
    h.db.bills[0].status = 'final';
    h.senderId = U_HOST;
    await call({ hangoutId: HID, event: 'bill_finalized', refId: BILL });
    expect(plain(sentTo('https://push/budi')!.payload.body)).toBe('Bagianmu Rp 34.650.');
    expect(plain(sentTo('https://push/siti')!.payload.body)).toBe('Bagianmu Rp 57.750.');
    expect(sentTo('https://push/budi')!.payload.title).toBe('Makan malam sudah final');
  });

  it('bill_finalized: yang bayar tapi tidak punya bagian diberi tahu, dan pengirim sendiri tidak', async () => {
    h.db.bills[0].status = 'final';
    h.senderId = U_BUDI; // Budi memicu; host adalah pembayar tanpa bagian
    await call({ hangoutId: HID, event: 'bill_finalized', refId: BILL });
    expect(sentTo('https://push/budi')).toBeUndefined();
    expect(sentTo('https://push/host')!.payload.body).toBe('Teman-temanmu akan transfer ke kamu.');
    expect(plain(sentTo('https://push/siti')!.payload.body)).toBe('Bagianmu Rp 57.750.');
  });

  it('transfer_paid: hanya penerima yang diberi tahu, dengan nama pengirim dan jumlahnya', async () => {
    h.senderId = U_BUDI;
    const res = await call({ hangoutId: HID, event: 'transfer_paid', refId: TR });
    expect(await res.json()).toEqual({ sent: 1, failed: 0, removed: 0 });
    const m = sentTo('https://push/host')!.payload;
    expect(m.title).toBe('Budi sudah transfer');
    expect(plain(m.body)).toBe('Rp 34.650 ke kamu. Buka room untuk konfirmasi.');
    expect(sentTo('https://push/siti')).toBeUndefined();
  });

  it('teks dari klien diabaikan sepenuhnya', async () => {
    await call({ hangoutId: HID, event: 'bill_created', refId: BILL, title: 'HADIAH GRATIS', body: 'klik link', url: 'https://jahat.example' });
    for (const s of h.sent) {
      expect(JSON.stringify(s.payload)).not.toMatch(/HADIAH|klik link|jahat/);
      expect(s.payload.url).toBe('/h/ABCD2345');
    }
  });
});

describe('POST /api/push/send: anti-ganda, batas frekuensi, dan perawatan', () => {
  it('kejadian yang sama hanya dikirim sekali, siapa pun yang memicunya', async () => {
    const first = await call({ hangoutId: HID, event: 'bill_created', refId: BILL });
    expect((await first.json()).sent).toBe(2);
    h.sent.length = 0;
    h.senderId = U_SITI;
    const again = await call({ hangoutId: HID, event: 'bill_created', refId: BILL });
    expect(await again.json()).toEqual({ sent: 0, failed: 0, removed: 0, duplicate: true });
    expect(h.sent).toHaveLength(0);
    expect(h.db.push_events).toHaveLength(1);
  });

  it('429 bila hangout sudah memicu 10 kejadian dalam semenit terakhir', async () => {
    const now = new Date().toISOString();
    h.db.push_events = Array.from({ length: 10 }, (_, i) => ({
      event: 'bill_created',
      ref_id: `44444444-4444-4444-8444-4444444444${String(i).padStart(2, '0')}`,
      hangout_id: HID,
      created_at: now,
    }));
    const res = await call({ hangoutId: HID, event: 'bill_created', refId: BILL });
    expect(res.status).toBe(429);
    expect(h.sent).toHaveLength(0);
    expect(h.db.push_events).toHaveLength(10);
  });

  it('kejadian lama (lebih dari semenit) tidak ikut dihitung', async () => {
    const old = new Date(Date.now() - 5 * 60_000).toISOString();
    h.db.push_events = Array.from({ length: 10 }, (_, i) => ({
      event: 'bill_created',
      ref_id: `55555555-5555-4555-8555-5555555555${String(i).padStart(2, '0')}`,
      hangout_id: HID,
      created_at: old,
    }));
    expect((await call({ hangoutId: HID, event: 'bill_created', refId: BILL })).status).toBe(200);
  });

  it('langganan yang sudah tidak berlaku (410) dihapus dan dihitung', async () => {
    h.deadEndpoints.add('https://push/budi');
    const res = await call({ hangoutId: HID, event: 'bill_created', refId: BILL });
    expect(await res.json()).toEqual({ sent: 1, failed: 1, removed: 1 });
    expect(h.db.push_subscriptions.map((s) => s.endpoint)).not.toContain('https://push/budi');
  });
});

