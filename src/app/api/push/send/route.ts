import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import webpush from 'web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Body {
  hangoutId?: unknown;
  title?: unknown;
  body?: unknown;
  url?: unknown;
}

/**
 * Kirim notifikasi ke SEMUA peserta (ber-akun) sebuah hangout, selain pengirim.
 * Auth: header `Authorization: Bearer <access_token user>`; pengirim wajib anggota hangout
 * (diperiksa lewat RLS dengan token si pengirim). Pembacaan langganan push peserta lain
 * memakai secret key (server-only).
 *
 * TODO sebelum dipakai publik: batasi frekuensi (mis. tabel hitung per hangout per menit).
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

  if (!url || !publicKey || !secretKey || !vapidPublic || !vapidPrivate) {
    return NextResponse.json({ error: 'push belum dikonfigurasi di server' }, { status: 503 });
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'JSON tidak valid' }, { status: 400 });
  }

  const { hangoutId, title, body, url: target } = payload;
  if (typeof hangoutId !== 'string' || !UUID.test(hangoutId)) {
    return NextResponse.json({ error: 'hangoutId tidak valid' }, { status: 400 });
  }
  if (typeof title !== 'string' || !title.trim() || title.length > 80) {
    return NextResponse.json({ error: 'title wajib (maks 80 karakter)' }, { status: 400 });
  }
  if (typeof body !== 'string' || body.length > 200) {
    return NextResponse.json({ error: 'body maks 200 karakter' }, { status: 400 });
  }
  const path =
    typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && target.length <= 200
      ? target
      : '/';

  // 1) Siapa pengirim, dan apakah dia anggota hangout ini? (RLS memutuskan)
  const asUser = createClient(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser(token);
  if (userErr || !userData.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: hangout } = await asUser.from('hangouts').select('id').eq('id', hangoutId).maybeSingle();
  if (!hangout) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // 2) Ambil langganan push semua peserta lain (butuh secret key: RLS membatasi per pemilik).
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: people } = await admin
    .from('hangout_participants')
    .select('user_id')
    .eq('hangout_id', hangoutId)
    .not('user_id', 'is', null);

  const userIds = [...new Set((people ?? []).map((p) => p.user_id as string))].filter(
    (id) => id !== userData.user.id,
  );
  if (userIds.length === 0) return NextResponse.json({ sent: 0, failed: 0, removed: 0 });

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .in('user_id', userIds);

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', vapidPublic, vapidPrivate);
  const message = JSON.stringify({ title: title.trim(), body, url: path, tag: `hangout-${hangoutId}` });

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
          { TTL: 3600 },
        );
        sent++;
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint); // langganan sudah tidak berlaku
      }
    }),
  );

  if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead);
  return NextResponse.json({ sent, failed, removed: dead.length });
}
