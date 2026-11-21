import { isProduction, isSameOrigin, json } from '@/lib/admin/api';
import { clearSessionCookieHeader } from '@/lib/admin/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: 'forbidden' }, { status: 403 });
  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookieHeader(isProduction()) } });
}
