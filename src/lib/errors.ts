/** Pesan galat yang bisa ditampilkan. Galat dari Supabase kadang berupa objek biasa ({ message }), bukan instance Error. */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message || fallback;
  }
  return fallback;
}
