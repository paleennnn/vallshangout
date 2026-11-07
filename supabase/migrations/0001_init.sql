-- =====================================================================
-- VallsHangout — skema Supabase (Postgres 15+)
--
-- Cara pakai: tempel ke SQL Editor Supabase (sekali jalan di project kosong)
-- atau simpan sebagai supabase/migrations/<timestamp>_init.sql
--
-- Prasyarat di dashboard:
--   Authentication → Sign In / Providers → aktifkan "Allow anonymous sign-ins"
--   Authentication → Attack Protection → aktifkan CAPTCHA (mis. Turnstile),
--   supaya project publik tidak dibanjiri akun anonim.
--
-- Konvensi:
--   * Uang = bigint satuan terkecil (IDR: rupiah utuh, tanpa desimal).
--   * Semua tabel anak hangout membawa kolom hangout_id (sengaja didenormalisasi):
--       - RLS jadi murah (tanpa join)
--       - Realtime bisa difilter:  filter: `hangout_id=eq.<id>`
--       - composite FK menjamin anak & induk selalu di hangout yang sama
--     => saat INSERT ke tabel anak, kirim hangout_id.
--   * Penulisan sensitif lewat RPC: join_*, do_spin, veto_spin, accept_spin,
--     finalize_bill, replace_transfers.
--
-- Urutan: PART 0 util · 1 tabel · 2 view · 3 helper+trigger · 4 RPC ·
--         5 RLS · 6 grants/realtime/seed
-- =====================================================================

-- =====================================================================
-- PART 0 — UTIL
-- =====================================================================
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;   -- helper RLS; TIDAK diekspos ke Data API

-- Kode undangan 8 karakter tanpa karakter membingungkan (tanpa I, O, 0, 1).
create or replace function private.gen_invite_code(len int default 8)
returns text
language plpgsql
volatile
security definer          -- tidak bergantung pada hak akses pemanggil ke schema extensions
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 karakter => tanpa modulo bias
  bytes bytea := extensions.gen_random_bytes(len);
  result text := '';
begin
  for i in 0 .. len - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end $$;

-- Angka acak [0,1) dari CSPRNG (untuk spin wheel).
create or replace function private.random01()
returns double precision
language sql
volatile
security definer
set search_path = ''
as $$
  select ((('x' || encode(extensions.gen_random_bytes(6), 'hex'))::bit(48))::bigint)::double precision
         / 281474976710656.0;   -- 2^48
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- PART 1 — TABEL
-- =====================================================================

-- ---------- Profil (1:1 dengan auth.users, termasuk user anonim) ----------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Anon' check (char_length(display_name) between 1 and 40),
  avatar_emoji text not null default '🙂',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- Circle (grup tetap) ----------
create table public.circles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  emoji       text not null default '🍻',
  invite_code text not null unique default private.gen_invite_code(8),
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

-- ---------- Kategori tempat (2 level: Game > Billiard, dst.) ----------
create table public.place_categories (
  id         smallint generated always as identity primary key,
  slug       text not null unique,
  name       text not null,
  emoji      text not null default '📍',
  parent_id  smallint references public.place_categories (id) on delete cascade,
  sort_order smallint not null default 0
);

