import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  rpc: {} as Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }>,
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  sent: [] as { endpoint: string; payload: Record<string, string>; options: Record<string, unknown> }[],
  dead: new Set<string>(),
  seq: 0,
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string, options: Record<string, unknown>) => {
      if (h.dead.has(sub.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 });
      h.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), options });
    }),
  },
}));

/** Query builder palsu yang cukup untuk route admin (select, filter, insert, delete, count, rpc). */
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let mode: 'select' | 'insert' | 'delete' = 'select';
      let wantCount = false;
      let head = false;
      let payload: Row = {};
      let max = Infinity;
      let desc = false;
      const rows = () => {
        let r = (h.db[table] ??= []).filter((x) => filters.every((f) => f(x)));
        if (desc) r = [...r].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return r.slice(0, max);
      };
      const run = () => {
        if (mode === 'insert') {
          const row = { id: `00000000-0000-4000-8000-${String(++h.seq).padStart(12, '0')}`, created_at: new Date().toISOString(), status: 'sending', sent: 0, failed: 0, removed: 0, ...payload };
          (h.db[table] ??= []).push(row);
          payload = row;
          return { data: null, error: null };
        }
        if (mode === 'delete') {
          const gone = new Set(rows());
          h.db[table] = (h.db[table] ?? []).filter((r) => !gone.has(r));
          return { data: null, error: null };
        }
        const found = rows();
        return { data: head ? null : found, count: found.length, error: null };
      };
      const q = {
        select(_c?: string, opts?: { count?: string; head?: boolean }) {
          wantCount = !!opts?.count;
          head = !!opts?.head;
          return q;
        },
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
        lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
        or(expr: string) {
          const terms = expr.split(',').map((t) => t.split('.'));
          filters.push((r) => terms.some(([c, op, v]) => (op === 'eq' ? String(r[c]) === v : Number(r[c]) > Number(v))));
          return q;
        },
        order: (_c: string, o?: { ascending?: boolean }) => ((desc = o?.ascending === false), q),
        limit: (n: number) => ((max = n), q),
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
        single: async () => {
          run();
          return { data: payload, error: null };
        },
        then: (resolve: (v: unknown) => unknown) => resolve(run()),
      };
      void wantCount;
      return q;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      h.rpcCalls.push({ name, args });
      return h.rpc[name]?.(args) ?? { data: null, error: null };
    },
  }),
}));

import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS, verifySessionToken } from '@/lib/admin/session';
import { POST as login } from './login/route';
import { POST as logout } from './logout/route';
import { GET as audience } from './push/audience/route';
import { GET as listCampaigns, POST as createCampaign } from './push/campaigns/route';
import { BATCH_SIZE, POST as sendBatch } from './push/campaigns/[id]/batch/route';
import { POST as sendTest } from './push/test/route';

const PASSWORD = 'kata-sandi-admin-yang-panjang';
const CID = '11111111-1111-4111-8111-111111111111';

