-- Siaran push dari halaman admin (/admin/push).
--
--   * push_subscriptions.announcements: saklar "pengumuman" per perangkat, terpisah dari notifikasi
--     tagihan dan transfer. Pengguna mengubahnya sendiri lewat policy push_subscriptions_own.
--   * push_campaigns: catatan tiap siaran (audit, progres, dan titik lanjut bila terputus).
--   * admin_login_failures: pembatas percobaan masuk halaman admin.
--   * Fungsi audiens dan pengambilan batch, hanya untuk service_role (secret key di server).
--
-- Tabel dan fungsi di sini tidak bisa diakses peran anon maupun authenticated.

alter table public.push_subscriptions
  add column announcements boolean not null default true;

create table public.push_campaigns (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  title         text not null check (char_length(title) between 1 and 60),
  body          text not null check (char_length(body) between 1 and 140),
  url           text not null default '/'
                check (url like '/%' and url not like '//%' and char_length(url) <= 200),
  audience      text not null check (audience in ('all', 'inactive')),
  inactive_days int check (inactive_days between 1 and 365),
  -- perangkat sasaran saat siaran dibuat; sent + failed + removed bisa berbeda bila langganan berubah
  recipients    int not null default 0,
  sent          int not null default 0,
  failed        int not null default 0,
  removed       int not null default 0,
  -- endpoint terakhir yang sudah diambil; batch berikutnya melanjutkan setelah ini
  cursor        text,
  status        text not null default 'sending' check (status in ('sending', 'done')),
  finished_at   timestamptz,
  check ((audience = 'inactive') = (inactive_days is not null))
);
create index on public.push_campaigns (created_at desc);

create table public.admin_login_failures (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ip         text
);
create index on public.admin_login_failures (created_at desc);

alter table public.push_campaigns enable row level security;       -- tanpa policy: tertutup
alter table public.admin_login_failures enable row level security; -- tanpa policy: tertutup
revoke all on public.push_campaigns, public.admin_login_failures from anon, authenticated;

-- ---------- aktivitas terakhir seorang pengguna ----------
-- Terbaru dari: akun dibuat, hangout yang dibuat atau diikuti berubah, tagihan di hangout yang
-- diikuti berubah. Dipakai untuk audiens "tidak aktif".
create or replace function private.last_activity(p_user uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select greatest(
    (select p.created_at from public.profiles p where p.id = p_user),
    (select max(h.updated_at) from public.hangouts h where h.host_id = p_user),
    (select max(h.updated_at) from public.hangouts h
       join public.hangout_participants hp on hp.hangout_id = h.id where hp.user_id = p_user),
    (select max(hp.created_at) from public.hangout_participants hp where hp.user_id = p_user),
    (select max(b.updated_at) from public.bills b
       join public.hangout_participants hp on hp.hangout_id = b.hangout_id where hp.user_id = p_user)
  );
$$;

-- ---------- audiens ----------
-- Perangkat (langganan) yang menerima pengumuman. 'all' = semua yang saklar pengumumannya hidup;
-- 'inactive' = pemiliknya tidak aktif lebih dari p_inactive_days hari.
create or replace function public.broadcast_audience_count(p_audience text, p_inactive_days int default null)
returns table (devices bigint, users bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_audience not in ('all', 'inactive') then raise exception 'audiens tidak dikenal'; end if;
  if p_audience = 'inactive' and p_inactive_days is null then raise exception 'hari tidak aktif wajib diisi'; end if;
  return query
    select count(*), count(distinct s.user_id)
    from public.push_subscriptions s
    where s.announcements
      and (p_audience = 'all'
           or private.last_activity(s.user_id) < now() - make_interval(days => p_inactive_days));
end $$;

-- ---------- ambil batch berikutnya (atomik) ----------
-- Mengunci baris kampanye, mengambil sampai p_limit perangkat setelah cursor, memajukan cursor,
-- dan menandai selesai bila batch ini yang terakhir. Pengiriman setelahnya bersifat paling banyak
-- sekali: bila server mati di tengah batch, batch itu tidak dikirim ulang (lebih baik terlewat
-- daripada notifikasi ganda). Dua permintaan serentak tidak akan mendapat batch yang sama.
create or replace function public.claim_campaign_batch(p_id uuid, p_limit int default 100)
returns table (user_id uuid, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = '' as $$
declare
  c public.push_campaigns%rowtype;
  v_limit int := greatest(1, least(coalesce(p_limit, 100), 500));
  v_last text;
  v_count int;
begin
  select * into c from public.push_campaigns where id = p_id for update;
  if not found or c.status <> 'sending' then return; end if;

  select max(t.endpoint), count(*) into v_last, v_count
  from (
    select s.endpoint
    from public.push_subscriptions s
    where s.announcements
      and (c.cursor is null or s.endpoint > c.cursor)
      and (c.audience = 'all'
           or private.last_activity(s.user_id) < now() - make_interval(days => c.inactive_days))
    order by s.endpoint
    limit v_limit
  ) t;

  if v_count < v_limit then
    update public.push_campaigns
       set status = 'done', finished_at = now(), cursor = coalesce(v_last, cursor)
     where id = p_id;
  else
    update public.push_campaigns set cursor = v_last where id = p_id;
  end if;

  if v_last is null then return; end if;
  return query
    select s.user_id, s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    where s.announcements
      and (c.cursor is null or s.endpoint > c.cursor)
      and s.endpoint <= v_last
      and (c.audience = 'all'
           or private.last_activity(s.user_id) < now() - make_interval(days => c.inactive_days))
    order by s.endpoint;
end $$;

-- ---------- tambah hasil kirim ke kampanye (atomik) ----------
create or replace function public.campaign_progress(p_id uuid, p_sent int, p_failed int, p_removed int)
returns public.push_campaigns
language sql security definer set search_path = '' as $$
  update public.push_campaigns
     set sent = sent + greatest(p_sent, 0),
         failed = failed + greatest(p_failed, 0),
         removed = removed + greatest(p_removed, 0)
   where id = p_id
  returning *;
$$;

revoke all on function private.last_activity(uuid) from public, anon, authenticated;
revoke all on function public.broadcast_audience_count(text, int) from public, anon, authenticated;
revoke all on function public.claim_campaign_batch(uuid, int) from public, anon, authenticated;
revoke all on function public.campaign_progress(uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.broadcast_audience_count(text, int) to service_role;
grant execute on function public.claim_campaign_batch(uuid, int) to service_role;
grant execute on function public.campaign_progress(uuid, int, int, int) to service_role;
