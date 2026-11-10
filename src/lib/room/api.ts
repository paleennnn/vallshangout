import type { SupabaseClient } from '@supabase/supabase-js';
import type { Hangout, Participant, SpinOptionJson, SpinRow, SpinState } from '@/lib/supabase/types';

/**
 * Lapisan data room di atas Supabase. Sengaja tipis: tiap fungsi satu pemanggilan jelas dan
 * melempar Error berpesan manusiawi, supaya UI cukup try/catch.
 */

export const HANGOUT_COLUMNS = 'id,host_id,title,status,scheduled_at,invite_code,place_label,place_meta';
export const MIN_SPIN_OPTIONS = 2;
export const MAX_SPIN_OPTIONS = 20;

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

/** Hangout dengan kode ini bila pemanggil sudah anggotanya (RLS), selain itu null. */
export async function fetchMyHangout(sb: SupabaseClient, code: string): Promise<Hangout | null> {
  const res = await sb.from('hangouts').select(HANGOUT_COLUMNS).eq('invite_code', code).maybeSingle();
  return check(res, 'Gagal memuat hangout') as Hangout | null;
}

export async function fetchParticipants(sb: SupabaseClient, hangoutId: string): Promise<Participant[]> {
  const res = await sb
    .from('hangout_participants')
    .select('id,name,rsvp,user_id')
    .eq('hangout_id', hangoutId)
    .order('created_at');
  return (check(res, 'Gagal memuat peserta') as Participant[] | null) ?? [];
}

/** Undian terbaru di hangout ini beserta siapa saja yang mem-veto-nya. */
export async function fetchLatestSpin(sb: SupabaseClient, hangoutId: string): Promise<SpinState | null> {
  const spinRes = await sb
    .from('spins')
    .select('id,hangout_id,kind,options,winner_index,winner,status,created_by,created_at')
    .eq('hangout_id', hangoutId)
    .order('created_at', { ascending: false })
    .limit(1);
  const spin = (check(spinRes, 'Gagal memuat undian') as SpinRow[] | null)?.[0];
  if (!spin) return null;

  const vetoRes = await sb.from('spin_vetoes').select('participant_id').eq('spin_id', spin.id);
  const vetoes = (check(vetoRes, 'Gagal memuat veto') as { participant_id: string }[] | null) ?? [];
  return { ...spin, vetoed_by: vetoes.map((v) => v.participant_id) };
}

/** Validasi di klien supaya pesan galatnya jelas; server tetap memvalidasi ulang. */
export function validateSpinOptions(options: SpinOptionJson[]): string | null {
  if (options.length < MIN_SPIN_OPTIONS) return `Pilih minimal ${MIN_SPIN_OPTIONS} tempat.`;
  if (options.length > MAX_SPIN_OPTIONS) return `Maksimal ${MAX_SPIN_OPTIONS} tempat.`;
  const seen = new Set<string>();
  for (const o of options) {
    const label = o.label.trim();
    if (!label) return 'Setiap pilihan butuh nama.';
    if (label.length > 80) return 'Nama maksimal 80 karakter.';
    if (!(o.weight > 0) || !Number.isFinite(o.weight)) return 'Bobot harus lebih dari 0.';
    if (seen.has(label.toLowerCase())) return `"${label}" muncul dua kali.`;
    seen.add(label.toLowerCase());
  }
  return null;
}

/** Putar roda di SERVER (acak CSPRNG berbobot). Mengembalikan baris undian beserta pemenangnya. */
export async function startSpin(sb: SupabaseClient, hangoutId: string, options: SpinOptionJson[]): Promise<SpinRow> {
  const problem = validateSpinOptions(options);
  if (problem) throw new Error(problem);
  const res = await sb.rpc('do_spin', {
    p_hangout: hangoutId,
    p_kind: 'place',
    p_options: options.map((o) => ({ ...o, label: o.label.trim() })),
  });
  return check(res, 'Gagal memutar roda') as SpinRow;
}

export async function vetoSpin(sb: SupabaseClient, spinId: string): Promise<void> {
  check(await sb.rpc('veto_spin', { p_spin: spinId }), 'Gagal mem-veto');
}

export async function acceptSpin(sb: SupabaseClient, spinId: string): Promise<void> {
  check(await sb.rpc('accept_spin', { p_spin: spinId }), 'Gagal menerima hasil');
}

/** Host mengosongkan tempat terpilih supaya bisa diundi ulang. */
export async function clearPlace(sb: SupabaseClient, hangoutId: string): Promise<void> {
  const res = await sb
    .from('hangouts')
    .update({ place_id: null, place_label: null, place_meta: null })
    .eq('id', hangoutId)
    .select('id');
  const rows = check(res, 'Gagal mengosongkan tempat') as { id: string }[] | null;
  if (!rows || rows.length === 0) throw new Error('Hanya host yang boleh mengosongkan tempat.');
}

export async function setRsvp(sb: SupabaseClient, participantId: string, rsvp: Participant['rsvp']): Promise<void> {
  const res = await sb.from('hangout_participants').update({ rsvp }).eq('id', participantId).select('id');
  const rows = check(res, 'Gagal mengubah kehadiran') as { id: string }[] | null;
  if (!rows || rows.length === 0) throw new Error('Kehadiran hanya bisa diubah oleh pemiliknya.');
}