function req(path: string, opts: { method?: string; body?: unknown; cookie?: string | null; origin?: string | null; raw?: string } = {}) {
  const method = opts.method ?? 'POST';
  const headers: Record<string, string> = {};
  if (opts.origin !== null && (opts.origin !== undefined || method !== 'GET')) headers.origin = opts.origin ?? 'http://localhost';
  const cookie = opts.cookie === undefined ? `${SESSION_COOKIE}=${createSessionToken()}` : opts.cookie;
  if (cookie) headers.cookie = cookie;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : (opts.raw ?? JSON.stringify(opts.body ?? {})),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const message = { title: 'Yuk nongkrong', body: 'Udah lama ga ketemu, yuk cuss pakai Valls', url: '/' };

beforeEach(() => {
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'secret';
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'vp';
  process.env.VAPID_PRIVATE_KEY = 'vk';
  h.db = { admin_login_failures: [], push_campaigns: [], push_subscriptions: [] };
  h.rpc = {};
  h.rpcCalls.length = 0;
  h.sent.length = 0;
  h.dead.clear();
  h.seq = 0;
});

describe('POST /api/admin/login', () => {
  it('kata sandi benar: cookie sesi httpOnly yang valid', async () => {
    const res = await login(req('/api/admin/login', { body: { password: PASSWORD }, cookie: null }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    const token = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))![1];
    expect(verifySessionToken(token)).toBe(true);
    expect(h.db.admin_login_failures).toHaveLength(0);
  });

  it('kata sandi salah: 401 tanpa cookie, dan kegagalan dicatat dengan IP', async () => {
    const r = new Request('http://localhost/api/admin/login', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
      body: JSON.stringify({ password: 'salah-salah-salah' }),
    });
    const res = await login(r);
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(h.db.admin_login_failures).toHaveLength(1);
    expect(h.db.admin_login_failures[0].ip).toBe('203.0.113.9');
  });

  it('10 kegagalan dalam 15 menit: terkunci (429), bahkan untuk kata sandi yang benar', async () => {
    h.db.admin_login_failures = Array.from({ length: 10 }, () => ({ created_at: new Date(Date.now() - 60_000).toISOString(), ip: 'x' }));
    const res = await login(req('/api/admin/login', { body: { password: PASSWORD }, cookie: null }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('900');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('kegagalan lama (lebih dari 15 menit) tidak ikut dihitung', async () => {
    h.db.admin_login_failures = Array.from({ length: 10 }, () => ({ created_at: new Date(Date.now() - 20 * 60_000).toISOString(), ip: 'x' }));
    const res = await login(req('/api/admin/login', { body: { password: PASSWORD }, cookie: null }));
    expect(res.status).toBe(200);
  });

  it('catatan kegagalan lebih dari sehari dibersihkan saat ada kegagalan baru', async () => {
    h.db.admin_login_failures = [{ created_at: new Date(Date.now() - 48 * 3600_000).toISOString(), ip: 'lama' }];
    await login(req('/api/admin/login', { body: { password: 'salah-salah-salah' }, cookie: null }));
    expect(h.db.admin_login_failures.map((r) => r.ip)).not.toContain('lama');
  });

  it('admin belum dikonfigurasi, asal lintas situs, atau JSON rusak ditolak', async () => {
    expect((await login(req('/api/admin/login', { body: { password: PASSWORD }, origin: 'https://evil.example' }))).status).toBe(403);
    expect((await login(req('/api/admin/login', { body: { password: PASSWORD }, origin: null }))).status).toBe(403);
    expect((await login(req('/api/admin/login', { raw: '{rusak' }))).status).toBe(400);
    process.env.ADMIN_PASSWORD = 'pendek';
    expect((await login(req('/api/admin/login', { body: { password: 'pendek' } }))).status).toBe(503);
  });
});

describe('POST /api/admin/logout', () => {
  it('menghapus cookie; asal lintas situs ditolak', async () => {
    const res = await logout(req('/api/admin/logout'));
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await logout(req('/api/admin/logout', { origin: 'https://evil.example' }))).status).toBe(403);
  });
});

describe('penjagaan semua endpoint admin', () => {
  const call = (cookie: string | null, over: Parameters<typeof req>[1] = {}) =>
    audience(req('/api/admin/push/audience?audience=all', { method: 'GET', cookie, ...over }));

  it('tanpa cookie, cookie palsu, atau sesi kedaluwarsa: 401', async () => {
    expect((await call(null)).status).toBe(401);
    expect((await call(`${SESSION_COOKIE}=1999999999.palsu`)).status).toBe(401);
    expect((await call(`${SESSION_COOKIE}=${createSessionToken(Date.now() - 9 * 3600_000)}`)).status).toBe(401);
  });

  it('sesi valid lolos', async () => {
    h.rpc.broadcast_audience_count = () => ({ data: [{ devices: 3, users: 2 }], error: null });
    expect((await call(`${SESSION_COOKIE}=${createSessionToken()}`)).status).toBe(200);
  });

  it('permintaan yang mengubah data tanpa Origin yang sama ditolak walau cookie valid', async () => {
    expect((await createCampaign(req('/api/admin/push/campaigns', { body: { ...message, audience: 'all' }, origin: 'https://evil.example' }))).status).toBe(403);
    expect((await createCampaign(req('/api/admin/push/campaigns', { body: { ...message, audience: 'all' }, origin: null }))).status).toBe(403);
    expect((await sendTest(req('/api/admin/push/test', { body: message, origin: 'https://evil.example' }))).status).toBe(403);
    expect((await sendBatch(req(`/api/admin/push/campaigns/${CID}/batch`, { origin: 'https://evil.example' }), ctx(CID))).status).toBe(403);
  });

  it('admin belum dikonfigurasi: 503 untuk semua', async () => {
    delete process.env.ADMIN_PASSWORD;
    expect((await call(null)).status).toBe(503);
  });
});

describe('GET /api/admin/push/audience', () => {
  it('meneruskan audiens dan hari ke database, dan mengembalikan angka', async () => {
    h.rpc.broadcast_audience_count = () => ({ data: [{ devices: '12', users: '9' }], error: null });
    const res = await audience(req('/api/admin/push/audience?audience=inactive&days=30', { method: 'GET' }));
    expect(await res.json()).toEqual({ devices: 12, users: 9 });
    expect(h.rpcCalls[0]).toEqual({ name: 'broadcast_audience_count', args: { p_audience: 'inactive', p_inactive_days: 30 } });
  });

  it('parameter salah: 400 tanpa menyentuh database', async () => {
    expect((await audience(req('/api/admin/push/audience?audience=semua', { method: 'GET' }))).status).toBe(400);
    expect((await audience(req('/api/admin/push/audience?audience=inactive&days=999', { method: 'GET' }))).status).toBe(400);
    expect(h.rpcCalls).toHaveLength(0);
  });
});

describe('/api/admin/push/campaigns', () => {
  const okCounts = () => ({ data: [{ devices: 40, users: 25 }], error: null });
  const create = (body: Record<string, unknown> = {}) =>
    createCampaign(req('/api/admin/push/campaigns', { body: { ...message, audience: 'all', ...body } }));

  it('GET: riwayat terbaru di atas', async () => {
    h.db.push_campaigns = [
      { id: 'a', created_at: '2026-11-01T00:00:00Z', title: 'Lama' },
      { id: 'b', created_at: '2026-11-10T00:00:00Z', title: 'Baru' },
    ];
    const res = await listCampaigns(req('/api/admin/push/campaigns', { method: 'GET' }));
    expect(((await res.json()) as { campaigns: { title: string }[] }).campaigns.map((c) => c.title)).toEqual(['Baru', 'Lama']);
  });

  it('POST: membuat siaran dengan jumlah perangkat sasaran, tanpa mengirim apa pun', async () => {
    h.rpc.broadcast_audience_count = okCounts;
    const res = await create({ audience: 'inactive', days: 21 });
    expect(res.status).toBe(201);
    const { campaign } = (await res.json()) as { campaign: Record<string, unknown> };
    expect(campaign).toMatchObject({ title: 'Yuk nongkrong', audience: 'inactive', inactive_days: 21, recipients: 40, status: 'sending' });
    expect(h.rpcCalls[0].args).toEqual({ p_audience: 'inactive', p_inactive_days: 21 });
    expect(h.sent).toHaveLength(0);
  });

  it('POST: isian salah ditolak 400 dan tidak ada yang tersimpan', async () => {
    h.rpc.broadcast_audience_count = okCounts;
    for (const bad of [{ title: '' }, { body: 'x'.repeat(141) }, { url: 'https://evil.example' }, { audience: 'x' }]) {
      expect((await create(bad)).status).toBe(400);
    }
    expect(h.db.push_campaigns).toHaveLength(0);
  });

  it('POST: tanpa penerima (audiens kosong): 422', async () => {
    h.rpc.broadcast_audience_count = () => ({ data: [{ devices: 0, users: 0 }], error: null });
    expect((await create()).status).toBe(422);
    expect(h.db.push_campaigns).toHaveLength(0);
  });

  it('POST: VAPID belum dikonfigurasi: 503', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect((await create()).status).toBe(503);
  });

  it('POST: jeda 24 jam setelah siaran yang sudah mengirim', async () => {
    h.rpc.broadcast_audience_count = okCounts;
    const created = new Date(Date.now() - 3 * 3600_000).toISOString();
    h.db.push_campaigns = [{ id: 'prev', created_at: created, status: 'done', sent: 30 }];
    const res = await create();
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; retryAt: string };
    expect(body.error).toMatch(/Jeda minimal 24 jam/);
    expect(new Date(body.retryAt).getTime()).toBe(new Date(created).getTime() + 24 * 3600_000);
    expect(h.db.push_campaigns).toHaveLength(1);
  });

  it('POST: siaran yang masih berjalan menyuruh melanjutkan, bukan membuat baru', async () => {
    h.rpc.broadcast_audience_count = okCounts;
    h.db.push_campaigns = [{ id: 'jalan', created_at: new Date(Date.now() - 600_000).toISOString(), status: 'sending', sent: 0 }];
    const res = await create();
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; campaignId: string };
    expect(body.error).toMatch(/Lanjutkan siaran itu/);
    expect(body.campaignId).toBe('jalan');
  });

  it('POST: siaran lama (lebih dari 24 jam) atau yang gagal total tidak menghalangi', async () => {
    h.rpc.broadcast_audience_count = okCounts;
    h.db.push_campaigns = [
      { id: 'lama', created_at: new Date(Date.now() - 30 * 3600_000).toISOString(), status: 'done', sent: 50 },
      { id: 'gagal', created_at: new Date(Date.now() - 2 * 3600_000).toISOString(), status: 'done', sent: 0 },
    ];
    expect((await create()).status).toBe(201);
  });
});

