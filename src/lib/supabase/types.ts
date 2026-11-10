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
  /** Hanya ada bila kolom ikut dipilih (Room memilih semuanya). */
  host_id?: string;
  place_label?: string | null;
  place_meta?: PlaceMeta | null;
}

export interface Participant {
  id: string;
  name: string;
  rsvp: 'invited' | 'going' | 'maybe' | 'no';
  user_id: string | null;
}

/** Angka tagihan tempat yang ikut tersimpan di hangout (lihat migrasi 0003). */
export interface PlaceMeta {
  service_pct: number;
  tax_pct: number;
  tax_on_service: boolean;
}

/** Satu pilihan pada undian (isi `p_options` untuk rpc do_spin). */
export interface SpinOptionJson {
  label: string;
  weight: number;
  meta?: PlaceMeta;
}

export interface SpinRow {
  id: string;
  hangout_id: string;
  kind: 'place' | 'payer' | 'custom';
  options: SpinOptionJson[];
  winner_index: number;
  winner: SpinOptionJson;
  status: 'active' | 'accepted' | 'vetoed';
  created_by: string | null;
  created_at: string;
}

/** Undian terbaru beserta peserta yang mem-veto-nya. */
export interface SpinState extends SpinRow {
  vetoed_by: string[];
}
