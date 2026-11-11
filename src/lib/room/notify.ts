import type { SupabaseClient } from '@supabase/supabase-js';

export type PushEvent = 'bill_created' | 'bill_finalized' | 'transfer_paid';

/**
 * Minta server mengirim notifikasi push ke peserta lain atas sebuah kejadian di room.
 * Isi pesan disusun server dari data di database (bukan dari klien), jadi klien hanya menyebut
 * jenis kejadian dan id-nya. Sifatnya "best effort": galat apa pun (offline, push belum
 * dikonfigurasi, kena batas frekuensi) diabaikan agar tidak mengganggu aksi utama.
 */
export async function notifyRoom(
  supabase: SupabaseClient,
  hangoutId: string,
  event: PushEvent,
  refId: string,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hangoutId, event, refId }),
      keepalive: true,
    });
  } catch {
    // sengaja diabaikan
  }
}

