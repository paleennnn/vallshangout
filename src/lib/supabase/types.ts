/** Bentuk data dari RPC / tabel yang dipakai UI (disederhanakan dari supabase/migrations/0001_init.sql). */
export interface HangoutPreview {
  hangout_id: string;
  title: string;
  scheduled_at: string | null;
  host_name: string | null;
  participant_count: number;
}

export interface Hangout {
  id: string;
  title: string;
  status: 'planning' | 'deciding' | 'ongoing' | 'settling' | 'done';
  scheduled_at: string | null;
  invite_code: string;
}

export interface Participant {
  id: string;
  name: string;
  rsvp: 'invited' | 'going' | 'maybe' | 'no';
  user_id: string | null;
}