-- ---------- Tempat ----------
-- circle_id null  => tempat pribadi pembuatnya
-- circle_id terisi => dibagikan ke semua anggota circle
-- is_public       => disiapkan untuk basis data tax publik (fase 4); sementara selalu false
create table public.places (
  id                   uuid primary key default gen_random_uuid(),
  circle_id            uuid references public.circles (id) on delete cascade,
  created_by           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category_id          smallint not null references public.place_categories (id),
  name                 text not null check (char_length(name) between 1 and 80),
  address              text,
  maps_url             text check (maps_url is null or maps_url ~* '^https?://'),
  lat                  numeric(9, 6) check (lat between -90 and 90),
  lng                  numeric(9, 6) check (lng between -180 and 180),
  price_level          smallint check (price_level between 1 and 4),
  avg_spend_per_person integer check (avg_spend_per_person >= 0),
  hourly_rate          integer check (hourly_rate >= 0),               -- sewa per jam (billiard, PS, futsal)
  service_pct          numeric(5, 2) not null default 0 check (service_pct between 0 and 100),
  tax_pct              numeric(5, 2) not null default 0 check (tax_pct between 0 and 100),
  tax_on_service       boolean not null default true,                  -- pajak dihitung dari (subtotal + service)
  tags                 text[] not null default '{}' check (cardinality(tags) <= 20),
  notes                text,
  is_public            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------- Hangout (room / satu acara nongkrong) ----------
create table public.hangouts (
  id           uuid primary key default gen_random_uuid(),
  circle_id    uuid references public.circles (id) on delete set null,
  host_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title        text not null default 'Nongkrong' check (char_length(title) between 1 and 80),
  status       text not null default 'planning'
               check (status in ('planning', 'deciding', 'ongoing', 'settling', 'done')),
  scheduled_at timestamptz,
  place_id     uuid references public.places (id) on delete set null,   -- tempat terpilih
  invite_code  text not null unique default private.gen_invite_code(8),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Peserta = identitas dalam hangout. user_id null => teman yang cuma diinput nama (tanpa akun).
create table public.hangout_participants (
  id         uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  name       text not null check (char_length(name) between 1 and 40),
  rsvp       text not null default 'going' check (rsvp in ('invited', 'going', 'maybe', 'no')),
  presence   text check (presence in ('otw', 'arrived')),
  created_at timestamptz not null default now(),
  unique (hangout_id, id),        -- target composite FK
  unique (hangout_id, user_id)    -- satu akun satu baris per hangout (NULL boleh banyak)
);

-- ---------- Spin wheel ----------
create table public.spins (
  id          uuid primary key default gen_random_uuid(),
  hangout_id  uuid not null references public.hangouts (id) on delete cascade,
  kind        text not null check (kind in ('place', 'payer', 'custom')),
  options     jsonb not null check (jsonb_typeof(options) = 'array'),  -- snapshot [{label, weight, ref_id}]
  winner_index int not null,
  winner      jsonb not null,
  status      text not null default 'active' check (status in ('active', 'accepted', 'vetoed')),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (id, hangout_id)
);

create table public.spin_vetoes (
  spin_id        uuid not null,
  hangout_id     uuid not null,
  participant_id uuid not null,
  created_at     timestamptz not null default now(),
  primary key (spin_id, participant_id),
  foreign key (spin_id, hangout_id) references public.spins (id, hangout_id) on delete cascade,
  foreign key (hangout_id, participant_id) references public.hangout_participants (hangout_id, id) on delete cascade
);

-- ---------- Bill / split bill ----------
-- Angka service/tax/diskon/pembulatan = angka ASLI di struk (sumber kebenaran).
-- service_pct & tax_pct hanya informasi persen yang dipakai UI untuk mengisi angka.
create table public.bills (
  id              uuid primary key default gen_random_uuid(),
  hangout_id      uuid not null references public.hangouts (id) on delete cascade,
  place_id        uuid references public.places (id) on delete set null,
  title           text not null default 'Tagihan' check (char_length(title) between 1 and 80),
  paid_by         uuid not null,                                   -- peserta yang talangin di kasir
  currency        char(3) not null default 'IDR',
  service_pct     numeric(5, 2),
  tax_pct         numeric(5, 2),
  service_amount  bigint not null default 0 check (service_amount >= 0),
  tax_amount      bigint not null default 0 check (tax_amount >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  rounding_amount bigint not null default 0,                       -- pembulatan struk, boleh negatif
  status          text not null default 'draft' check (status in ('draft', 'final')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, hangout_id),
  foreign key (hangout_id, paid_by) references public.hangout_participants (hangout_id, id)
);

create table public.bill_items (
  id         uuid primary key default gen_random_uuid(),
  hangout_id uuid not null,
  bill_id    uuid not null,
  name       text not null check (char_length(name) between 1 and 100),
  unit_price bigint not null check (unit_price >= 0),
  qty        integer not null default 1 check (qty > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, hangout_id),
  foreign key (bill_id, hangout_id) references public.bills (id, hangout_id) on delete cascade
);

-- Siapa makan item apa. shares = bobot (1 = satu porsi; item patungan bertiga => masing-masing 1).
create table public.bill_item_assignments (
  item_id        uuid not null,
  hangout_id     uuid not null,
  participant_id uuid not null,
  shares         numeric(6, 2) not null default 1 check (shares > 0),
  primary key (item_id, participant_id),
  foreign key (item_id, hangout_id) references public.bill_items (id, hangout_id) on delete cascade,
  foreign key (hangout_id, participant_id) references public.hangout_participants (hangout_id, id) on delete cascade
);

-- Snapshot hasil hitung per orang. Hanya ditulis oleh finalize_bill().
create table public.bill_shares (
  bill_id         uuid not null,
  hangout_id      uuid not null,
  participant_id  uuid not null,
  subtotal        bigint not null default 0,
  service_amount  bigint not null default 0,
  tax_amount      bigint not null default 0,
  discount_amount bigint not null default 0,
  rounding_amount bigint not null default 0,
  total           bigint not null,
  primary key (bill_id, participant_id),
  check (total = subtotal + service_amount + tax_amount - discount_amount + rounding_amount),
  foreign key (bill_id, hangout_id) references public.bills (id, hangout_id) on delete cascade,
  foreign key (hangout_id, participant_id) references public.hangout_participants (hangout_id, id) on delete cascade
);

-- ---------- Rencana pelunasan (siapa transfer berapa ke siapa) ----------
create table public.transfers (
  id               uuid primary key default gen_random_uuid(),
  hangout_id       uuid not null,
  from_participant uuid not null,
  to_participant   uuid not null,
  amount           bigint not null check (amount > 0),
  status           text not null default 'pending' check (status in ('pending', 'paid', 'confirmed')),
  paid_at          timestamptz,
  confirmed_at     timestamptz,
  created_at       timestamptz not null default now(),
  check (from_participant <> to_participant),
  foreign key (hangout_id, from_participant) references public.hangout_participants (hangout_id, id) on delete cascade,
  foreign key (hangout_id, to_participant) references public.hangout_participants (hangout_id, id) on delete cascade
);

-- ---------- Poll (fase 2): swipe tempat & poll jadwal ala When2meet ----------
create table public.polls (
  id         uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  kind       text not null check (kind in ('place', 'datetime')),
  title      text not null check (char_length(title) between 1 and 80),
  status     text not null default 'open' check (status in ('open', 'closed')),
  closes_at  timestamptz,
  created_at timestamptz not null default now(),
  unique (id, hangout_id)
);

create table public.poll_options (
  id         uuid primary key default gen_random_uuid(),
  hangout_id uuid not null,
  poll_id    uuid not null,
  label      text not null check (char_length(label) between 1 and 100),
  place_id   uuid references public.places (id) on delete set null,
  starts_at  timestamptz,
  sort_order integer not null default 0,
  unique (id, hangout_id),
  foreign key (poll_id, hangout_id) references public.polls (id, hangout_id) on delete cascade
);

-- value: 1 = suka / bisa, 0 = netral / kalau terpaksa, -1 = tidak
create table public.poll_votes (
  option_id      uuid not null,
  hangout_id     uuid not null,
  participant_id uuid not null,
  value          smallint not null check (value in (-1, 0, 1)),
  updated_at     timestamptz not null default now(),
  primary key (option_id, participant_id),
  foreign key (option_id, hangout_id) references public.poll_options (id, hangout_id) on delete cascade,
  foreign key (hangout_id, participant_id) references public.hangout_participants (hangout_id, id) on delete cascade
);

-- ---------- Match / skor (fase 3): rivalitas & "yang kalah bayar" ----------
create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  hangout_id    uuid not null references public.hangouts (id) on delete cascade,
  place_id      uuid references public.places (id) on delete set null,
  game          text not null check (char_length(game) between 1 and 40),   -- 'billiard', 'fifa', ...
  played_at     timestamptz not null default now(),
  loser_pays    boolean not null default false,
  stake_bill_id uuid references public.bills (id) on delete set null,       -- bill yang dipertaruhkan
  note          text,
  unique (id, hangout_id)
);

create table public.match_players (
  match_id       uuid not null,
  hangout_id     uuid not null,
  participant_id uuid not null,
  score          integer,
  placement      smallint check (placement >= 1),                            -- 1 = menang
  primary key (match_id, participant_id),
  foreign key (match_id, hangout_id) references public.matches (id, hangout_id) on delete cascade,
  foreign key (hangout_id, participant_id) references public.hangout_participants (hangout_id, id) on delete cascade
);

-- ---------- Web Push untuk PWA ----------
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------- Index untuk FK & pola query umum ----------
create index on public.circle_members (user_id);
create index on public.places (circle_id);
create index on public.places (category_id);
create index on public.places (created_by);
create index on public.hangouts (circle_id);
create index on public.hangouts (host_id);
create index on public.hangouts (place_id);
create index on public.hangout_participants (user_id);
create index on public.spins (hangout_id, created_at desc);
create index on public.bills (hangout_id);
create index on public.bills (paid_by);
create index on public.bill_items (bill_id);
create index on public.bill_item_assignments (participant_id);
create index on public.bill_shares (participant_id);
create index on public.transfers (hangout_id);
create index on public.polls (hangout_id);
create index on public.poll_options (poll_id);
create index on public.poll_votes (participant_id);
create index on public.matches (hangout_id);
create index on public.match_players (participant_id);
create index on public.push_subscriptions (user_id);

do $$
declare t text;
begin
  foreach t in array array['profiles', 'places', 'hangouts', 'bills', 'poll_votes'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

-- =====================================================================
-- PART 2 — VIEW (security_invoker => RLS tabel dasar tetap berlaku)
-- =====================================================================

-- Total per bill: subtotal item + service + tax - diskon + pembulatan.
create view public.bill_totals with (security_invoker = true) as
select b.id as bill_id,
       b.hangout_id,
       coalesce(sum(i.unit_price * i.qty), 0)::bigint as subtotal,
       b.service_amount, b.tax_amount, b.discount_amount, b.rounding_amount,
       (coalesce(sum(i.unit_price * i.qty), 0)
          + b.service_amount + b.tax_amount - b.discount_amount + b.rounding_amount)::bigint as grand_total
from public.bills b
left join public.bill_items i on i.bill_id = b.id
group by b.id;

-- Saldo bersih per peserta (hanya bill final). net > 0 => orang ini harus DITERIMA uangnya,
-- net < 0 => orang ini berutang. Jumlah net satu hangout selalu 0.
create view public.hangout_balances with (security_invoker = true) as
select p.hangout_id,
       p.id as participant_id,
       p.name,
       coalesce(paid.amount, 0)::bigint as paid,
       coalesce(owed.amount, 0)::bigint as owed,
       (coalesce(paid.amount, 0) - coalesce(owed.amount, 0))::bigint as net
from public.hangout_participants p
left join (
  select b.paid_by as participant_id, sum(t.grand_total) as amount
  from public.bills b
  join public.bill_totals t on t.bill_id = b.id
  where b.status = 'final'
  group by b.paid_by
) paid on paid.participant_id = p.id
left join (
  select s.participant_id, sum(s.total) as amount
  from public.bill_shares s
  join public.bills b on b.id = s.bill_id
  where b.status = 'final'
  group by s.participant_id
) owed on owed.participant_id = p.id;

-- Statistik kunjungan per tempat (untuk bobot spin: jarang dikunjungi => peluang naik).
create view public.place_stats with (security_invoker = true) as
select h.place_id,
       h.circle_id,
       count(*)::int as visit_count,
       max(coalesce(h.scheduled_at, h.created_at)) as last_visited_at
from public.hangouts h
where h.place_id is not null and h.status = 'done'
group by h.place_id, h.circle_id;

-- Hasil poll.
create view public.poll_results with (security_invoker = true) as
select o.id as option_id, o.poll_id, o.hangout_id,
       count(*) filter (where v.value = 1)  as yes_count,
       count(*) filter (where v.value = 0)  as maybe_count,
       count(*) filter (where v.value = -1) as no_count,
       coalesce(sum(v.value), 0)::int as score
from public.poll_options o
left join public.poll_votes v on v.option_id = o.id
group by o.id;

-- Papan skor per circle & game (hanya peserta yang punya akun).
create view public.leaderboard with (security_invoker = true) as
select h.circle_id,
       m.game,
       hp.user_id,
       count(*)::int as played,
       (count(*) filter (where mp.placement = 1))::int as wins
from public.match_players mp
join public.matches m on m.id = mp.match_id
join public.hangouts h on h.id = m.hangout_id
join public.hangout_participants hp on hp.id = mp.participant_id
where hp.user_id is not null and h.circle_id is not null
group by h.circle_id, m.game, hp.user_id;

-- =====================================================================
-- PART 3 — FUNGSI HELPER (schema private) & TRIGGER
-- security definer + search_path kosong: aman & tidak memicu rekursi RLS.
-- =====================================================================

create or replace function private.is_circle_member(p_circle uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.circle_members
    where circle_id = p_circle and user_id = (select auth.uid()));
$$;

create or replace function private.is_circle_owner(p_circle uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.circle_members
    where circle_id = p_circle and user_id = (select auth.uid()) and role = 'owner');
$$;

create or replace function private.shares_circle_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.circle_members a
    join public.circle_members b on b.circle_id = a.circle_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user);
$$;

-- Anggota hangout = host, peserta ber-akun, atau anggota circle pemilik hangout.
create or replace function private.is_hangout_member(p_hangout uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.hangouts h
    where h.id = p_hangout
      and (
        h.host_id = (select auth.uid())
        or exists (select 1 from public.hangout_participants hp
                   where hp.hangout_id = h.id and hp.user_id = (select auth.uid()))
        or (h.circle_id is not null and exists (
              select 1 from public.circle_members cm
              where cm.circle_id = h.circle_id and cm.user_id = (select auth.uid())))
      ));
$$;

create or replace function private.is_hangout_host(p_hangout uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.hangouts
    where id = p_hangout and host_id = (select auth.uid()));
$$;

-- Boleh bertindak atas nama peserta? (diri sendiri, atau teman tanpa akun asal anggota hangout)
create or replace function private.can_act_as(p_participant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.hangout_participants hp
    where hp.id = p_participant
      and (hp.user_id = (select auth.uid())
           or (hp.user_id is null and private.is_hangout_member(hp.hangout_id))));
$$;

create or replace function private.bill_is_draft(p_bill uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bills where id = p_bill and status = 'draft');
$$;

create or replace function private.item_is_draft(p_item uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.bill_items i
    join public.bills b on b.id = i.bill_id
    where i.id = p_item and b.status = 'draft');
$$;

-- ---------- Trigger: profil otomatis untuk setiap user baru (termasuk anonim) ----------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''),
                  nullif(new.raw_user_meta_data ->> 'name', ''),
                  'Anon'), 40))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- Trigger: pembuat circle otomatis jadi owner ----------
