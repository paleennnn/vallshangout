import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, adminConfigured, readCookie, verifySessionToken } from './session';

/** Semua respons admin tidak boleh disimpan cache (browser maupun CDN). */
export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, { status: init.status, headers: { 'Cache-Control': 'no-store', ...init.headers } });
}

/** Klien Supabase dengan secret key (hanya di server); null bila belum dikonfigurasi. */
export function adminSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Permintaan yang mengubah data harus datang dari halaman kita sendiri (lapisan di atas SameSite=Strict). */
export function isSameOrigin(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

/** Pemeriksaan bersama untuk semua endpoint admin selain login; null bila lolos. */
export function guardAdmin(req: Request): NextResponse | null {
  if (!adminConfigured()) return json({ error: 'Halaman admin belum dikonfigurasi di server.' }, { status: 503 });
  if (!isSameOrigin(req)) return json({ error: 'forbidden' }, { status: 403 });
  if (!verifySessionToken(readCookie(req.headers.get('cookie'), SESSION_COOKIE))) {
    return json({ error: 'Sesi berakhir. Masuk lagi.' }, { status: 401 });
  }
  return null;
}

export const isProduction = () => process.env.NODE_ENV === 'production';
