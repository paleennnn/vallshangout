import { adminSupabase, isProduction, isSameOrigin, json } from '@/lib/admin/api';
import { adminConfigured, createSessionToken, passwordMatches, sessionCookieHeader } from '@/lib/admin/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Setelah sekian kegagalan dalam jendela ini, login ditutup sementara (termasuk bagi kata sandi yang benar). */
const MAX_FAILURES = 10;
const WINDOW_MINUTES = 15;

/** Masuk ke halaman admin dengan kata sandi (ADMIN_PASSWORD). Berhasil: cookie sesi httpOnly. */
export async function POST(req: Request) {
  if (!adminConfigured()) return json({ error: 'Halaman admin belum dikonfigurasi di server.' }, { status: 503 });
  if (!isSameOrigin(req)) return json({ error: 'forbidden' }, { status: 403 });
  const admin = adminSupabase();
  if (!admin) return json({ error: 'Penyimpanan belum dikonfigurasi di server.' }, { status: 503 });

  // Pembatas percobaan: dihitung dari tabel karena fungsi server tidak berbagi memori antar permintaan
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await admin.from('admin_login_failures').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if ((count ?? 0) >= MAX_FAILURES) {
    return json(
      { error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${WINDOW_MINUTES} menit.` },
      { status: 429, headers: { 'Retry-After': String(WINDOW_MINUTES * 60) } },
    );
  }

  let password: unknown;
  try {
    password = ((await req.json()) as { password?: unknown }).password;
  } catch {
    return json({ error: 'Permintaan tidak valid.' }, { status: 400 });
  }

  if (!passwordMatches(password)) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 64) ?? null;
    await admin.from('admin_login_failures').insert({ ip });
    // Bersihkan catatan lama sekalian agar tabel tidak menumpuk
    await admin.from('admin_login_failures').delete().lt('created_at', new Date(Date.now() - 24 * 3600_000).toISOString());
    return json({ error: 'Kata sandi salah.' }, { status: 401 });
  }

  return json({ ok: true }, { headers: { 'Set-Cookie': sessionCookieHeader(createSessionToken(), isProduction()) } });
}
