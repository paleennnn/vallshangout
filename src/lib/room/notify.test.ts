// @vitest-environment jsdom
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyRoom } from './notify';

const client = (token: string | null) =>
  ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } }) as unknown as SupabaseClient;

afterEach(() => vi.unstubAllGlobals());

describe('notifyRoom', () => {
  it('mengirim hanya jenis kejadian dan id (tanpa teks) dengan token sesi', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await notifyRoom(client('tok'), 'h1', 'bill_finalized', 'b1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/push/send');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ hangoutId: 'h1', event: 'bill_finalized', refId: 'b1' });
  });

  it('tanpa sesi tidak mengirim apa pun', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await notifyRoom(client(null), 'h1', 'bill_created', 'b1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('galat jaringan atau server tidak pernah dilempar ke pemanggil', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(notifyRoom(client('tok'), 'h1', 'transfer_paid', 't1')).resolves.toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(notifyRoom(client('tok'), 'h1', 'transfer_paid', 't1')).resolves.toBeUndefined();
  });
});

