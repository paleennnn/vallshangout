import { adminSupabase, guardAdmin, json } from '@/lib/admin/api';
import { isUuid } from '@/lib/admin/validate';
import { sendWebPush, vapidConfigured, type PushTarget } from '@/lib/push/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Perangkat per permintaan; cukup kecil agar selesai jauh di bawah batas waktu fungsi server. */
export const BATCH_SIZE = 50;

const COLUMNS =
  'id,created_at,title,body,url,audience,inactive_days,recipients,sent,failed,removed,status,finished_at';

/**
 * Mengirim batch berikutnya dari sebuah siaran. Batch diambil secara atomik di database
 * (claim_campaign_batch), jadi dua permintaan serentak tidak pernah mengirim ke perangkat yang
 * sama, dan siaran bisa dilanjutkan bila halaman admin tertutup di tengah jalan.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardAdmin(req);
  if (denied) return denied;
  if (!vapidConfigured()) return json({ error: 'Kunci push (VAPID) belum dikonfigurasi di server.' }, { status: 503 });
  const admin = adminSupabase();
  if (!admin) return json({ error: 'Penyimpanan belum dikonfigurasi di server.' }, { status: 503 });

  const { id } = await context.params;
  if (!isUuid(id)) return json({ error: 'Siaran tidak ditemukan.' }, { status: 404 });

  const { data: campaign } = await admin.from('push_campaigns').select(COLUMNS).eq('id', id).maybeSingle();
  if (!campaign) return json({ error: 'Siaran tidak ditemukan.' }, { status: 404 });
  if (campaign.status === 'done') return json({ campaign, batch: { sent: 0, failed: 0, removed: 0 } });

  const { data: claimed, error: claimErr } = await admin.rpc('claim_campaign_batch', { p_id: id, p_limit: BATCH_SIZE });
  if (claimErr) return json({ error: 'Gagal mengambil batch berikutnya.' }, { status: 500 });
  const targets = ((claimed ?? []) as PushTarget[]).map((t) => ({ endpoint: t.endpoint, p256dh: t.p256dh, auth: t.auth }));

  const result = targets.length
    ? await sendWebPush(targets, { title: campaign.title, body: campaign.body, url: campaign.url, tag: `siaran-${id}` })
    : { sent: 0, failed: 0, dead: [] as string[] };

  if (result.dead.length) await admin.from('push_subscriptions').delete().in('endpoint', result.dead);

  const { data: updated } = await admin.rpc('campaign_progress', {
    p_id: id,
    p_sent: result.sent,
    p_failed: result.failed,
    p_removed: result.dead.length,
  });
  const row = (Array.isArray(updated) ? updated[0] : updated) ?? campaign;
  return json({ campaign: row, batch: { sent: result.sent, failed: result.failed, removed: result.dead.length } });
}
