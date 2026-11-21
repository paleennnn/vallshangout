import { adminSupabase, guardAdmin, json } from '@/lib/admin/api';
import { validateAudience } from '@/lib/admin/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Jumlah perangkat dan pengguna yang akan menerima siaran untuk audiens tertentu. */
export async function GET(req: Request) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  const params = new URL(req.url).searchParams;
  const audience = validateAudience(params.get('audience'), params.get('days') ?? undefined);
  if (!audience.ok) return json({ error: audience.error }, { status: 400 });

  const admin = adminSupabase();
  if (!admin) return json({ error: 'Penyimpanan belum dikonfigurasi di server.' }, { status: 503 });
  const { data, error } = await admin.rpc('broadcast_audience_count', {
    p_audience: audience.value.audience,
    p_inactive_days: audience.value.days,
  });
  if (error) return json({ error: 'Gagal menghitung audiens.' }, { status: 500 });
  const row = (Array.isArray(data) ? data[0] : data) as { devices?: number | string; users?: number | string } | undefined;
  return json({ devices: Number(row?.devices ?? 0), users: Number(row?.users ?? 0) });
}
