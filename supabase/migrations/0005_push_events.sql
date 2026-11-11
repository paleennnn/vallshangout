-- Catatan notifikasi push yang sudah dikirim. Dipakai route /api/push/send untuk:
--   * anti-ganda: satu kejadian (event + ref_id) hanya dikirim sekali, siapa pun yang memicunya;
--   * pembatasan frekuensi per hangout (hitung baris pada menit terakhir).
-- Hanya diakses server dengan secret key (service_role); peran API biasa tidak diberi hak apa pun.

create table public.push_events (
  event       text not null check (event in ('bill_created', 'bill_finalized', 'transfer_paid')),
  ref_id      uuid not null,
  hangout_id  uuid not null references public.hangouts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event, ref_id)
);

create index on public.push_events (hangout_id, created_at desc);

alter table public.push_events enable row level security;   -- tanpa policy: tertutup untuk peran API
revoke all on public.push_events from anon, authenticated;

