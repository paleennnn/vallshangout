import { adminSupabase, guardAdmin, json } from '@/lib/admin/api';
import { validateMessage } from '@/lib/admin/validate';
import { sendWebPush, vapidConfigured } from '@/lib/push/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Kirim pesan uji ke SATU perangkat (endpoint langganan perangkat admin sendiri), sebelum siaran. */
export async function POST(req: Request) {
  const denied = guardAdmin(req);
  if (denied) return denied;
  if (!vapidConfigured()) return json({ error: 'Kunci push (VAPID) belum dikonfigurasi di server.' }, { status: 503 });
  const admin = adminSupabase();
  if (!admin) return json({ error: 'Penyimpanan belum dikonfigurasi di server.' }, { status: 503 });

  let body: { endpoint?: unknown; title?: unknown; body?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Permintaan tidak valid.' }, { status: 400 });
  }
  const message = validateMessage(body);
  if (!message.ok) return json({ error: message.error }, { status: 400 });
  if (typeof body.endpoint !== 'string' || !body.endpoint.startsWith('https://')) {
    return json({ error: 'Perangkat ini belum mengaktifkan notifikasi.' }, { status: 400 });
  }

  const { data: sub } = await admin
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('endpoint', body.endpoint)
    .maybeSingle();
  if (!sub) {
    return json({ error: 'Perangkat ini belum terdaftar. Aktifkan notifikasi di aplikasi pada perangkat ini dulu.' }, { status: 404 });
  }

  const result = await sendWebPush([sub], { ...message.value, tag: 'siaran-uji' });
  if (result.dead.length) await admin.from('push_subscriptions').delete().in('endpoint', result.dead);
  if (result.sent === 0) return json({ error: 'Pesan uji gagal terkirim. Coba aktifkan ulang notifikasi di perangkat ini.' }, { status: 502 });
  return json({ sent: 1 });
}