create or replace function private.add_circle_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.circle_members (circle_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end $$;

create trigger circles_add_owner
  after insert on public.circles
  for each row execute function private.add_circle_owner();

-- ---------- Trigger: host otomatis jadi peserta ----------
create or replace function private.add_host_participant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.hangout_participants (hangout_id, user_id, name)
  values (new.id, new.host_id,
          coalesce((select display_name from public.profiles where id = new.host_id), 'Host'))
  on conflict do nothing;
  return new;
end $$;

create trigger hangouts_add_host
  after insert on public.hangouts
  for each row execute function private.add_host_participant();

-- ---------- Trigger: jaga konsistensi bill ----------
-- final  -> angka/pembayar tidak boleh berubah (buka kembali ke draft dulu)
-- final -> draft : snapshot bill_shares dihapus
-- draft -> final : hanya lewat finalize_bill() (harus sudah ada bill_shares)
create or replace function private.bills_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.hangout_id <> old.hangout_id then
    raise exception 'hangout_id tidak boleh diubah';
  end if;

  if old.status = 'final' and new.status = 'final'
     and (new.paid_by, new.service_amount, new.tax_amount, new.discount_amount, new.rounding_amount)
         is distinct from
         (old.paid_by, old.service_amount, old.tax_amount, old.discount_amount, old.rounding_amount) then
    raise exception 'Bill sudah final. Buka kembali (status = draft) sebelum mengubah angka.';
  end if;

  if old.status = 'final' and new.status = 'draft' then
    delete from public.bill_shares where bill_id = old.id;
  end if;

  if old.status = 'draft' and new.status = 'final'
     and not exists (select 1 from public.bill_shares where bill_id = old.id) then
    raise exception 'Finalisasi bill harus lewat finalize_bill()';
  end if;

  return new;
end $$;

create trigger bills_guard
  before update on public.bills
  for each row execute function private.bills_guard();

-- ---------- Trigger: aturan perubahan status transfer ----------
-- pending -> paid       : oleh pengirim atau host
-- paid/pending -> confirmed : oleh penerima atau host
-- paid -> pending       : oleh pengirim (batal) atau host
create or replace function private.transfers_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_from_user uuid;
  v_to_user   uuid;
  v_host      boolean;
begin
  if v_uid is null then   -- service_role / SQL editor
    return new;
  end if;

  if (new.hangout_id, new.from_participant, new.to_participant, new.amount)
     is distinct from (old.hangout_id, old.from_participant, old.to_participant, old.amount) then
    raise exception 'hanya status transfer yang boleh diubah';
  end if;

  select user_id into v_from_user from public.hangout_participants where id = old.from_participant;
  select user_id into v_to_user   from public.hangout_participants where id = old.to_participant;
  v_host := private.is_hangout_host(old.hangout_id);

  if new.status is distinct from old.status then
    if new.status = 'paid' then
      if not (v_uid = v_from_user or v_host) then
        raise exception 'hanya pengirim atau host yang boleh menandai "sudah transfer"';
      end if;
      new.paid_at := now();
      new.confirmed_at := null;
    elsif new.status = 'confirmed' then
      if not (v_uid = v_to_user or v_host) then
        raise exception 'hanya penerima atau host yang boleh mengonfirmasi';
      end if;
      new.confirmed_at := now();
      new.paid_at := coalesce(old.paid_at, now());
    else  -- kembali ke pending
      if not (v_host or (v_uid = v_from_user and old.status = 'paid')) then
        raise exception 'tidak boleh membatalkan status ini';
      end if;
      new.paid_at := null;
      new.confirmed_at := null;
    end if;
  end if;
  return new;
end $$;

create trigger transfers_guard
  before update on public.transfers
  for each row execute function private.transfers_guard();

-- =====================================================================
-- PART 4 — RPC (dipanggil dari client: supabase.rpc('nama', {...}))
-- =====================================================================

-- Gabung circle lewat kode undangan.
create or replace function public.join_circle(p_code text)
returns public.circles
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.circles;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into c from public.circles where invite_code = upper(trim(p_code));
  if not found then raise exception 'kode circle tidak ditemukan' using errcode = 'P0002'; end if;
  insert into public.circle_members (circle_id, user_id) values (c.id, v_uid) on conflict do nothing;
  return c;
end $$;

-- Pratinjau hangout dari kode undangan (untuk halaman landing link, sebelum gabung).
create or replace function public.preview_hangout(p_code text)
returns table (hangout_id uuid, title text, scheduled_at timestamptz, host_name text, participant_count bigint)
language sql stable security definer set search_path = ''
as $$
  select h.id, h.title, h.scheduled_at, p.display_name,
         (select count(*) from public.hangout_participants hp where hp.hangout_id = h.id)
  from public.hangouts h
  left join public.profiles p on p.id = h.host_id
  where h.invite_code = upper(trim(p_code));
$$;

-- Gabung hangout. p_claim = id peserta "tanpa akun" yang ingin diklaim sebagai dirinya.
create or replace function public.join_hangout(p_code text, p_name text default null, p_claim uuid default null)
returns public.hangouts
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  h      public.hangouts;
  v_name text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select * into h from public.hangouts where invite_code = upper(trim(p_code));
  if not found then raise exception 'kode hangout tidak ditemukan' using errcode = 'P0002'; end if;

  if exists (select 1 from public.hangout_participants where hangout_id = h.id and user_id = v_uid) then
    return h;   -- sudah tergabung
  end if;

  if p_claim is not null then
    update public.hangout_participants
       set user_id = v_uid
     where id = p_claim and hangout_id = h.id and user_id is null;
    if not found then
      raise exception 'peserta itu sudah diklaim orang lain' using errcode = '23505';
    end if;
    return h;
  end if;

  v_name := coalesce(nullif(trim(p_name), ''),
                     (select display_name from public.profiles where id = v_uid),
                     'Anon');
  insert into public.hangout_participants (hangout_id, user_id, name)
  values (h.id, v_uid, left(v_name, 40));
  return h;
end $$;

-- Putar wheel di SERVER (acak CSPRNG + berbobot) supaya semua orang melihat hasil yang sama
-- dan tidak bisa dicurangi dari client.
--   p_options = [{"label":"Cafe A","weight":1.5,"ref_id":"<place uuid>"}, ...]  (2..50 opsi)
create or replace function public.do_spin(p_hangout uuid, p_kind text, p_options jsonb)
returns public.spins
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric := 0;
  v_pick  numeric;
  v_acc   numeric := 0;
  v_idx   int := -1;
  v_i     int := 0;
  v_opt   jsonb;
  v_w     numeric;
  v_row   public.spins;
begin
  if not private.is_hangout_member(p_hangout) then
    raise exception 'bukan anggota hangout' using errcode = '42501';
  end if;
  if p_kind not in ('place', 'payer', 'custom') then
    raise exception 'kind tidak valid';
  end if;
  if jsonb_typeof(p_options) is distinct from 'array'
     or jsonb_array_length(p_options) not between 2 and 50 then
    raise exception 'p_options harus array berisi 2-50 opsi';
  end if;

  for v_opt in select * from jsonb_array_elements(p_options) loop
    v_w := coalesce((v_opt ->> 'weight')::numeric, 1);
    if v_w <= 0 or coalesce(v_opt ->> 'label', '') = '' then
      raise exception 'setiap opsi butuh label dan weight > 0';
    end if;
    v_total := v_total + v_w;
  end loop;

  v_pick := private.random01()::numeric * v_total;

  for v_opt in select * from jsonb_array_elements(p_options) loop
    v_acc := v_acc + coalesce((v_opt ->> 'weight')::numeric, 1);
    if v_pick < v_acc then v_idx := v_i; exit; end if;
    v_i := v_i + 1;
  end loop;
  if v_idx = -1 then v_idx := jsonb_array_length(p_options) - 1; end if;

  insert into public.spins (hangout_id, kind, options, winner_index, winner)
  values (p_hangout, p_kind, p_options, v_idx, p_options -> v_idx)
  returning * into v_row;
  return v_row;
end $$;

-- Veto hasil spin (peserta ber-akun, sekali per spin).
create or replace function public.veto_spin(p_spin uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  s      public.spins;
  v_part uuid;
begin
  select * into s from public.spins where id = p_spin;
  if not found or not private.is_hangout_member(s.hangout_id) then
    raise exception 'spin tidak ditemukan' using errcode = '42501';
  end if;
  if s.status <> 'active' then raise exception 'spin sudah ditutup'; end if;

  select id into v_part from public.hangout_participants
   where hangout_id = s.hangout_id and user_id = (select auth.uid());
  if v_part is null then raise exception 'hanya peserta yang boleh veto'; end if;

  insert into public.spin_vetoes (spin_id, hangout_id, participant_id)
  values (p_spin, s.hangout_id, v_part);
  update public.spins set status = 'vetoed' where id = p_spin;
end $$;

-- Terima hasil spin (host). Untuk kind = 'place' sekalian set hangouts.place_id.
create or replace function public.accept_spin(p_spin uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  s public.spins;
begin
  select * into s from public.spins where id = p_spin;
  if not found or not private.is_hangout_host(s.hangout_id) then
    raise exception 'hanya host yang boleh menerima hasil spin' using errcode = '42501';
  end if;
  if s.status <> 'active' then raise exception 'spin tidak aktif'; end if;

  update public.spins set status = 'accepted' where id = p_spin;
  if s.kind = 'place' and (s.winner ->> 'ref_id') is not null then
    update public.hangouts set place_id = (s.winner ->> 'ref_id')::uuid where id = s.hangout_id;
  end if;
end $$;

-- Finalisasi bill: client menghitung pembagian (alokasi proporsional + largest remainder),
-- server hanya MEMVALIDASI bahwa jumlahnya persis sama dengan struk.
--   p_shares = [{"participant_id":"..","subtotal":..,"service_amount":..,"tax_amount":..,
--                "discount_amount":..,"rounding_amount":..,"total":..}, ...]
create or replace function public.finalize_bill(p_bill uuid, p_shares jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  b          public.bills;
  v_subtotal bigint;
  v_grand    bigint;
  v_sum_tot  bigint;
  v_sum_sub  bigint;
begin
  select * into b from public.bills where id = p_bill for update;
  if not found or not private.is_hangout_member(b.hangout_id) then
    raise exception 'bill tidak ditemukan' using errcode = '42501';
  end if;
  if b.status <> 'draft' then raise exception 'bill sudah final'; end if;

  select coalesce(sum(unit_price * qty), 0) into v_subtotal from public.bill_items where bill_id = p_bill;
  v_grand := v_subtotal + b.service_amount + b.tax_amount - b.discount_amount + b.rounding_amount;

  delete from public.bill_shares where bill_id = p_bill;

  -- FK komposit menolak peserta dari hangout lain; CHECK tabel menjaga total per baris.
  insert into public.bill_shares
    (bill_id, hangout_id, participant_id, subtotal, service_amount, tax_amount,
     discount_amount, rounding_amount, total)
  select p_bill, b.hangout_id, s.participant_id,
         coalesce(s.subtotal, 0), coalesce(s.service_amount, 0), coalesce(s.tax_amount, 0),
         coalesce(s.discount_amount, 0), coalesce(s.rounding_amount, 0), s.total
  from jsonb_to_recordset(p_shares) as s(
    participant_id uuid, subtotal bigint, service_amount bigint, tax_amount bigint,
    discount_amount bigint, rounding_amount bigint, total bigint);

  select coalesce(sum(total), 0), coalesce(sum(subtotal), 0)
    into v_sum_tot, v_sum_sub
    from public.bill_shares where bill_id = p_bill;

  if v_sum_tot <> v_grand then
    raise exception 'jumlah pembagian (%) tidak sama dengan total bill (%)', v_sum_tot, v_grand;
  end if;
  if v_sum_sub <> v_subtotal then
    raise exception 'jumlah subtotal pembagian (%) tidak sama dengan subtotal item (%)', v_sum_sub, v_subtotal;
  end if;

  update public.bills set status = 'final' where id = p_bill;
end $$;

-- Ganti rencana transfer yang masih 'pending'. Server memastikan setelah semua transfer
-- (termasuk yang sudah paid/confirmed) saldo tiap peserta tepat 0.
--   p_transfers = [{"from_participant":"..","to_participant":"..","amount":..}, ...]
create or replace function public.replace_transfers(p_hangout uuid, p_transfers jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_hangout_member(p_hangout) then
    raise exception 'bukan anggota hangout' using errcode = '42501';
  end if;

  delete from public.transfers where hangout_id = p_hangout and status = 'pending';

  insert into public.transfers (hangout_id, from_participant, to_participant, amount)
  select p_hangout, t.from_participant, t.to_participant, t.amount
  from jsonb_to_recordset(coalesce(p_transfers, '[]'::jsonb)) as t(
    from_participant uuid, to_participant uuid, amount bigint);

  if exists (
    select 1
    from public.hangout_balances b
    where b.hangout_id = p_hangout
      and b.net
          + coalesce((select sum(x.amount) from public.transfers x
                      where x.hangout_id = p_hangout and x.from_participant = b.participant_id), 0)
          - coalesce((select sum(x.amount) from public.transfers x
                      where x.hangout_id = p_hangout and x.to_participant = b.participant_id), 0)
          <> 0
  ) then
    raise exception 'rencana transfer tidak melunasi semua saldo';
  end if;
end $$;

-- =====================================================================
-- PART 5 — ROW LEVEL SECURITY
-- User anonim (signInAnonymously) memakai role `authenticated`, jadi semua
-- policy memakai `to authenticated` dan auth.uid(). Role `anon` tidak diberi apa-apa.
-- =====================================================================
alter table public.profiles              enable row level security;
alter table public.circles               enable row level security;
alter table public.circle_members        enable row level security;
alter table public.place_categories      enable row level security;
alter table public.places                enable row level security;
alter table public.hangouts              enable row level security;
alter table public.hangout_participants  enable row level security;
alter table public.spins                 enable row level security;
alter table public.spin_vetoes           enable row level security;
alter table public.bills                 enable row level security;
alter table public.bill_items            enable row level security;
alter table public.bill_item_assignments enable row level security;
alter table public.bill_shares           enable row level security;
alter table public.transfers             enable row level security;
alter table public.polls                 enable row level security;
alter table public.poll_options          enable row level security;
alter table public.poll_votes            enable row level security;
alter table public.matches               enable row level security;
alter table public.match_players         enable row level security;
alter table public.push_subscriptions    enable row level security;

-- ---------- profiles ----------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_circle_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------- circles ----------
-- created_by ikut di select supaya `insert ... returning` oleh pembuat langsung lolos.
create policy circles_select on public.circles for select to authenticated
  using (created_by = (select auth.uid()) or private.is_circle_member(id));
create policy circles_insert on public.circles for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy circles_update on public.circles for update to authenticated
  using (private.is_circle_owner(id)) with check (private.is_circle_owner(id));
create policy circles_delete on public.circles for delete to authenticated
  using (private.is_circle_owner(id));

-- ---------- circle_members (gabung lewat join_circle(), tambah owner lewat trigger) ----------
create policy circle_members_select on public.circle_members for select to authenticated
  using (private.is_circle_member(circle_id));
create policy circle_members_delete on public.circle_members for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_circle_owner(circle_id));

-- ---------- place_categories (read-only) ----------
create policy place_categories_select on public.place_categories for select to authenticated
  using (true);

-- ---------- places ----------
create policy places_select on public.places for select to authenticated
  using (created_by = (select auth.uid())
         or (circle_id is not null and private.is_circle_member(circle_id))
         or is_public);
create policy places_insert on public.places for insert to authenticated
  with check (created_by = (select auth.uid())
              and is_public = false
              and (circle_id is null or private.is_circle_member(circle_id)));
create policy places_update on public.places for update to authenticated
  using (created_by = (select auth.uid())
         or (circle_id is not null and private.is_circle_member(circle_id)))
  with check (is_public = false
              and (circle_id is null or private.is_circle_member(circle_id)));
create policy places_delete on public.places for delete to authenticated
  using (created_by = (select auth.uid())
         or (circle_id is not null and private.is_circle_owner(circle_id)));

-- ---------- hangouts ----------
create policy hangouts_select on public.hangouts for select to authenticated
  using (host_id = (select auth.uid()) or private.is_hangout_member(id));
create policy hangouts_insert on public.hangouts for insert to authenticated
  with check (host_id = (select auth.uid())
              and (circle_id is null or private.is_circle_member(circle_id)));
create policy hangouts_update on public.hangouts for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid())
              and (circle_id is null or private.is_circle_member(circle_id)));
create policy hangouts_delete on public.hangouts for delete to authenticated
  using (host_id = (select auth.uid()));

-- ---------- hangout_participants ----------
create policy participants_select on public.hangout_participants for select to authenticated
  using (private.is_hangout_member(hangout_id));
create policy participants_insert on public.hangout_participants for insert to authenticated
  with check (private.is_hangout_member(hangout_id)
              and (user_id is null or user_id = (select auth.uid())));
create policy participants_update on public.hangout_participants for update to authenticated
  using (private.is_hangout_host(hangout_id)
         or user_id = (select auth.uid())
         or (user_id is null and private.is_hangout_member(hangout_id)))
  with check (private.is_hangout_member(hangout_id)
              and (private.is_hangout_host(hangout_id)
                   or user_id = (select auth.uid())
                   or user_id is null));
create policy participants_delete on public.hangout_participants for delete to authenticated
  using (private.is_hangout_host(hangout_id)
         or user_id = (select auth.uid())
         or (user_id is null and private.is_hangout_member(hangout_id)));

-- ---------- spins & vetoes (tulis hanya lewat RPC) ----------
create policy spins_select on public.spins for select to authenticated
  using (private.is_hangout_member(hangout_id));
create policy spin_vetoes_select on public.spin_vetoes for select to authenticated
  using (private.is_hangout_member(hangout_id));

-- ---------- bills ----------
create policy bills_all on public.bills for all to authenticated
  using (private.is_hangout_member(hangout_id))
  with check (private.is_hangout_member(hangout_id));

-- ---------- bill_items & assignments: hanya bisa diubah selagi bill masih draft ----------
create policy bill_items_select on public.bill_items for select to authenticated
  using (private.is_hangout_member(hangout_id));
create policy bill_items_write on public.bill_items for all to authenticated
  using (private.is_hangout_member(hangout_id) and private.bill_is_draft(bill_id))
  with check (private.is_hangout_member(hangout_id) and private.bill_is_draft(bill_id));

create policy bill_assignments_select on public.bill_item_assignments for select to authenticated
  using (private.is_hangout_member(hangout_id));
create policy bill_assignments_write on public.bill_item_assignments for all to authenticated
  using (private.is_hangout_member(hangout_id) and private.item_is_draft(item_id))
  with check (private.is_hangout_member(hangout_id) and private.item_is_draft(item_id));

-- ---------- bill_shares (tulis hanya lewat finalize_bill) ----------
create policy bill_shares_select on public.bill_shares for select to authenticated
  using (private.is_hangout_member(hangout_id));

-- ---------- transfers (dibuat lewat replace_transfers; update status dijaga trigger) ----------
create policy transfers_select on public.transfers for select to authenticated
  using (private.is_hangout_member(hangout_id));
create policy transfers_update on public.transfers for update to authenticated
  using (private.is_hangout_member(hangout_id))
  with check (private.is_hangout_member(hangout_id));

-- ---------- polls, options, matches, match_players: anggota hangout bebas CRUD ----------
do $$
declare t text;
begin
  foreach t in array array['polls', 'poll_options', 'matches', 'match_players'] loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (private.is_hangout_member(hangout_id))
         with check (private.is_hangout_member(hangout_id))',
      t || '_member_all', t);
  end loop;
end $$;

-- ---------- poll_votes: hanya boleh memilih atas nama sendiri / teman tanpa akun ----------
create policy poll_votes_select on public.poll_votes for select to authenticated
  using (private.is_hangout_member(hangout_id));
create policy poll_votes_insert on public.poll_votes for insert to authenticated
  with check (private.is_hangout_member(hangout_id) and private.can_act_as(participant_id));
create policy poll_votes_update on public.poll_votes for update to authenticated
  using (private.can_act_as(participant_id))
  with check (private.is_hangout_member(hangout_id) and private.can_act_as(participant_id));
create policy poll_votes_delete on public.poll_votes for delete to authenticated
  using (private.can_act_as(participant_id));

-- ---------- push_subscriptions: milik sendiri ----------
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- =====================================================================
-- PART 6 — GRANTS, REALTIME, SEED
-- =====================================================================

-- Role `anon` (tanpa JWT) tidak butuh apa-apa; semua lewat `authenticated`.
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Helper private dipanggil saat policy dievaluasi (sebagai pemanggil).
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- RPC yang boleh dipanggil client.
grant execute on function public.join_circle(text)                  to authenticated;
grant execute on function public.preview_hangout(text)              to authenticated;
grant execute on function public.join_hangout(text, text, uuid)     to authenticated;
grant execute on function public.do_spin(uuid, text, jsonb)         to authenticated;
grant execute on function public.veto_spin(uuid)                    to authenticated;
grant execute on function public.accept_spin(uuid)                  to authenticated;
grant execute on function public.finalize_bill(uuid, jsonb)         to authenticated;
grant execute on function public.replace_transfers(uuid, jsonb)     to authenticated;

-- Realtime: perubahan tabel ini dikirim ke client yang subscribe (RLS tetap berlaku).
-- REPLICA IDENTITY FULL supaya event DELETE membawa hangout_id dan bisa difilter.
do $$
declare t text;
begin
  foreach t in array array[
    'hangout_participants', 'spins', 'spin_vetoes', 'bills', 'bill_items',
    'bill_item_assignments', 'bill_shares', 'transfers', 'polls', 'poll_options',
    'poll_votes', 'matches', 'match_players'
  ] loop
    execute format('alter table public.%I replica identity full', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

-- Seed kategori.
insert into public.place_categories (slug, name, emoji, sort_order) values
  ('cafe',    'Cafe',      '☕', 1),
  ('game',    'Game',      '🎮', 2),
  ('resto',   'Resto',     '🍜', 3),
  ('sport',   'Olahraga',  '🏸', 4),
  ('outdoor', 'Outdoor',   '🌳', 5)
on conflict (slug) do nothing;

insert into public.place_categories (slug, name, emoji, parent_id, sort_order)
select v.slug, v.name, v.emoji, p.id, v.ord
from (values
  ('billiard',    'Billiard',    '🎱', 'game',  1),
  ('playstation', 'PlayStation', '🕹️', 'game',  2),
  ('board-game',  'Board Game',  '🎲', 'game',  3),
  ('karaoke',     'Karaoke',     '🎤', 'game',  4),
  ('bowling',     'Bowling',     '🎳', 'game',  5),
  ('futsal',      'Futsal',      '⚽', 'sport', 1),
  ('badminton',   'Badminton',   '🏸', 'sport', 2)
) as v(slug, name, emoji, parent, ord)
join public.place_categories p on p.slug = v.parent
on conflict (slug) do nothing;

-- =====================================================================
-- CONTOH PEMAKAIAN (supabase-js)
--   await supabase.auth.signInAnonymously()
--   const { data: h } = await supabase.from('hangouts').insert({ title: 'Malming' }).select().single()
--   await supabase.rpc('join_hangout', { p_code: 'K7M2QX9A', p_name: 'Budi' })
--   await supabase.rpc('do_spin', { p_hangout: h.id, p_kind: 'place',
--     p_options: [{ label: 'Cafe A', weight: 1.5, ref_id: placeAId }, { label: 'Cafe B', weight: 1 }] })
--   supabase.channel('room').on('postgres_changes',
--     { event: '*', schema: 'public', table: 'spins', filter: `hangout_id=eq.${h.id}` }, cb).subscribe()
--   // insert anak bill: kirim hangout_id
--   await supabase.from('bill_items').insert({ hangout_id: h.id, bill_id, name: 'Nasi Goreng', unit_price: 28000, qty: 2 })
-- =====================================================================
