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

/** Tagihan (satu struk) di dalam hangout. Angka service/pajak/diskon/pembulatan adalah angka asli struk. */
export interface BillRow {
  id: string;
  hangout_id: string;
  title: string;
  paid_by: string;
  service_pct: number | null;
  tax_pct: number | null;
  service_amount: number;
  tax_amount: number;
  discount_amount: number;
  rounding_amount: number;
  status: 'draft' | 'final';
  created_at: string;
}

export interface BillItemRow {
  id: string;
  bill_id: string;
  name: string;
  unit_price: number;
  qty: number;
  sort_order: number;
  created_at: string;
}

/** Siapa makan item apa; `shares` = jumlah porsi. */
export interface AssignmentRow {
  item_id: string;
  participant_id: string;
  shares: number;
}

/** Hasil hitung per orang, ditulis server saat finalisasi. */
export interface BillShareRow {
  bill_id: string;
  participant_id: string;
  subtotal: number;
  service_amount: number;
  tax_amount: number;
  discount_amount: number;
  rounding_amount: number;
  total: number;
}

export interface TransferRow {
  id: string;
  from_participant: string;
  to_participant: string;
  amount: number;
  status: 'pending' | 'paid' | 'confirmed';
}

export interface BillsBundle {
  bills: BillRow[];
  items: BillItemRow[];
  assignments: AssignmentRow[];
  shares: BillShareRow[];
  transfers: TransferRow[];
}
