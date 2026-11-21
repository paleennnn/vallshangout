import { adminSupabase, guardAdmin, json } from '@/lib/admin/api';
import { validateCampaign } from '@/lib/admin/validate';
import { vapidConfigured } from '@/lib/push/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Jeda antar siaran: mencegah spam yang membuat pengguna mencabut izin notifikasi seluruhnya. */
export const COOLDOWN_HOURS = 24;

const COLUMNS =
  'id,created_at,title,body,url,audience,inactive_days,recipients,sent,failed,removed,status,finished_at';

/** Riwayat siaran terbaru. */
export async function GET(req: Request) {
  const denied = guardAdmin(req);
  if (denied) return denied;
  const admin = adminSupabase();
  if (!admin) return json({ error: 'Penyimpanan belum dikonfigurasi di server.' }, { status: 503 });
  const { data, error } = await admin.from('push_campaigns').select(COLUMNS).order('created_at', { ascending: false }).limit(10);
  if (error) return json({ error: 'Gagal memuat riwayat.' }, { status: 500 });
  return json({ campaigns: data ?? [] });
}

/**
 * Membuat siaran baru (belum mengirim). Pengiriman dilakukan berkelompok lewat
 * /campaigns/[id]/batch dari halaman admin, jadi satu fungsi server tidak perlu menahan ribuan push.
 */
export async function POST(req: Request) {
  const denied = guardAdmin(req);
  if (denied) return denied;
  if (!vapidConfigured()) return json({ error: 'Kunci push (VAPID) belum dikonfigurasi di server.' }, { status: 503 });
  const admin = adminSupabase();
  if (!admin) return json({ error: 'Penyimpanan belum dikonfigurasi di server.' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Permintaan tidak valid.' }, { status: 400 });
  }
  const input = validateCampaign(body);
  if (!input.ok) return json({ error: input.error }, { status: 400 });

  // Jeda: siaran yang sedang berjalan atau yang sudah mengirim dalam 24 jam terakhir
  const since = new Date(Date.now() - COOLDOWN_HOURS * 3600_000).toISOString();
  const { data: recent } = await admin
    .from('push_campaigns')
    .select('id,created_at,status,sent')
    .gte('created_at', since)
    .or('status.eq.sending,sent.gt.0')
    .order('created_at', { ascending: false })
    .limit(1);
  const last = (recent ?? [])[0] as { id: string; created_at: string; status: string } | undefined;
  if (last) {
    const retryAt = new Date(new Date(last.created_at).getTime() + COOLDOWN_HOURS * 3600_000).toISOString();
    return json(
      {
        error:
          last.status === 'sending'
            ? 'Masih ada siaran yang belum selesai. Lanjutkan siaran itu dari riwayat.'
            : `Siaran terakhir baru saja dikirim. Jeda minimal ${COOLDOWN_HOURS} jam antar siaran.`,
        retryAt,
        campaignId: last.id,
      },
      { status: 429 },
    );
  }

  const { data: counts, error: countErr } = await admin.rpc('broadcast_audience_count', {
    p_audience: input.value.audience,
    p_inactive_days: input.value.days,
  });
  if (countErr) return json({ error: 'Gagal menghitung audiens.' }, { status: 500 });
  const devices = Number(((Array.isArray(counts) ? counts[0] : counts) as { devices?: number | string } | undefined)?.devices ?? 0);
  if (devices === 0) return json({ error: 'Tidak ada perangkat yang cocok dengan audiens ini.' }, { status: 422 });

  const { data: campaign, error } = await admin
    .from('push_campaigns')
    .insert({
      title: input.value.title,
      body: input.value.body,
      url: input.value.url,
      audience: input.value.audience,
      inactive_days: input.value.days,
      recipients: devices,
    })
    .select(COLUMNS)
    .single();
  if (error || !campaign) return json({ error: 'Gagal membuat siaran.' }, { status: 500 });
  return json({ campaign }, { status: 201 });
}