describe('POST /api/admin/push/campaigns/[id]/batch', () => {
  const campaign = { id: CID, title: 'Yuk nongkrong', body: 'Udah lama ga ketemu', url: '/new', status: 'sending', sent: 0, failed: 0, removed: 0 };
  const sub = (n: number) => ({ user_id: `u${n}`, endpoint: `https://push/${n}`, p256dh: 'k', auth: 'a' });
  const run = (id = CID) => sendBatch(req(`/api/admin/push/campaigns/${id}/batch`), ctx(id));

  beforeEach(() => {
    h.db.push_campaigns = [{ ...campaign }];
    h.rpc.campaign_progress = (a) => ({ data: { ...campaign, sent: a.p_sent, failed: a.p_failed, removed: a.p_removed }, error: null });
  });

  it('mengambil satu batch, mengirim payload yang disusun server, dan mencatat hasilnya', async () => {
    h.rpc.claim_campaign_batch = () => ({ data: [sub(1), sub(2), sub(3)], error: null });
    const res = await run();
    expect(await res.json()).toMatchObject({ batch: { sent: 3, failed: 0, removed: 0 }, campaign: { sent: 3 } });
    expect(h.rpcCalls[0]).toEqual({ name: 'claim_campaign_batch', args: { p_id: CID, p_limit: BATCH_SIZE } });
    expect(h.sent.map((s) => s.endpoint)).toEqual(['https://push/1', 'https://push/2', 'https://push/3']);
    expect(h.sent[0].payload).toEqual({ title: 'Yuk nongkrong', body: 'Udah lama ga ketemu', url: '/new', tag: `siaran-${CID}` });
    expect(h.sent[0].options).toMatchObject({ urgency: 'low' });
    expect(h.rpcCalls[1]).toEqual({ name: 'campaign_progress', args: { p_id: CID, p_sent: 3, p_failed: 0, p_removed: 0 } });
  });

  it('teks, tautan, atau audiens yang dikirim bersama permintaan batch diabaikan sepenuhnya', async () => {
    h.rpc.claim_campaign_batch = () => ({ data: [sub(1)], error: null });
    await sendBatch(
      req(`/api/admin/push/campaigns/${CID}/batch`, { body: { title: 'HADIAH GRATIS', body: 'klik link', url: 'https://jahat.example', audience: 'all', p_limit: 100000 } }),
      ctx(CID),
    );
    expect(h.sent[0].payload).toEqual({ title: 'Yuk nongkrong', body: 'Udah lama ga ketemu', url: '/new', tag: `siaran-${CID}` });
    expect(h.rpcCalls[0].args).toEqual({ p_id: CID, p_limit: BATCH_SIZE });
  });

  it('langganan mati (410) dihapus dan dihitung; kegagalan lain hanya dihitung gagal', async () => {
    h.db.push_subscriptions = [sub(1), sub(2), sub(3)];
    h.rpc.claim_campaign_batch = () => ({ data: [sub(1), sub(2), sub(3)], error: null });
    h.dead.add('https://push/2');
    const res = await run();
    expect(await res.json()).toMatchObject({ batch: { sent: 2, failed: 1, removed: 1 } });
    expect(h.db.push_subscriptions.map((s) => s.endpoint)).toEqual(['https://push/1', 'https://push/3']);
    expect(h.rpcCalls[1].args).toMatchObject({ p_sent: 2, p_failed: 1, p_removed: 1 });
  });

  it('batch kosong: tidak ada yang dikirim, status siaran tetap dilaporkan', async () => {
    h.rpc.claim_campaign_batch = () => ({ data: [], error: null });
    const res = await run();
    expect(res.status).toBe(200);
    expect(h.sent).toHaveLength(0);
    expect(h.rpcCalls[1].args).toMatchObject({ p_sent: 0, p_failed: 0, p_removed: 0 });
  });

  it('siaran yang sudah selesai: tidak mengambil batch dan tidak mengirim apa pun', async () => {
    h.db.push_campaigns = [{ ...campaign, status: 'done' }];
    const res = await run();
    expect(await res.json()).toMatchObject({ batch: { sent: 0 }, campaign: { status: 'done' } });
    expect(h.rpcCalls).toHaveLength(0);
    expect(h.sent).toHaveLength(0);
  });

  it('id bukan uuid atau tidak ada: 404', async () => {
    expect((await run('bukan-uuid')).status).toBe(404);
    expect((await run('22222222-2222-4222-8222-222222222222')).status).toBe(404);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it('gagal mengambil batch: 500 dan tidak ada pengiriman', async () => {
    h.rpc.claim_campaign_batch = () => ({ data: null, error: { message: 'boom' } });
    expect((await run()).status).toBe(500);
    expect(h.sent).toHaveLength(0);
  });

  it('tanpa sesi admin: 401 dan tidak menyentuh database', async () => {
    const res = await sendBatch(req(`/api/admin/push/campaigns/${CID}/batch`, { cookie: null }), ctx(CID));
    expect(res.status).toBe(401);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it('VAPID belum dikonfigurasi: 503', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    expect((await run()).status).toBe(503);
  });
});

describe('POST /api/admin/push/test', () => {
  const sub = { endpoint: 'https://push/admin-hp', p256dh: 'k', auth: 'a' };
  const test = (body: Record<string, unknown>) => sendTest(req('/api/admin/push/test', { body }));

  it('mengirim pesan uji hanya ke perangkat itu, dengan teks yang sama seperti siaran', async () => {
    h.db.push_subscriptions = [sub, { endpoint: 'https://push/lain', p256dh: 'k', auth: 'a' }];
    const res = await test({ ...message, endpoint: sub.endpoint });
    expect(await res.json()).toEqual({ sent: 1 });
    expect(h.sent.map((s) => s.endpoint)).toEqual([sub.endpoint]);
    expect(h.sent[0].payload).toMatchObject({ title: 'Yuk nongkrong', url: '/', tag: 'siaran-uji' });
  });

  it('perangkat belum terdaftar: 404 dengan petunjuk', async () => {
    const res = await test({ ...message, endpoint: 'https://push/tidak-ada' });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toMatch(/Aktifkan notifikasi/);
    expect(h.sent).toHaveLength(0);
  });

  it('isian salah atau endpoint bukan https: 400', async () => {
    expect((await test({ ...message, title: '', endpoint: sub.endpoint })).status).toBe(400);
    expect((await test({ ...message, url: 'https://evil.example', endpoint: sub.endpoint })).status).toBe(400);
    expect((await test({ ...message, endpoint: 'http://push/x' })).status).toBe(400);
    expect((await test({ ...message })).status).toBe(400);
  });

  it('push gagal terkirim: 502, dan langganan mati dihapus', async () => {
    h.db.push_subscriptions = [sub];
    h.dead.add(sub.endpoint);
    const res = await test({ ...message, endpoint: sub.endpoint });
    expect(res.status).toBe(502);
    expect(h.db.push_subscriptions).toHaveLength(0);
  });
});
