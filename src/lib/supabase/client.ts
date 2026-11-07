import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** false => app tetap jalan (kalkulator offline), fitur room/push dinonaktifkan. */
export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/** Singleton klien browser. Panggil hanya dari effect / event handler (bukan saat render server). */
export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}
